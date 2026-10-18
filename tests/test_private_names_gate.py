import os
import shutil
import stat
import subprocess
import sys
from pathlib import Path

import pytest

from conftest import REPO_ROOT, VALIDATOR_PATH

NAME = "Zephyrine"
HOOK_PATH = REPO_ROOT / "scripts" / "hooks" / "pre-commit"


@pytest.fixture
def pattern_file(tmp_path):
    def write(text: str | bytes) -> Path:
        path = tmp_path / "outside-repo" / "private-names"
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(text, bytes):
            path.write_bytes(text)
        else:
            path.write_text(text, encoding="utf-8")
        return path

    return write


@pytest.fixture
def run_gate(validator, report, plant, tmp_path):
    def run(pattern_text, files: dict[str, str | bytes] | None = None, environ=None):
        env = dict(environ or {})
        if pattern_text is not None:
            path = tmp_path / "outside-repo" / "private-names"
            path.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(pattern_text, bytes):
                path.write_bytes(pattern_text)
            else:
                path.write_text(pattern_text, encoding="utf-8")
            env["AIDEVTEAM_PRIVATE_NAMES_FILE"] = str(path)
        else:
            env.setdefault(
                "AIDEVTEAM_PRIVATE_NAMES_FILE", str(tmp_path / "outside-repo" / "absent")
            )
        relative_paths = []
        for relative_path, content in (files or {}).items():
            target = tmp_path / relative_path
            target.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(content, bytes):
                target.write_bytes(content)
            else:
                target.write_text(content, encoding="utf-8")
            relative_paths.append(relative_path)
        validator.gate_private_names(
            report, root=tmp_path, files=relative_paths, environ=env
        )
        return report

    return run


def everything_emitted(report, capsys) -> str:
    captured = capsys.readouterr()
    return "\n".join([*report.failures, *report.notes, captured.out, captured.err])


def test_planted_content_mention_fails_with_path_line_and_entry_number(
    run_gate, report, capsys
):
    run_gate(
        f"# private names\n\n{NAME}\n",
        {"docs/guide.md": f"first line\nsecond mentions {NAME} here\n"},
    )

    assert report.failures == ["G7 private-names: docs/guide.md:2 matches private-names entry #3"]
    assert NAME not in everything_emitted(report, capsys)


def test_every_matching_entry_is_reported_with_its_own_number(run_gate, report):
    run_gate(f"{NAME}\nre:Zeph\\w+\n", {"docs/guide.md": f"{NAME}\n"})

    assert len(report.failures) == 2
    assert any("entry #1" in failure for failure in report.failures)
    assert any("entry #2" in failure for failure in report.failures)


def test_file_path_containing_the_name_fails_without_printing_the_path(
    run_gate, report, capsys
):
    run_gate(NAME + "\n", {f"docs/{NAME}-notes.md": "harmless\n"})

    assert report.failures == [
        "G7 private-names: a tracked file path matches private-names entry #1"
    ]
    assert NAME not in everything_emitted(report, capsys)


def test_content_is_not_scanned_once_the_path_has_matched(run_gate, report):
    run_gate(NAME + "\n", {f"{NAME}.md": f"{NAME}\n"})

    assert len(report.failures) == 1
    assert ".md:" not in report.failures[0]


@pytest.mark.parametrize("lookalike", ["Zephyrines", "zephyrine", "ZEPHYRINE", "XZephyrine", "Zephyrine_x"])
def test_literal_entry_matches_only_the_exact_case_sensitive_whole_word(
    run_gate, report, lookalike
):
    run_gate(NAME + "\n", {"docs/guide.md": f"the {lookalike} appears\n"})

    assert report.failures == []


@pytest.mark.parametrize("surrounding", ["{} product", "(see {})", "the {}.", "{}"])
def test_literal_entry_matches_the_name_next_to_punctuation(run_gate, report, surrounding):
    run_gate(NAME + "\n", {"docs/guide.md": surrounding.format(NAME) + "\n"})

    assert len(report.failures) == 1


def test_literal_entry_with_regex_metacharacters_is_matched_literally(run_gate, report):
    run_gate("zeph.yrine+\n", {"docs/a.md": "zephXyrine\n", "docs/b.md": "zeph.yrine+\n"})

    assert report.failures == ["G7 private-names: docs/b.md:1 matches private-names entry #1"]


def test_literal_entry_ending_in_a_non_word_character_still_matches(run_gate, report):
    run_gate("Zephyrine-\n", {"docs/guide.md": "a Zephyrine- b\n"})

    assert len(report.failures) == 1


def test_regex_entry_with_lookbehind_lets_the_excepted_phrase_pass(run_gate, report):
    run_gate(
        f"re:(?<!Design )\\b{NAME}\\b\n",
        {"docs/a.md": f"A Design {NAME} is fine\n"},
    )

    assert report.failures == []


def test_regex_entry_with_lookbehind_still_fails_the_plain_use(run_gate, report, capsys):
    run_gate(
        f"re:(?<!Design )\\b{NAME}\\b\n",
        {"docs/a.md": f"the {NAME} product\n"},
    )

    assert report.failures == ["G7 private-names: docs/a.md:1 matches private-names entry #1"]
    assert NAME not in everything_emitted(report, capsys)


def test_regex_entry_can_match_case_insensitively(run_gate, report):
    run_gate(f"re:(?i){NAME}\n", {"docs/a.md": f"shout {NAME.upper()}\n"})

    assert len(report.failures) == 1


def test_ordinary_lowercase_prose_passes_when_only_the_capitalised_name_is_private(
    run_gate, report
):
    run_gate(
        f"re:(?<!Design )(?<!design )\\b{NAME}\\b\n",
        {"docs/a.md": f"the zephyrine in the design {NAME} of a store\n"},
    )

    assert report.failures == []


@pytest.mark.parametrize(
    ("entry", "leaked_fragment"),
    [("re:(unclosed", "unclosed"), ("re:[z-a]", "z-a"), ("re:*bad", "bad")],
)
def test_invalid_pattern_fails_with_its_line_number_and_never_echoes_the_pattern(
    run_gate, report, capsys, entry, leaked_fragment
):
    run_gate(f"# header\n{entry}\n", {"docs/a.md": "clean\n"})

    assert report.failures == ["G7 private-names: private-names line 2: invalid pattern"]
    emitted = everything_emitted(report, capsys)
    assert leaked_fragment not in emitted
    assert "Traceback" not in emitted


def test_empty_regex_entry_is_invalid_because_it_would_match_every_line(run_gate, report):
    run_gate("re:\n", {"docs/a.md": "clean\n"})

    assert report.failures == ["G7 private-names: private-names line 1: invalid pattern"]


def test_regex_entry_matching_the_empty_string_is_invalid(run_gate, report):
    run_gate("re:z*\n", {"docs/a.md": "clean\n"})

    assert report.failures == ["G7 private-names: private-names line 1: invalid pattern"]


def test_invalid_pattern_fails_even_when_the_valid_entries_find_nothing(run_gate, report):
    run_gate(f"{NAME}\nre:(\n", {"docs/a.md": "clean\n"})

    assert len(report.failures) == 1
    assert "line 2" in report.failures[0]


def test_every_invalid_line_is_reported(run_gate, report):
    run_gate("re:(\nre:[\n", {})

    assert report.failures == [
        "G7 private-names: private-names line 1: invalid pattern",
        "G7 private-names: private-names line 2: invalid pattern",
    ]


@pytest.mark.parametrize("contents", ["", "\n\n", "# only a comment\n", "  \n# a\n\n# b\n"])
def test_file_without_entries_is_skipped_rather_than_passed(run_gate, report, contents):
    run_gate(contents, {"docs/a.md": f"{NAME}\n"})

    assert report.failures == []
    assert report.notes == ["G7 private-names: skipped (no entries)"]


def test_missing_file_is_skipped_with_a_note(run_gate, report):
    run_gate(None, {"docs/a.md": f"{NAME}\n"})

    assert report.failures == []
    assert report.notes == ["G7 private-names: skipped (no entries)"]


def test_gate_without_entries_is_recorded_as_skipped_not_passed(run_gate, report):
    run_gate(None, {})

    assert report.skipped == ["G7 private-names"]


def test_gate_with_entries_is_not_recorded_as_skipped(run_gate, report):
    run_gate(NAME + "\n", {"docs/a.md": "clean\n"})

    assert report.skipped == []


def test_summary_says_all_gates_passed_when_none_was_skipped(validator, report):
    report.notes.extend(["G1 a", "G2 b"])

    assert validator.summary_line(report) == "All 2 gates passed."


def test_summary_counts_a_skipped_gate_separately_from_the_passed_ones(validator, report):
    report.notes.extend(["G1 a", "G2 b", "G7 private-names: skipped (no entries)"])
    report.skipped.append("G7 private-names")

    assert validator.summary_line(report) == "2 gates passed, 1 skipped."


def test_checked_entries_are_counted_in_the_note(run_gate, report):
    run_gate(f"# c\n{NAME}\nre:Other\n", {"docs/a.md": "clean\n"})

    assert report.notes == ["G7 private-names: 2 entries checked"]


def test_undecodable_file_is_skipped_without_crashing(run_gate, report):
    run_gate(NAME + "\n", {"assets/blob.bin": b"\xff\xfe\x00" + NAME.encode() + b"\xff"})

    assert report.failures == []


def test_path_of_an_undecodable_file_is_still_checked(run_gate, report, capsys):
    run_gate(NAME + "\n", {f"assets/{NAME}.bin": b"\xff\xfe\x00"})

    assert report.failures == [
        "G7 private-names: a tracked file path matches private-names entry #1"
    ]
    assert NAME not in everything_emitted(report, capsys)


def test_tracked_file_missing_from_the_working_tree_is_skipped(
    validator, report, tmp_path, pattern_file
):
    path = pattern_file(NAME + "\n")

    validator.gate_private_names(
        report,
        root=tmp_path,
        files=["docs/deleted.md"],
        environ={"AIDEVTEAM_PRIVATE_NAMES_FILE": str(path)},
    )

    assert report.failures == []


@pytest.mark.parametrize(
    "contents", [b"\xff\xfe" + NAME.encode(), b"\x80\x81\x82"]
)
def test_undecodable_pattern_file_fails_closed_without_leaking_it(
    run_gate, report, capsys, contents
):
    run_gate(contents, {"docs/a.md": f"{NAME}\n"})

    assert report.failures == ["G7 private-names: private-names file unreadable"]
    assert NAME not in everything_emitted(report, capsys)


def test_pattern_path_that_is_a_directory_fails_closed(validator, report, tmp_path):
    directory = tmp_path / "private-names"
    directory.mkdir()

    validator.gate_private_names(
        report,
        root=tmp_path,
        files=[],
        environ={"AIDEVTEAM_PRIVATE_NAMES_FILE": str(directory)},
    )

    assert report.failures == ["G7 private-names: private-names file unreadable"]


def test_default_pattern_file_is_dot_aidevteam_private_names_under_the_root(
    validator, report, plant, tmp_path
):
    plant(".aidevteam/private-names", NAME + "\n")
    plant("docs/a.md", f"{NAME}\n")

    validator.gate_private_names(report, root=tmp_path, files=["docs/a.md"], environ={})

    assert len(report.failures) == 1


def test_pattern_file_is_never_scanned_even_if_it_appears_among_the_files(
    validator, report, plant, tmp_path
):
    plant(".aidevteam/private-names", NAME + "\n")

    validator.gate_private_names(
        report, root=tmp_path, files=[".aidevteam/private-names"], environ={}
    )

    assert report.failures == []


def test_scan_failure_never_escapes_with_context(validator, report, tmp_path, pattern_file, monkeypatch):
    path = pattern_file(NAME + "\n")

    def explode(*_args, **_kwargs):
        raise RuntimeError(f"boom {NAME}")

    monkeypatch.setattr(validator, "scan_private_names", explode)

    validator.gate_private_names(
        report,
        root=tmp_path,
        files=[],
        environ={"AIDEVTEAM_PRIVATE_NAMES_FILE": str(path)},
    )

    assert report.failures == ["G7 private-names: scan failed"]


def test_vendor_neutrality_rule_still_fails_a_product_named_outside_the_adapter_reference(
    validator, report, plant, tmp_path
):
    skill = plant("claude/skills/x/SKILL.md", "Store it in Praxis.\n")

    validator.gate_vendor_neutrality(report, root=tmp_path, files=[skill])

    assert len(report.failures) == 1
    assert "G7 vendor-neutrality" in report.failures[0]


class ScratchRepo:
    def __init__(self, path: Path):
        self.path = path

    def add(self, relative_path: str, text: str) -> None:
        target = self.path / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
        subprocess.run(["git", "add", relative_path], cwd=self.path, check=True)


@pytest.fixture
def scratch_repo(tmp_path):
    path = tmp_path / "repo"
    (path / "scripts" / "hooks").mkdir(parents=True)
    shutil.copy(VALIDATOR_PATH, path / "scripts" / "validate-framework.py")
    shutil.copy(HOOK_PATH, path / "scripts" / "hooks" / "pre-commit")
    subprocess.run(["git", "init", "-q"], cwd=path, check=True)
    return ScratchRepo(path)


def run_private_names_only(repo: ScratchRepo, patterns: Path | None, poison=None):
    env = {"PATH": os.environ["PATH"], "HOME": str(repo.path)}
    if patterns is not None:
        env["AIDEVTEAM_PRIVATE_NAMES_FILE"] = str(patterns)
    if poison is not None:
        env["PYTHONPATH"] = str(poison)
    return subprocess.run(
        [sys.executable, str(repo.path / "scripts" / "validate-framework.py"), "--private-names-only"],
        cwd=repo.path,
        env=env,
        capture_output=True,
        text=True,
    )


def test_private_names_only_mode_runs_without_importing_yaml(scratch_repo, pattern_file, tmp_path):
    poison = tmp_path / "poison"
    poison.mkdir()
    (poison / "yaml.py").write_text("raise RuntimeError('yaml was imported')\n")
    scratch_repo.add("docs/a.md", "clean\n")

    result = run_private_names_only(scratch_repo, pattern_file(NAME + "\n"), poison=poison)

    assert result.returncode == 0, result.stderr
    assert "yaml was imported" not in result.stdout + result.stderr
    assert "1 entries checked" in result.stdout


def test_private_names_only_mode_runs_no_other_gate(scratch_repo, pattern_file):
    result = run_private_names_only(scratch_repo, pattern_file(NAME + "\n"))

    assert result.returncode == 0, result.stderr
    assert "G1" not in result.stdout
    assert "G3" not in result.stdout


def test_cli_planted_content_mention_exits_nonzero_without_printing_the_name(
    scratch_repo, pattern_file
):
    scratch_repo.add("docs/a.md", f"line\nuses {NAME}\n")

    result = run_private_names_only(scratch_repo, pattern_file(NAME + "\n"))

    assert result.returncode == 1
    assert "docs/a.md:2 matches private-names entry #1" in result.stderr
    assert NAME not in result.stdout + result.stderr


def test_cli_path_match_exits_nonzero_without_printing_the_path(scratch_repo, pattern_file):
    scratch_repo.add(f"docs/{NAME}.md", "clean\n")

    result = run_private_names_only(scratch_repo, pattern_file(NAME + "\n"))

    assert result.returncode == 1
    assert NAME not in result.stdout + result.stderr


def test_cli_invalid_pattern_exits_nonzero_without_traceback_or_pattern(
    scratch_repo, pattern_file
):
    result = run_private_names_only(scratch_repo, pattern_file("re:(unclosed\n"))

    assert result.returncode == 1
    assert "private-names line 1: invalid pattern" in result.stderr
    assert "unclosed" not in result.stdout + result.stderr
    assert "Traceback" not in result.stderr


def test_cli_without_a_file_skips_and_passes(scratch_repo, tmp_path):
    result = run_private_names_only(scratch_repo, tmp_path / "absent")

    assert result.returncode == 0
    assert "skipped (no entries)" in result.stdout
    assert "0 gates passed, 1 skipped." in result.stdout
    assert "All 1 gates passed" not in result.stdout


def run_hook(repo: ScratchRepo, patterns: Path):
    env = {
        "PATH": os.environ["PATH"],
        "HOME": str(repo.path),
        "AIDEVTEAM_PRIVATE_NAMES_FILE": str(patterns),
    }
    return subprocess.run(
        ["sh", "scripts/hooks/pre-commit"],
        cwd=repo.path,
        env=env,
        capture_output=True,
        text=True,
    )


def test_pre_commit_hook_is_an_executable_posix_shell_script():
    first_line = HOOK_PATH.read_text(encoding="utf-8").split("\n")[0]

    assert first_line == "#!/bin/sh"
    assert HOOK_PATH.stat().st_mode & stat.S_IXUSR


def test_pre_commit_hook_blocks_a_commit_that_introduces_a_private_name(
    scratch_repo, pattern_file
):
    scratch_repo.add("docs/a.md", f"uses {NAME}\n")

    result = run_hook(scratch_repo, pattern_file(NAME + "\n"))

    assert result.returncode == 1
    assert NAME not in result.stdout + result.stderr


def test_pre_commit_hook_allows_a_clean_tree(scratch_repo, pattern_file):
    scratch_repo.add("docs/a.md", "clean\n")

    result = run_hook(scratch_repo, pattern_file(NAME + "\n"))

    assert result.returncode == 0, result.stderr
