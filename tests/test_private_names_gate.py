import os
import re
import shutil
import stat
import subprocess
import sys
from pathlib import Path

import pytest

from conftest import REPO_ROOT, VALIDATOR_PATH

NAME = "Zephyrine"
HOOKS_DIR = REPO_ROOT / "scripts" / "hooks"
HOOKS = ["pre-commit", "prepare-commit-msg", "commit-msg"]


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
def run_gate(validator, report, plant, pattern_file, tmp_path):
    def run(pattern_text, files: dict[str, str | bytes] | None = None, environ=None):
        env = dict(environ or {})
        if pattern_text is not None:
            env["AIDEVTEAM_PRIVATE_NAMES_FILE"] = str(pattern_file(pattern_text))
        relative_paths = [plant(path, content) for path, content in (files or {}).items()]
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

    assert report.skipped == ["G7 private-names: skipped (no entries)"]


def test_gate_with_entries_is_not_recorded_as_skipped(run_gate, report):
    run_gate(NAME + "\n", {"docs/a.md": "clean\n"})

    assert report.skipped == []


def test_summary_says_all_gates_passed_when_none_was_skipped(validator, report):
    report.notes.extend(["G1 a", "G2 b"])

    assert validator.summary_line(report) == "All 2 gates passed."


def test_summary_counts_a_skipped_gate_separately_from_the_passed_ones(validator, report):
    report.notes.extend(["G1 a", "G2 b"])
    report.skip("G7 private-names", "skipped (no entries)")

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

    def write(self, relative_path: str, text: str) -> None:
        target = self.path / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")

    def add(self, relative_path: str, text: str) -> None:
        self.write(relative_path, text)
        self.git("add", relative_path)

    def git(self, *args: str, cwd: Path | None = None) -> None:
        subprocess.run(
            ["git", "-c", "user.name=t", "-c", "user.email=t@example.com", *args],
            cwd=cwd or self.path,
            check=True,
            capture_output=True,
        )

    def commit_scripts(self) -> None:
        self.git("add", "--force", "scripts")
        self.git("commit", "-q", "-m", "initial")

    def plant_list(self, text: str) -> None:
        self.write(".aidevteam/private-names", text)

    def add_linked_worktree(self, destination: Path) -> Path:
        self.git("worktree", "add", "-q", str(destination), "-b", "linked")
        return destination


@pytest.fixture
def scratch_repo(tmp_path):
    path = tmp_path / "repo"
    (path / "scripts" / "hooks").mkdir(parents=True)
    shutil.copy(VALIDATOR_PATH, path / "scripts" / "validate-framework.py")
    for hook in HOOKS:
        shutil.copy(HOOKS_DIR / hook, path / "scripts" / "hooks" / hook)
    subprocess.run(["git", "init", "-q"], cwd=path, check=True)
    return ScratchRepo(path)


def run_in(cwd: Path, command: list[str], patterns: Path | None = None, poison=None):
    env = {"PATH": os.environ["PATH"], "HOME": str(cwd)}
    if patterns is not None:
        env["AIDEVTEAM_PRIVATE_NAMES_FILE"] = str(patterns)
    if poison is not None:
        env["PYTHONPATH"] = str(poison)
    return subprocess.run(command, cwd=cwd, env=env, capture_output=True, text=True)


def run_validator(repo: ScratchRepo, *args: str, patterns: Path | None = None, poison=None):
    script = str(repo.path / "scripts" / "validate-framework.py")
    return run_in(repo.path, [sys.executable, script, *args], patterns, poison)


def run_private_names_only(repo: ScratchRepo, patterns: Path | None, poison=None):
    return run_validator(repo, "--private-names-only", patterns=patterns, poison=poison)


def run_staged(repo: ScratchRepo, patterns: Path):
    return run_validator(repo, "--private-names-only", "--staged", patterns=patterns)


def output_of(result) -> str:
    return result.stdout + result.stderr


def test_private_names_only_mode_runs_without_importing_yaml(scratch_repo, pattern_file, tmp_path):
    poison = tmp_path / "poison"
    poison.mkdir()
    (poison / "yaml.py").write_text("raise RuntimeError('yaml was imported')\n")
    scratch_repo.add("docs/a.md", "clean\n")

    result = run_private_names_only(scratch_repo, pattern_file(NAME + "\n"), poison=poison)

    assert result.returncode == 0, result.stderr
    assert "yaml was imported" not in output_of(result)
    assert "1 entry checked" in result.stdout


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
    assert NAME not in output_of(result)


def test_cli_path_match_exits_nonzero_without_printing_the_path(scratch_repo, pattern_file):
    scratch_repo.add(f"docs/{NAME}.md", "clean\n")

    result = run_private_names_only(scratch_repo, pattern_file(NAME + "\n"))

    assert result.returncode == 1
    assert NAME not in output_of(result)


def test_cli_invalid_pattern_exits_nonzero_without_traceback_or_pattern(
    scratch_repo, pattern_file
):
    result = run_private_names_only(scratch_repo, pattern_file("re:(unclosed\n"))

    assert result.returncode == 1
    assert "private-names line 1: invalid pattern" in result.stderr
    assert "unclosed" not in output_of(result)
    assert "Traceback" not in result.stderr


def test_cli_without_a_file_skips_and_passes(scratch_repo):
    result = run_private_names_only(scratch_repo, None)

    assert result.returncode == 0
    assert "skipped (no entries)" in result.stdout
    assert "0 gates passed, 1 skipped." in result.stdout
    assert "All 1 gates passed" not in result.stdout


def test_cli_labels_a_skipped_gate_skip_and_a_checked_gate_ok(scratch_repo, pattern_file):
    skipped = run_private_names_only(scratch_repo, None)
    checked = run_private_names_only(scratch_repo, pattern_file(NAME + "\n"))

    assert "  skip G7 private-names: skipped (no entries)" in skipped.stdout
    assert "  ok   G7 private-names: 1 entry checked" in checked.stdout


def test_explicitly_configured_file_that_does_not_exist_fails_without_printing_the_path(
    validator, report, tmp_path, capsys
):
    missing = tmp_path / f"{NAME}-list"

    validator.gate_private_names(
        report,
        root=tmp_path,
        files=[],
        environ={"AIDEVTEAM_PRIVATE_NAMES_FILE": str(missing)},
    )

    assert report.failures == [
        "G7 private-names: private-names file not found at the configured path"
    ]
    assert NAME not in everything_emitted(report, capsys)


def test_cli_with_a_configured_file_that_does_not_exist_exits_nonzero(scratch_repo, tmp_path):
    result = run_private_names_only(scratch_repo, tmp_path / "absent")

    assert result.returncode == 1
    assert "file not found at the configured path" in result.stderr


def test_empty_configured_path_is_treated_as_not_configured(validator, report, tmp_path):
    validator.gate_private_names(
        report, root=tmp_path, files=[], environ={"AIDEVTEAM_PRIVATE_NAMES_FILE": ""}
    )

    assert report.failures == []
    assert report.skipped == ["G7 private-names: skipped (no entries)"]


def test_default_list_is_found_through_the_main_checkout_from_a_linked_worktree(
    scratch_repo, tmp_path
):
    scratch_repo.commit_scripts()
    scratch_repo.plant_list(NAME + "\n")
    linked = scratch_repo.add_linked_worktree(tmp_path / "linked")
    script = str(linked / "scripts" / "validate-framework.py")

    result = run_in(linked, [sys.executable, script, "--private-names-only"])

    assert result.returncode == 0, result.stderr
    assert "1 entry checked" in result.stdout


def test_linked_worktree_default_list_still_flags_a_planted_name(scratch_repo, tmp_path):
    scratch_repo.commit_scripts()
    scratch_repo.plant_list(NAME + "\n")
    linked = scratch_repo.add_linked_worktree(tmp_path / "linked")
    (linked / "notes.md").write_text(f"{NAME}\n", encoding="utf-8")
    scratch_repo.git("add", "notes.md", cwd=linked)
    script = str(linked / "scripts" / "validate-framework.py")

    result = run_in(linked, [sys.executable, script, "--private-names-only"])

    assert result.returncode == 1
    assert "notes.md:1 matches private-names entry #1" in result.stderr


def test_default_list_is_under_the_checkout_root_outside_a_repository(validator, tmp_path):
    assert validator.default_private_names_file(tmp_path) == (
        tmp_path / ".aidevteam" / "private-names"
    )


def test_default_list_is_under_the_checkout_root_in_an_ordinary_repository(
    validator, scratch_repo
):
    assert validator.default_private_names_file(scratch_repo.path) == (
        scratch_repo.path / ".aidevteam" / "private-names"
    )


def test_tracked_documents_under_docs_archive_are_scanned(scratch_repo, pattern_file):
    scratch_repo.add("docs/archive/old.md", f"{NAME}\n")

    result = run_private_names_only(scratch_repo, pattern_file(NAME + "\n"))

    assert result.returncode == 1
    assert "docs/archive/old.md:1 matches private-names entry #1" in result.stderr


def test_tracked_files_can_include_the_archive_for_a_single_check(validator, scratch_repo):
    scratch_repo.add("docs/archive/old.md", "x\n")
    scratch_repo.add("docs/new.md", "x\n")

    assert validator.tracked_files(scratch_repo.path) == ["docs/new.md"]
    assert validator.tracked_files(scratch_repo.path, include_archived=True) == [
        "docs/archive/old.md",
        "docs/new.md",
    ]


def test_staged_mode_flags_a_name_that_is_staged_even_if_the_working_copy_is_clean(
    scratch_repo, pattern_file
):
    scratch_repo.add("docs/a.md", f"uses {NAME}\n")
    scratch_repo.write("docs/a.md", "clean now\n")

    result = run_staged(scratch_repo, pattern_file(NAME + "\n"))

    assert result.returncode == 1
    assert "docs/a.md:1 matches private-names entry #1" in result.stderr
    assert NAME not in output_of(result)


def test_staged_mode_passes_when_the_staged_content_is_clean_but_the_working_copy_is_not(
    scratch_repo, pattern_file
):
    scratch_repo.add("docs/a.md", "clean\n")
    scratch_repo.write("docs/a.md", f"uses {NAME}\n")

    result = run_staged(scratch_repo, pattern_file(NAME + "\n"))

    assert result.returncode == 0, result.stderr


def test_default_mode_still_reads_the_working_copy(scratch_repo, pattern_file):
    scratch_repo.add("docs/a.md", "clean\n")
    scratch_repo.write("docs/a.md", f"uses {NAME}\n")

    result = run_private_names_only(scratch_repo, pattern_file(NAME + "\n"))

    assert result.returncode == 1


def test_staged_mode_flags_a_staged_path_that_carries_the_name_without_printing_it(
    scratch_repo, pattern_file
):
    scratch_repo.add(f"docs/{NAME}.md", "clean\n")

    result = run_staged(scratch_repo, pattern_file(NAME + "\n"))

    assert result.returncode == 1
    assert NAME not in output_of(result)


def test_staged_mode_ignores_files_that_are_not_staged(scratch_repo, pattern_file):
    scratch_repo.add("docs/a.md", "clean\n")
    scratch_repo.write("docs/untracked.md", f"{NAME}\n")

    result = run_staged(scratch_repo, pattern_file(NAME + "\n"))

    assert result.returncode == 0, result.stderr


def test_staged_mode_ignores_a_staged_deletion(scratch_repo, pattern_file):
    scratch_repo.add("docs/a.md", f"{NAME}\n")
    scratch_repo.git("commit", "-q", "-m", "seed")
    scratch_repo.git("rm", "-q", "docs/a.md")

    result = run_staged(scratch_repo, pattern_file(NAME + "\n"))

    assert result.returncode == 0, result.stderr


def test_staged_mode_is_rejected_without_the_private_names_only_mode(scratch_repo):
    result = run_validator(scratch_repo, "--staged")

    assert result.returncode == 2


def run_hook(repo: ScratchRepo, hook: str, patterns: Path, *args: str):
    return run_in(repo.path, ["sh", f"scripts/hooks/{hook}", *args], patterns)


@pytest.mark.parametrize("hook", HOOKS)
def test_hook_is_an_executable_posix_shell_script(hook):
    path = HOOKS_DIR / hook

    assert path.read_text(encoding="utf-8").split("\n")[0] == "#!/bin/sh"
    assert path.stat().st_mode & stat.S_IXUSR


def test_pre_commit_hook_blocks_a_commit_that_stages_a_private_name(scratch_repo, pattern_file):
    scratch_repo.add("docs/a.md", f"uses {NAME}\n")

    result = run_hook(scratch_repo, "pre-commit", pattern_file(NAME + "\n"))

    assert result.returncode == 1
    assert NAME not in output_of(result)


def test_pre_commit_hook_allows_clean_staged_content_despite_a_dirty_working_copy(
    scratch_repo, pattern_file
):
    scratch_repo.add("docs/a.md", "clean\n")
    scratch_repo.write("docs/a.md", f"uses {NAME}\n")

    result = run_hook(scratch_repo, "pre-commit", pattern_file(NAME + "\n"))

    assert result.returncode == 0, result.stderr


def write_message(repo: ScratchRepo, text: str) -> str:
    repo.write("COMMIT_EDITMSG", text)
    return "COMMIT_EDITMSG"


def run_message_check(repo: ScratchRepo, message: str, patterns: Path | None):
    return run_validator(repo, "--private-names-message", message, patterns=patterns)


def test_commit_message_naming_a_private_name_fails_without_printing_it(
    scratch_repo, pattern_file
):
    message = write_message(scratch_repo, f"Add support for {NAME}\n")

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 1
    assert "commit message matches private-names entry #1" in result.stderr
    assert NAME not in output_of(result)


def test_commit_message_comment_lines_are_not_checked(scratch_repo, pattern_file):
    message = write_message(
        scratch_repo, f"Fix the parser\n\n# On branch {NAME}\n#\tmodified:   {NAME}.md\n"
    )

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 0, result.stderr


def test_commit_message_scissors_line_and_the_diff_below_it_are_not_checked(
    scratch_repo, pattern_file
):
    message = write_message(
        scratch_repo,
        "Remove the leaked name\n\n# ------------------------ >8 ------------------------\n"
        f"diff --git a/a.md b/a.md\n-uses {NAME}\n+clean\n",
    )

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 0, result.stderr


def test_commit_message_body_is_still_checked_next_to_comments_and_a_diff(
    scratch_repo, pattern_file
):
    message = write_message(
        scratch_repo,
        f"About {NAME}\n\n# comment\n# ------------------------ >8 ------------------------\n+x\n",
    )

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 1
    assert "commit message matches private-names entry #1" in result.stderr


def test_commit_message_honours_a_configured_comment_character(scratch_repo, pattern_file):
    scratch_repo.git("config", "core.commentChar", ";")
    message = write_message(
        scratch_repo,
        f"Fix\n\n; On branch {NAME}\n; ------------------------ >8 ------------------------\n{NAME}\n",
    )

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 0, result.stderr


def test_commit_message_line_starting_with_the_default_character_is_body_when_another_is_configured(
    scratch_repo, pattern_file
):
    scratch_repo.git("config", "core.commentChar", ";")
    message = write_message(scratch_repo, f"Fix\n\n# {NAME} notes\n")

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 1


def test_commit_message_reads_the_auto_comment_character_from_the_editor_template_line(
    scratch_repo, pattern_file
):
    scratch_repo.git("config", "core.commentChar", "auto")
    message = write_message(
        scratch_repo,
        f"Fix\n\n# Please enter the commit message for your changes.\n# On branch {NAME}\n",
    )

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 0, result.stderr


def test_commit_message_check_is_skipped_without_a_list(scratch_repo):
    message = write_message(scratch_repo, f"{NAME}\n")

    result = run_message_check(scratch_repo, message, None)

    assert result.returncode == 0
    assert output_of(result) == ""


def test_commit_message_check_fails_closed_on_an_invalid_entry(scratch_repo, pattern_file):
    message = write_message(scratch_repo, "Fix\n")

    result = run_message_check(scratch_repo, message, pattern_file("re:(\n"))

    assert result.returncode == 1
    assert "invalid pattern" in result.stderr


def test_commit_message_check_fails_when_the_message_file_cannot_be_read(
    scratch_repo, pattern_file
):
    result = run_message_check(scratch_repo, "no-such-file", pattern_file(NAME + "\n"))

    assert result.returncode == 1
    assert "commit message unreadable" in result.stderr


def test_commit_msg_hook_blocks_a_message_that_names_a_private_name(scratch_repo, pattern_file):
    message = write_message(scratch_repo, f"About {NAME}\n")

    result = run_hook(scratch_repo, "commit-msg", pattern_file(NAME + "\n"), message)

    assert result.returncode == 1
    assert NAME not in output_of(result)


def test_commit_msg_hook_allows_a_clean_message(scratch_repo, pattern_file):
    message = write_message(scratch_repo, "About parsing\n")

    result = run_hook(scratch_repo, "commit-msg", pattern_file(NAME + "\n"), message)

    assert result.returncode == 0, result.stderr


def test_regex_anchored_to_the_start_of_a_line_matches_on_any_line(run_gate, report):
    run_gate(f"re:^{NAME}\n", {"docs/a.md": f"intro\nmiddle\n{NAME} starts this line\n"})

    assert report.failures == ["G7 private-names: docs/a.md:3 matches private-names entry #1"]


def test_every_line_with_a_hit_is_reported_once(run_gate, report):
    run_gate(NAME + "\n", {"docs/a.md": f"{NAME} and {NAME}\nclean\n{NAME}\n"})

    assert report.failures == [
        "G7 private-names: docs/a.md:1 matches private-names entry #1",
        "G7 private-names: docs/a.md:3 matches private-names entry #1",
    ]


def test_a_clean_file_is_searched_once_per_entry_rather_than_once_per_line(
    validator, report, plant, tmp_path
):
    searched = []

    class CountingPattern:
        def search(self, text):
            searched.append(text)

        def finditer(self, text):
            searched.append(text)
            return iter(())

    plant("docs/a.md", "one\ntwo\nthree\n")
    entry = validator.PrivateNameEntry(1, CountingPattern())

    validator.scan_private_names(
        report, tmp_path, [entry], ["docs/a.md"], lambda rel: (tmp_path / rel).read_bytes(), None
    )

    assert [text for text in searched if text.count("\n") > 1] == ["one\ntwo\nthree\n"]


def test_summary_reports_warnings_after_the_passed_count(validator, report):
    report.notes.extend(["G1 a", "G2 b"])
    report.warn("G8 x", "ageing")

    assert validator.summary_line(report) == "All 2 gates passed with 1 warning(s)."


def test_summary_reports_skips_and_warnings_together(validator, report):
    report.notes.append("G1 a")
    report.skip("G7 private-names", "skipped (no entries)")
    report.warn("G8 x", "ageing")

    assert validator.summary_line(report) == "1 gate passed, 1 skipped with 1 warning(s)."


def test_staged_mode_flags_a_symlink_replaced_by_a_regular_file_holding_the_name(
    scratch_repo, pattern_file
):
    (scratch_repo.path / "link").symlink_to("target")
    scratch_repo.git("add", "link")
    scratch_repo.git("commit", "-q", "-m", "seed")
    (scratch_repo.path / "link").unlink()
    scratch_repo.add("link", f"{NAME}\n")

    result = run_staged(scratch_repo, pattern_file(NAME + "\n"))

    assert result.returncode == 1
    assert "link:1 matches private-names entry #1" in result.stderr


def test_linked_worktree_of_a_separate_git_dir_repository_reports_the_list_as_not_found(
    tmp_path,
):
    main = tmp_path / "main"
    main.mkdir()
    subprocess.run(
        ["git", "init", "-q", f"--separate-git-dir={tmp_path / 'store'}", str(main)], check=True
    )
    repo = ScratchRepo(main)
    (main / "scripts").mkdir()
    shutil.copy(VALIDATOR_PATH, main / "scripts" / "validate-framework.py")
    repo.git("add", "scripts")
    repo.git("commit", "-q", "-m", "seed")
    repo.plant_list(NAME + "\n")
    linked = repo.add_linked_worktree(tmp_path / "linked")

    result = run_in(
        linked, [sys.executable, str(linked / "scripts" / "validate-framework.py"), "--private-names-only"]
    )

    assert result.returncode == 0, result.stderr
    assert "skipped (list not found)" in result.stdout


def test_a_gate_that_found_a_hit_does_not_also_report_that_entries_were_checked(
    run_gate, report
):
    run_gate(NAME + "\n", {"docs/a.md": f"{NAME}\n"})

    assert report.notes == []


def test_a_commit_message_that_found_a_hit_does_not_also_report_entries_checked(
    validator, report, plant, pattern_file, tmp_path
):
    message = plant("msg", f"{NAME}\n")

    validator.gate_private_names_message(
        report,
        tmp_path / message,
        root=tmp_path,
        environ={"AIDEVTEAM_PRIVATE_NAMES_FILE": str(pattern_file(NAME + "\n"))},
    )

    assert report.failures and report.notes == []


def test_summary_uses_the_singular_for_a_single_passed_gate(validator, report):
    report.notes.append("G1 a")

    assert validator.summary_line(report) == "All 1 gate passed."


def test_summary_uses_the_plural_for_no_passed_gate(validator, report):
    report.skip("G7 private-names", "skipped (no entries)")

    assert validator.summary_line(report) == "0 gates passed, 1 skipped."


def record_message_source(repo_path: Path, source: str) -> Path:
    shown = subprocess.run(
        ["git", "rev-parse", "--git-path", "aidevteam-commit-msg-source"],
        cwd=repo_path,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    record = repo_path / shown
    record.write_text(source + "\n", encoding="utf-8")
    return record


def test_message_committed_with_dash_m_is_checked_on_every_line_including_hash_lines(
    scratch_repo, pattern_file
):
    record_message_source(scratch_repo.path, "message")
    message = write_message(scratch_repo, f"#1 {NAME} fix\n")

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 1
    assert "commit message matches private-names entry #1" in result.stderr
    assert NAME not in output_of(result)


def test_message_committed_with_dash_m_still_ignores_everything_below_the_scissors_line(
    scratch_repo, pattern_file
):
    record_message_source(scratch_repo.path, "message")
    message = write_message(
        scratch_repo,
        f"Fix\n# ------------------------ >8 ------------------------\n-{NAME}\n",
    )

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("source", ["", "template", "squash"])
def test_message_from_an_editor_template_flow_ignores_comment_lines(
    scratch_repo, pattern_file, source
):
    record_message_source(scratch_repo.path, source)
    message = write_message(scratch_repo, f"Fix\n\n# On branch {NAME}\n")

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 0, result.stderr


def test_the_recorded_message_source_is_consumed_by_the_check(scratch_repo, pattern_file):
    record = record_message_source(scratch_repo.path, "message")
    message = write_message(scratch_repo, "Fix\n")

    run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert not record.exists()


def test_a_stale_record_does_not_change_how_the_next_message_is_read(scratch_repo, pattern_file):
    record_message_source(scratch_repo.path, "message")
    message = write_message(scratch_repo, "Fix\n")
    run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))
    editor_message = write_message(scratch_repo, f"Fix\n\n# On branch {NAME}\n")

    result = run_message_check(scratch_repo, editor_message, pattern_file(NAME + "\n"))

    assert result.returncode == 0, result.stderr


def test_auto_comment_character_is_taken_from_the_scissors_line(scratch_repo, pattern_file):
    scratch_repo.git("config", "core.commentChar", "auto")
    message = write_message(
        scratch_repo,
        f"Fix\n\n; On branch {NAME}\n# {NAME} is body text here\n"
        "; ------------------------ >8 ------------------------\n+x\n",
    )

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 1


def test_auto_comment_character_is_taken_from_the_template_line_so_other_lines_stay_body(
    scratch_repo, pattern_file
):
    scratch_repo.git("config", "core.commentChar", "auto")
    message = write_message(
        scratch_repo,
        f"Fix\n@ {NAME} in the body\n\n; Please enter the commit message for your changes.\n; On branch {NAME}\n",
    )

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 1


def test_auto_comment_character_without_a_scissors_or_template_line_checks_every_line(
    scratch_repo, pattern_file
):
    scratch_repo.git("config", "core.commentChar", "auto")
    message = write_message(scratch_repo, f"Fix\n\n; On branch {NAME}\n")

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 1
    assert NAME not in output_of(result)


def test_prepare_commit_msg_hook_records_the_message_source(scratch_repo):
    result = run_in(
        scratch_repo.path, ["sh", "scripts/hooks/prepare-commit-msg", "COMMIT_EDITMSG", "message"]
    )

    record = record_message_source_path(scratch_repo.path)
    assert result.returncode == 0, result.stderr
    assert record.read_text(encoding="utf-8").strip() == "message"


def test_prepare_commit_msg_hook_records_an_empty_source_for_an_editor_commit(scratch_repo):
    run_in(scratch_repo.path, ["sh", "scripts/hooks/prepare-commit-msg", "COMMIT_EDITMSG"])

    assert record_message_source_path(scratch_repo.path).read_text(encoding="utf-8").strip() == ""


def test_each_linked_worktree_records_its_message_source_separately(scratch_repo, tmp_path):
    scratch_repo.commit_scripts()
    linked = scratch_repo.add_linked_worktree(tmp_path / "linked")

    run_in(linked, ["sh", "scripts/hooks/prepare-commit-msg", "COMMIT_EDITMSG", "message"])

    assert record_message_source_path(linked).exists()
    assert not record_message_source_path(scratch_repo.path).exists()


def record_message_source_path(repo_path: Path) -> Path:
    shown = subprocess.run(
        ["git", "rev-parse", "--git-path", "aidevteam-commit-msg-source"],
        cwd=repo_path,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    return repo_path / shown


class InstalledHooksRepo:
    def __init__(self, repo: ScratchRepo, patterns: Path, tmp_path: Path):
        self.repo = repo
        self.env = {
            "PATH": os.environ["PATH"],
            "HOME": str(repo.path),
            "AIDEVTEAM_PRIVATE_NAMES_FILE": str(patterns),
            "GIT_AUTHOR_NAME": "t",
            "GIT_AUTHOR_EMAIL": "t@example.com",
            "GIT_COMMITTER_NAME": "t",
            "GIT_COMMITTER_EMAIL": "t@example.com",
        }
        self.editor = tmp_path / "editor.sh"
        self.editor.write_text(
            '#!/bin/sh\nprintf "%s\\n\\n" "$EDITOR_SUBJECT" > "$1.new"\ncat "$1" >> "$1.new"\nmv "$1.new" "$1"\n',
            encoding="utf-8",
        )
        self.editor.chmod(0o755)
        subprocess.run(["git", "config", "core.hooksPath", "scripts/hooks"], cwd=repo.path, check=True)

    def git(self, *args: str, subject: str | None = None):
        env = dict(self.env, GIT_EDITOR=str(self.editor), EDITOR_SUBJECT=subject or "Edited subject")
        return subprocess.run(
            ["git", *args], cwd=self.repo.path, env=env, capture_output=True, text=True
        )

    def commit(self, *args: str, subject: str | None = None):
        return self.git("commit", "-q", *args, subject=subject)


@pytest.fixture
def hooked_repo(scratch_repo, pattern_file, tmp_path):
    return InstalledHooksRepo(scratch_repo, pattern_file(NAME + "\n"), tmp_path)


def test_a_real_commit_with_dash_m_and_a_hash_line_naming_a_private_name_is_blocked(hooked_repo):
    hooked_repo.repo.add("a.md", "clean\n")

    result = hooked_repo.commit("-m", f"#42 {NAME} fix")

    assert result.returncode == 1
    assert NAME not in output_of(result)


def test_a_real_commit_with_a_clean_dash_m_message_succeeds(hooked_repo):
    hooked_repo.repo.add("a.md", "clean\n")

    assert hooked_repo.commit("-m", "#42 fix the parser").returncode == 0


def test_a_real_editor_commit_on_a_branch_named_with_a_private_name_passes(hooked_repo):
    hooked_repo.repo.git("checkout", "-q", "-b", f"feature/{NAME}")
    hooked_repo.repo.add("a.md", "clean\n")

    result = hooked_repo.commit()

    assert result.returncode == 0, output_of(result)


def test_a_real_verbose_editor_commit_that_removes_a_name_passes(hooked_repo):
    hooked_repo.repo.add("a.md", f"uses {NAME}\n")
    assert hooked_repo.commit("--no-verify", "-m", "seed").returncode == 0
    hooked_repo.repo.add("a.md", "clean again\n")

    result = hooked_repo.commit("-v")

    assert result.returncode == 0, output_of(result)


def test_a_real_editor_commit_with_a_private_name_in_the_subject_is_blocked(hooked_repo):
    hooked_repo.repo.add("a.md", "clean\n")

    result = hooked_repo.commit(subject=f"About {NAME}")

    assert result.returncode == 1
    assert NAME not in output_of(result)


@pytest.mark.parametrize("source", ["message", "merge", "commit"])
def test_message_that_git_keeps_verbatim_is_checked_on_every_line(
    scratch_repo, pattern_file, source
):
    record_message_source(scratch_repo.path, source)
    message = write_message(scratch_repo, f"#5 {NAME} fix\n")

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 1
    assert NAME not in output_of(result)


@pytest.mark.parametrize("source", ["message", "merge", "commit"])
def test_a_scissors_line_shows_an_editor_ran_so_comment_lines_above_it_are_ignored(
    scratch_repo, pattern_file, source
):
    record_message_source(scratch_repo.path, source)
    message = write_message(
        scratch_repo,
        f"ok\n\n# On branch {NAME}\n# ------------------------ >8 ------------------------\n+x\n",
    )

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("source", ["message", "merge", "commit"])
def test_a_name_in_the_body_is_still_found_when_a_scissors_line_is_present(
    scratch_repo, pattern_file, source
):
    record_message_source(scratch_repo.path, source)
    message = write_message(
        scratch_repo,
        f"About {NAME}\n\n# comment\n# ------------------------ >8 ------------------------\n+x\n",
    )

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 1


def test_a_real_merge_with_a_hash_line_naming_a_private_name_is_blocked(hooked_repo):
    hooked_repo.repo.add("a.md", "clean\n")
    assert hooked_repo.commit("-m", "seed").returncode == 0
    hooked_repo.repo.git("checkout", "-q", "-b", "side")
    hooked_repo.repo.add("b.md", "side\n")
    assert hooked_repo.commit("-m", "side work").returncode == 0
    hooked_repo.repo.git("checkout", "-q", "-")

    result = hooked_repo.git("merge", "--no-ff", "-q", "-m", f"#5 {NAME}", "side")

    assert result.returncode != 0
    assert NAME not in output_of(result)


def test_a_real_commit_reusing_a_message_with_a_hash_line_naming_a_private_name_is_blocked(
    hooked_repo,
):
    hooked_repo.repo.add("a.md", "clean\n")
    assert hooked_repo.commit("--no-verify", "-m", f"#4 {NAME}").returncode == 0
    hooked_repo.repo.add("a.md", "clean again\n")

    result = hooked_repo.commit("-C", "HEAD")

    assert result.returncode == 1
    assert NAME not in output_of(result)


def test_a_real_amend_with_a_hash_line_naming_a_private_name_is_blocked(hooked_repo):
    hooked_repo.repo.add("a.md", "clean\n")
    assert hooked_repo.commit("-m", "seed").returncode == 0

    result = hooked_repo.commit("--amend", "-m", f"#7 {NAME}")

    assert result.returncode == 1


def test_a_real_inline_message_edited_verbosely_on_a_branch_named_with_a_private_name_passes(
    hooked_repo,
):
    hooked_repo.repo.git("checkout", "-q", "-b", f"feature/{NAME}")
    hooked_repo.repo.add("a.md", "clean\n")

    result = hooked_repo.commit("-m", "ok", "-e", "-v")

    assert result.returncode == 0, output_of(result)


def test_a_single_entry_is_counted_in_the_singular(run_gate, report):
    run_gate(NAME + "\n", {"docs/a.md": "clean\n"})

    assert report.notes == ["G7 private-names: 1 entry checked"]


def test_staged_mode_prints_nothing_when_everything_is_clean(scratch_repo, pattern_file):
    scratch_repo.add("docs/a.md", "clean\n")

    result = run_staged(scratch_repo, pattern_file(NAME + "\n"))

    assert result.returncode == 0
    assert output_of(result) == ""


def test_staged_mode_prints_nothing_when_there_is_no_list(scratch_repo):
    scratch_repo.add("docs/a.md", "clean\n")

    result = run_validator(scratch_repo, "--private-names-only", "--staged")

    assert result.returncode == 0
    assert output_of(result) == ""


def test_staged_mode_still_explains_a_blocked_commit(scratch_repo, pattern_file):
    scratch_repo.add("docs/a.md", f"{NAME}\n")

    result = run_staged(scratch_repo, pattern_file(NAME + "\n"))

    assert result.returncode == 1
    assert result.stdout == ""
    assert "1 failure(s):" in result.stderr
    assert "FAIL G7 private-names: docs/a.md:1 matches private-names entry #1" in result.stderr


def test_message_mode_prints_nothing_when_the_message_is_clean(scratch_repo, pattern_file):
    message = write_message(scratch_repo, "Fix the parser\n")

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 0
    assert output_of(result) == ""


def test_message_mode_prints_nothing_when_there_is_no_list(scratch_repo):
    message = write_message(scratch_repo, "Fix the parser\n")

    result = run_message_check(scratch_repo, message, None)

    assert result.returncode == 0
    assert output_of(result) == ""


def test_message_mode_still_explains_a_blocked_commit(scratch_repo, pattern_file):
    message = write_message(scratch_repo, f"About {NAME}\n")

    result = run_message_check(scratch_repo, message, pattern_file(NAME + "\n"))

    assert result.returncode == 1
    assert result.stdout == ""
    assert "FAIL G7 private-names: commit message matches private-names entry #1" in result.stderr


def test_the_hooks_print_nothing_for_a_clean_commit(hooked_repo):
    hooked_repo.repo.add("a.md", "clean\n")

    result = hooked_repo.commit("-m", "Fix the parser")

    assert result.returncode == 0
    assert output_of(result) == ""


def test_a_real_editor_commit_with_an_auto_comment_character_on_a_name_branch_passes(hooked_repo):
    hooked_repo.repo.git("config", "core.commentChar", "auto")
    hooked_repo.repo.git("checkout", "-q", "-b", f"feature/{NAME}")
    hooked_repo.repo.add("a.md", "clean\n")

    result = hooked_repo.commit()

    assert result.returncode == 0, output_of(result)


def test_a_real_editor_commit_with_an_auto_comment_character_and_an_at_sign_body_line_is_blocked(
    hooked_repo,
):
    hooked_repo.repo.git("config", "core.commentChar", "auto")
    hooked_repo.repo.add("a.md", "clean\n")

    result = hooked_repo.commit(subject=f"Fix\n@ notes about {NAME}")

    assert result.returncode == 1
    assert NAME not in output_of(result)


class ScannedCharacterCounter(str):
    scanned = 0

    def count(self, sub, start=0, end=None):
        ScannedCharacterCounter.scanned += (len(self) if end is None else end) - start
        return super().count(sub, start, end)


def test_line_numbers_of_many_matches_are_exact(validator):
    lines = [NAME if number % 3 == 0 else "other" for number in range(1, 3001)]
    text = "\n".join(lines) + "\n"

    found = validator.matching_line_numbers(re.compile(NAME), text)

    assert found == [number for number in range(1, 3001) if number % 3 == 0]


def test_line_numbers_of_many_matches_are_found_in_one_pass_over_the_text(validator):
    text = ScannedCharacterCounter("\n".join([NAME] * 3000) + "\n")
    ScannedCharacterCounter.scanned = 0

    found = validator.matching_line_numbers(re.compile(NAME), text)

    assert len(found) == 3000
    assert ScannedCharacterCounter.scanned <= len(text)


def test_two_matches_on_one_line_give_that_line_once(validator):
    found = validator.matching_line_numbers(re.compile(NAME), f"{NAME} {NAME}\nx\n{NAME}\n")

    assert found == [1, 3]
