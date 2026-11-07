import gc
import io
import json
import subprocess
import sys
import time

import pytest

from conftest import COMMIT_GATE_PATH

GUARDED_COMMANDS = [
    "git commit -m m",
    "cd x && git commit -m m",
    "git -C x commit",
    "git -c user.name=a commit",
    "git --git-dir=x/.git --work-tree=x commit",
    "git --git-dir x/.git commit",
    "git --no-pager commit",
    "git -P commit",
    "GIT_DIR=.git git commit",
    "git commit --amend",
    "git commit -m \"mention git push\"",
    "git push --force origin b",
    "git push --delete origin b",
    "git push",
    "gh pr create --fill",
    "gh pr new",
    "gh -R owner/repo pr create",
    "gh --repo=owner/repo pr create",
    "(git commit -m m)",
    "echo $(git push)",
    "echo `git push`",
    "echo a\ngit commit",
    "git status; git commit",
    "git status && git push || true",
    "git status | git push",
    "sleep 1 & git push",
    "xargs git commit",
    "xargs -I {} git commit {}",
    "time git commit",
    "command git push",
    "/usr/bin/git push",
    "sudo git push",
    "sudo -u deploy git push",
    "env A=1 git commit",
    "env -i -u HOME A=1 git commit",
    "timeout 5 git push",
    "timeout -s KILL 5 git push",
    "nice -n 10 git push",
    "nohup git push",
    "stdbuf -oL git push",
    "exec git push",
    "if true; then git commit; fi",
    "! git push",
    "{ git push; }",
    "while git push; do :; done",
    "git commit -m \"$(cat <<'EOF'\nSubject\n\nBody line\nEOF\n)\"",
]

UNGUARDED_COMMANDS = [
    "",
    "ls",
    "git",
    "git status",
    "git log --grep commit",
    "git commit-graph write",
    "git -C commit status",
    "git diff --stat",
    "gh pr view",
    "gh pr list",
    "gh issue create",
    "echo \"git commit\"",
    "echo \"run git push later\"",
    "echo git push",
    "cat commit.md",
]

DOCUMENTED_LIMITS_NOT_GUARDED = [
    "bash -c 'git commit'",
    "sh -c \"git push\"",
    "eval \"git commit\"",
    "gc -m message",
    "git merge feature",
    "git cherry-pick abc123",
    "git revert abc123",
    "git am change.patch",
    "git rebase main",
    "git commit-tree HEAD^{tree}",
    "gh api -X POST repos/owner/repo/pulls",
    "echo \"$(git push)\"",
]


@pytest.mark.parametrize("command", GUARDED_COMMANDS)
def test_commit_push_and_pr_creation_are_guarded(commit_gate, command):
    assert commit_gate.is_guarded_command(command)


@pytest.mark.parametrize("command", UNGUARDED_COMMANDS)
def test_other_commands_are_not_guarded(commit_gate, command):
    assert not commit_gate.is_guarded_command(command)


@pytest.mark.parametrize("command", DOCUMENTED_LIMITS_NOT_GUARDED)
def test_documented_bypasses_are_not_guarded(commit_gate, command):
    assert not commit_gate.is_guarded_command(command)


def test_heredoc_body_text_that_looks_like_a_commit_is_guarded(commit_gate):
    assert commit_gate.is_guarded_command("cat <<EOF\ngit commit\nEOF")


@pytest.mark.parametrize(
    "command",
    [
        "git commit -m \"unterminated",
        "echo 'unterminated; gh pr create",
        "git push origin \\",
        "cd x && git push \"unterminated",
        "(git commit -m 'unterminated",
        "/usr/bin/git -C x commit -m \"unterminated",
        "GIT_DIR=.git git push \"unterminated",
        "sudo git push \"unterminated",
        "gh -R owner/repo pr create --title \"unterminated",
        "echo a\ngit commit \"unterminated",
    ],
)
def test_unparseable_commands_fall_back_to_a_text_match(commit_gate, command):
    assert commit_gate.is_guarded_command(command)


@pytest.mark.parametrize(
    "command",
    [
        "git log --grep push \"unterminated",
        "git commit-tree HEAD^{tree} \"unterminated",
        "echo git push \"unterminated",
        "echo \"unterminated git push",
        "git status && echo commit \"unterminated",
        "gh pr view create \"unterminated",
        "mygit push \"unterminated",
    ],
)
def test_the_text_fallback_only_matches_a_guarded_command_at_the_start_of_a_command(
    commit_gate, command
):
    assert not commit_gate.is_guarded_command(command)


def test_an_assignment_prefixed_push_in_an_unparseable_command_is_guarded(commit_gate):
    assert commit_gate.is_guarded_command("A=b C=d git push \"unterminated")
    assert commit_gate.is_guarded_command("A=b=c=d git push \"unterminated")


TIMING_FLOOR_SECONDS = 1e-3
TIMING_RUNS = 5


def fastest_seconds(commit_gate, command):
    best = float("inf")
    gc.disable()
    try:
        for _ in range(TIMING_RUNS):
            start = time.perf_counter()
            commit_gate.is_guarded_command(command)
            best = min(best, time.perf_counter() - start)
    finally:
        gc.enable()
    return max(best, TIMING_FLOOR_SECONDS)


@pytest.mark.parametrize(
    "tail",
    [
        "git x '",
        "git -C a -C b -C c x '",
        "sudo env time command exec nohup xargs git x '",
        "git --a --b --c --d x '",
        "git --git-dir x --git-dir y --git-dir z x '",
        "gh -R a -R b -R c pr view '",
    ],
)
def test_the_text_fallback_does_not_backtrack_exponentially_on_repeated_words(commit_gate, tail):
    for prefix in ("A=b=c=d=e ", "git ", "git -C a ", "sudo ", "-x ", "; ", "x=y "):
        small = fastest_seconds(commit_gate, prefix * 10 + tail)
        large = fastest_seconds(commit_gate, prefix * 40 + tail)
        assert large / small < 1000, (prefix, tail)


def test_the_text_fallback_does_not_backtrack_exponentially_on_value_taking_git_options(
    commit_gate,
):
    small = fastest_seconds(commit_gate, "git " + "--git-dir " * 10 + "x '")
    large = fastest_seconds(commit_gate, "git " + "--git-dir " * 40 + "x '")

    assert large / small < 1000


@pytest.mark.parametrize("prefix", [";", "A=;", "(", "\n", "a=b ", "x/ "])
def test_the_text_fallback_cost_does_not_grow_quadratically_with_separators(commit_gate, prefix):
    small = fastest_seconds(commit_gate, prefix * 5000 + "git x '")
    large = fastest_seconds(commit_gate, prefix * 20000 + "git x '")

    assert large / small < 10


@pytest.mark.parametrize(
    "command",
    [
        "git \\\ncommit -m x",
        "git \\\n  push",
        "gh pr \\\ncreate --fill",
        "git commit \\\n  -m x",
        "git \\\ncommit -m \"unterminated",
    ],
)
def test_a_backslash_newline_continuation_does_not_hide_a_guarded_command(commit_gate, command):
    assert commit_gate.is_guarded_command(command)


def test_continuations_are_joined_everywhere_as_a_documented_approximation(commit_gate):
    assert commit_gate.command_segments("echo ab\\\ncd") == [["echo", "abcd"]]
    assert commit_gate.command_segments("echo 'one\\\ntwo'") == [["echo", "onetwo"]]


@pytest.mark.parametrize(
    "command",
    [
        "if false; then :; elif git push; then :; fi",
        "diff <(git push) other",
        "echo a#b; git push",
        "echo done # note\ngit commit -m x",
    ],
)
def test_elif_process_substitution_and_hash_inside_words_do_not_hide_a_guarded_command(
    commit_gate, command
):
    assert commit_gate.is_guarded_command(command)


@pytest.mark.parametrize("command", ["ls -la", "cat notes.txt", "pwd", "python3 -m pytest"])
def test_a_command_naming_neither_git_nor_gh_is_decided_without_tokenising(
    commit_gate, monkeypatch, command
):
    def forbidden(*_args, **_kwargs):
        raise AssertionError("must not run")

    monkeypatch.setattr(commit_gate, "command_segments", forbidden)
    monkeypatch.setattr(commit_gate, "joined_command_segments", forbidden)

    assert not commit_gate.is_guarded_command(command)


def test_a_continuation_inside_the_word_git_does_not_defeat_the_early_exit(commit_gate):
    assert commit_gate.is_guarded_command("g\\\nit push")


def test_the_hook_does_not_look_for_the_repository_for_a_command_naming_neither_git_nor_gh(
    commit_gate, monkeypatch, tmp_path
):
    def forbidden(*_args, **_kwargs):
        raise AssertionError("must not run")

    monkeypatch.setattr(commit_gate.subprocess, "run", forbidden)
    payload = json.dumps(bash_payload("ls", tmp_path)).encode()

    assert commit_gate.run(payload) == 0


@pytest.mark.parametrize(
    "command",
    ["echo \"unterminated git status", "echo 'unterminated gh pr view"],
)
def test_unparseable_commands_without_a_guarded_verb_are_not_guarded(commit_gate, command):
    assert not commit_gate.is_guarded_command(command)


def required(refusal="hard", owner="/secops", phase="pre_implementation"):
    return {"refusal": refusal, "owner": owner, "phase": phase}


def ticket_with(required_gates, gate_states=None, **extra):
    gates = {
        name: {"state": state, "by": None, "at": None}
        for name, state in (gate_states or {}).items()
    }
    return {"title": "t", "track": "standard", "stage": "dev", "gates": gates,
            "required_gates": required_gates, **extra}


def serialise(content):
    return content if isinstance(content, bytes) else json.dumps(content).encode()


class Project:
    def __init__(self, root):
        self.root = root
        self.ledger_path = root / ".workflow-state.json"
        self.pointer_path = root / ".aidevteam" / "state" / "active-ticket.json"

    def set_ledger(self, content):
        self.ledger_path.write_bytes(serialise(content))

    def set_pointer(self, content):
        self.pointer_path.parent.mkdir(parents=True, exist_ok=True)
        self.pointer_path.write_bytes(serialise(content))

    def activate(self, ticket_id, ticket):
        self.set_ledger({ticket_id: ticket})
        self.set_pointer({"ticket": ticket_id})


@pytest.fixture
def project(tmp_path):
    return Project(tmp_path)


@pytest.fixture
def blocked_project(project):
    project.activate("TCK-001", ticket_with(
        {"SECOPS_APPROVED": required()}, {"SECOPS_APPROVED": "pending"}))
    return project


def test_an_unmet_hard_pre_implementation_gate_blocks(commit_gate, blocked_project):
    reason = commit_gate.blocking_reason(blocked_project.root)

    assert "SECOPS_APPROVED" in reason
    assert "run /secops" in reason
    assert "TCK-001" in reason


def test_the_reason_names_the_ledger_path_and_how_to_clear(commit_gate, blocked_project):
    reason = commit_gate.blocking_reason(blocked_project.root)

    assert str(blocked_project.ledger_path) in reason
    assert str(blocked_project.pointer_path) in reason
    assert "Clearing the active ticket or marking a gate passed is the user's decision" in reason
    assert "ask before editing the ledger" in reason


def test_every_unmet_hard_pre_implementation_gate_is_listed(commit_gate, project):
    project.activate("TCK-001", ticket_with(
        {
            "ARCH_APPROVED": required(owner="/arch"),
            "SECOPS_APPROVED": required(),
            "APPROVAL_GATE": required(owner="/verify"),
        },
        {"ARCH_APPROVED": "passed"},
    ))

    reason = commit_gate.blocking_reason(project.root)

    assert "SECOPS_APPROVED required — run /secops" in reason
    assert "APPROVAL_GATE required — run /verify" in reason
    assert "ARCH_APPROVED" not in reason


@pytest.mark.parametrize("state", ["pending", "rejected", "skipped", "unknown-state", None])
def test_a_gate_that_is_not_passed_is_unmet(commit_gate, project, state):
    ticket = ticket_with({"SECOPS_APPROVED": required()}, {"SECOPS_APPROVED": state})
    project.activate("TCK-001", ticket)

    assert "SECOPS_APPROVED" in commit_gate.blocking_reason(project.root)


def test_a_required_gate_missing_from_the_ledger_gates_is_unmet(commit_gate, project):
    project.activate("TCK-001", ticket_with({"SECOPS_APPROVED": required()}))

    assert "SECOPS_APPROVED" in commit_gate.blocking_reason(project.root)


def test_a_ticket_without_a_gates_object_treats_required_gates_as_unmet(commit_gate, project):
    ticket = ticket_with({"SECOPS_APPROVED": required()})
    del ticket["gates"]
    project.activate("TCK-001", ticket)

    assert "SECOPS_APPROVED" in commit_gate.blocking_reason(project.root)


def test_a_passed_gate_allows(commit_gate, project):
    project.activate("TCK-001", ticket_with(
        {"SECOPS_APPROVED": required()}, {"SECOPS_APPROVED": "passed"}))

    assert commit_gate.blocking_reason(project.root) is None


def test_a_skip_never_clears_a_hard_gate(commit_gate, project):
    ticket = ticket_with(
        {"SECOPS_APPROVED": required()},
        {"SECOPS_APPROVED": "pending"},
        skips=[{"gate": "SECOPS_APPROVED", "reason": "small change", "by": "/be", "at": "t"}],
    )
    project.activate("TCK-001", ticket)

    assert "SECOPS_APPROVED" in commit_gate.blocking_reason(project.root)


def test_an_unmet_soft_pre_implementation_gate_allows(commit_gate, project):
    project.activate("TCK-001", ticket_with(
        {"DESIGN_APPROVED": required("soft", "/ui")}, {"DESIGN_APPROVED": "pending"}))

    assert commit_gate.blocking_reason(project.root) is None


@pytest.mark.parametrize("refusal", ["hard", "soft"])
def test_an_unmet_pre_done_gate_allows(commit_gate, project, refusal):
    project.activate("TCK-001", ticket_with(
        {"CODE_REVIEWED": required(refusal, "/rev", "pre_done")},
        {"CODE_REVIEWED": "pending"}))

    assert commit_gate.blocking_reason(project.root) is None


def test_a_ticket_without_required_gates_allows(commit_gate, project):
    ticket = ticket_with({})
    del ticket["required_gates"]
    project.activate("TCK-001", ticket)

    assert commit_gate.blocking_reason(project.root) is None


def test_no_active_ticket_file_allows_even_when_the_ledger_would_block(commit_gate, blocked_project):
    blocked_project.pointer_path.unlink()

    assert commit_gate.blocking_reason(blocked_project.root) is None


def test_a_null_active_ticket_allows(commit_gate, blocked_project):
    blocked_project.set_pointer({"ticket": None})

    assert commit_gate.blocking_reason(blocked_project.root) is None


def test_a_null_active_ticket_allows_without_a_ledger(commit_gate, project):
    project.set_pointer({"ticket": None})

    assert commit_gate.blocking_reason(project.root) is None


def test_no_ledger_and_no_active_ticket_allows(commit_gate, project):
    assert commit_gate.blocking_reason(project.root) is None


def test_the_active_ticket_selects_which_ticket_is_checked(commit_gate, project):
    project.set_ledger({
        "TCK-001": ticket_with({"SECOPS_APPROVED": required()}, {"SECOPS_APPROVED": "pending"}),
        "TCK-002": ticket_with({"SECOPS_APPROVED": required()}, {"SECOPS_APPROVED": "passed"}),
    })

    project.set_pointer({"ticket": "TCK-002"})
    assert commit_gate.blocking_reason(project.root) is None

    project.set_pointer({"ticket": "TCK-001"})
    assert "SECOPS_APPROVED" in commit_gate.blocking_reason(project.root)


def test_an_active_ticket_with_no_ledger_blocks(commit_gate, project):
    project.set_pointer({"ticket": "TCK-001"})

    reason = commit_gate.blocking_reason(project.root)

    assert "TCK-001" in reason
    assert str(project.ledger_path) in reason
    assert "missing" in reason


def test_an_active_ticket_absent_from_the_ledger_blocks(commit_gate, project):
    project.set_ledger({"TCK-002": ticket_with({})})
    project.set_pointer({"ticket": "TCK-001"})

    reason = commit_gate.blocking_reason(project.root)

    assert "TCK-001" in reason
    assert "not in the ledger" in reason


MALFORMED_FILES = [
    ("unreadable", None),
    ("not valid UTF-8", b"\xff\xfe{\"a\": 1}"),
    ("empty", b""),
    ("empty", b"  \n"),
    ("invalid JSON", b"{not json"),
    ("larger than 1 MiB", b"{\"pad\": \"" + b"a" * (1024 * 1024) + b"\"}"),
    ("not an object", b"[1, 2]"),
    ("not an object", b"\"text\""),
    ("not an object", b"null"),
]


@pytest.mark.parametrize("problem,content", MALFORMED_FILES)
def test_a_malformed_ledger_blocks_naming_the_file_and_the_problem(
    commit_gate, project, problem, content
):
    project.set_pointer({"ticket": "TCK-001"})
    if content is None:
        project.ledger_path.mkdir()
    else:
        project.ledger_path.write_bytes(content)

    reason = commit_gate.blocking_reason(project.root)

    assert str(project.ledger_path) in reason
    assert problem in reason


@pytest.mark.parametrize("problem,content", MALFORMED_FILES)
def test_a_malformed_active_ticket_file_blocks_naming_the_file_and_the_problem(
    commit_gate, project, problem, content
):
    project.set_ledger({})
    if content is None:
        project.pointer_path.mkdir(parents=True)
    else:
        project.set_pointer(content)

    reason = commit_gate.blocking_reason(project.root)

    assert str(project.pointer_path) in reason
    assert problem in reason


DEEPLY_NESTED = b"[" * 100000 + b"]" * 100000


def raise_recursion_error(*_args, **_kwargs):
    raise RecursionError


def test_a_deeply_nested_ledger_blocks_whatever_the_interpreter_makes_of_it(commit_gate, project):
    project.set_pointer({"ticket": "TCK-001"})
    project.ledger_path.write_bytes(DEEPLY_NESTED)

    reason = commit_gate.blocking_reason(project.root)

    assert str(project.ledger_path) in reason
    assert "Blocked" in reason


def test_a_deeply_nested_active_ticket_file_blocks_whatever_the_interpreter_makes_of_it(
    commit_gate, project
):
    project.set_ledger({})
    project.set_pointer(DEEPLY_NESTED)

    reason = commit_gate.blocking_reason(project.root)

    assert str(project.pointer_path) in reason
    assert "Blocked" in reason


def test_a_ledger_the_json_parser_cannot_nest_deeply_enough_for_blocks(
    commit_gate, project, monkeypatch
):
    project.activate("TCK-001", ticket_with({}))
    parse = commit_gate.json.loads

    def fail_for_the_ledger_only(text, *args, **kwargs):
        if "required_gates" in text:
            raise RecursionError
        return parse(text, *args, **kwargs)

    monkeypatch.setattr(commit_gate.json, "loads", fail_for_the_ledger_only)

    reason = commit_gate.blocking_reason(project.root)

    assert str(project.ledger_path) in reason
    assert "nested too deeply" in reason


def test_an_active_ticket_file_the_json_parser_cannot_nest_deeply_enough_for_blocks(
    commit_gate, project, monkeypatch
):
    project.set_pointer({"ticket": None})
    monkeypatch.setattr(commit_gate.json, "loads", raise_recursion_error)

    reason = commit_gate.blocking_reason(project.root)

    assert str(project.pointer_path) in reason
    assert "nested too deeply" in reason


def test_a_payload_the_json_parser_cannot_nest_deeply_enough_for_is_unusable(
    commit_gate, monkeypatch
):
    monkeypatch.setattr(commit_gate.json, "loads", raise_recursion_error)

    with pytest.raises(commit_gate.UnusablePayload, match="nested too deeply"):
        commit_gate.parse_payload(b"{}")


@pytest.mark.parametrize("ticket", [1, True, ["TCK-001"], {"id": "TCK-001"}])
def test_an_active_ticket_that_is_neither_a_string_nor_null_blocks(commit_gate, project, ticket):
    project.set_ledger({})
    project.set_pointer({"ticket": ticket})

    reason = commit_gate.blocking_reason(project.root)

    assert str(project.pointer_path) in reason
    assert "'ticket' must be a string or null" in reason


def test_an_active_ticket_file_without_a_ticket_field_blocks(commit_gate, project):
    project.set_ledger({})
    project.set_pointer({"tiket": "TCK-001"})

    reason = commit_gate.blocking_reason(project.root)

    assert str(project.pointer_path) in reason
    assert "'ticket' must be a string or null" in reason


def test_a_ledger_ticket_entry_that_is_not_an_object_blocks(commit_gate, project):
    project.set_ledger({"TCK-001": "done"})
    project.set_pointer({"ticket": "TCK-001"})

    reason = commit_gate.blocking_reason(project.root)

    assert str(project.ledger_path) in reason
    assert "TCK-001 is not an object" in reason


@pytest.mark.parametrize("required_gates", [[], "SECOPS_APPROVED", 3, None])
def test_required_gates_that_is_not_an_object_blocks(commit_gate, project, required_gates):
    project.activate("TCK-001", ticket_with(required_gates))

    reason = commit_gate.blocking_reason(project.root)

    assert str(project.ledger_path) in reason
    assert "'required_gates' must be an object" in reason


@pytest.mark.parametrize("entry", ["hard", None, ["hard"], 1])
def test_a_required_gate_entry_that_is_not_an_object_blocks(commit_gate, project, entry):
    project.activate("TCK-001", ticket_with({"SECOPS_APPROVED": entry}))

    reason = commit_gate.blocking_reason(project.root)

    assert "required_gates.SECOPS_APPROVED must be an object" in reason


@pytest.mark.parametrize("refusal", ["firm", "HARD", None, 1, ""])
def test_a_required_gate_with_an_unknown_refusal_blocks(commit_gate, project, refusal):
    project.activate("TCK-001", ticket_with({"SECOPS_APPROVED": required(refusal=refusal)}))

    reason = commit_gate.blocking_reason(project.root)

    assert "required_gates.SECOPS_APPROVED.refusal must be hard or soft" in reason


@pytest.mark.parametrize("phase", ["pre_review", "PRE_DONE", None, 1, ""])
def test_a_required_gate_with_an_unknown_phase_blocks(commit_gate, project, phase):
    project.activate("TCK-001", ticket_with({"SECOPS_APPROVED": required(phase=phase)}))

    reason = commit_gate.blocking_reason(project.root)

    assert "required_gates.SECOPS_APPROVED.phase must be pre_implementation or pre_done" in reason


def test_a_malformed_soft_gate_entry_still_blocks(commit_gate, project):
    project.activate("TCK-001", ticket_with({
        "DESIGN_APPROVED": required("soft", "/ui", "pre_done"),
        "PERF_OK": required("soft", "/perf", "whenever"),
    }))

    assert "PERF_OK.phase" in commit_gate.blocking_reason(project.root)


def test_a_malformed_ledger_never_echoes_its_content(commit_gate, project):
    project.set_pointer({"ticket": "TCK-001"})
    project.ledger_path.write_bytes(b"{secret-value-in-a-broken-file")

    assert "secret-value" not in commit_gate.blocking_reason(project.root)


def test_the_reason_never_echoes_titles_notes_or_skip_reasons(commit_gate, project):
    ticket = ticket_with(
        {"SECOPS_APPROVED": required()},
        {"SECOPS_APPROVED": "pending"},
        skips=[{"gate": "SECOPS_APPROVED", "reason": "skip-reason-text", "by": "by-text"}],
    )
    ticket["title"] = "title-text"
    ticket["gates"]["SECOPS_APPROVED"]["note"] = "note-text"
    project.activate("TCK-001", ticket)

    reason = commit_gate.blocking_reason(project.root)

    for leaked in ("title-text", "note-text", "skip-reason-text", "by-text"):
        assert leaked not in reason


@pytest.mark.parametrize("ticket_id", ["TCK 001", "x" * 65, "TCK/001", "TCK\n001", "", "tck;rm"])
def test_an_invalid_ticket_id_is_not_echoed(commit_gate, project, ticket_id):
    project.activate(ticket_id, ticket_with(
        {"SECOPS_APPROVED": required()}, {"SECOPS_APPROVED": "pending"}))

    reason = commit_gate.blocking_reason(project.root)

    assert "<invalid>" in reason
    assert ticket_id.strip() == "" or ticket_id not in reason


@pytest.mark.parametrize("ticket_id", ["TCK-001", "ADT_130", "a.b-c_9", "x" * 64])
def test_a_valid_ticket_id_is_echoed(commit_gate, project, ticket_id):
    project.activate(ticket_id, ticket_with(
        {"SECOPS_APPROVED": required()}, {"SECOPS_APPROVED": "pending"}))

    assert ticket_id in commit_gate.blocking_reason(project.root)


@pytest.mark.parametrize("gate", ["lower_case_gate", "SECOPS APPROVED", "1GATE", "G" * 65, "GATE\nX"])
def test_an_invalid_gate_name_is_not_echoed(commit_gate, project, gate):
    project.activate("TCK-001", ticket_with({gate: required()}, {gate: "pending"}))

    reason = commit_gate.blocking_reason(project.root)

    assert "<invalid> required" in reason
    assert gate not in reason


@pytest.mark.parametrize("owner", ["secops", "/SecOps", "/a b", "/" + "a" * 33, "/x\ny", ""])
def test_an_invalid_owner_is_not_echoed(commit_gate, project, owner):
    project.activate("TCK-001", ticket_with(
        {"SECOPS_APPROVED": required(owner=owner)}, {"SECOPS_APPROVED": "pending"}))

    reason = commit_gate.blocking_reason(project.root)

    assert "run <invalid>" in reason
    assert owner == "" or owner not in reason


def test_an_invalid_gate_name_is_not_echoed_in_a_malformed_reason(commit_gate, project):
    project.activate("TCK-001", ticket_with({"bad name": required(refusal="firm")}))

    reason = commit_gate.blocking_reason(project.root)

    assert "required_gates.<invalid>.refusal" in reason
    assert "bad name" not in reason


def test_the_reason_is_capped_and_keeps_the_instruction_to_ask_the_user(commit_gate, project):
    gates = {f"GATE_{index}": required() for index in range(500)}
    project.activate("TCK-001", ticket_with(gates, {name: "pending" for name in gates}))

    reason = commit_gate.blocking_reason(project.root)

    assert len(reason) <= 2000
    assert "ask before editing the ledger" in reason
    assert "more" in reason


def test_a_malformed_file_reason_is_capped_even_under_a_very_long_path(commit_gate, tmp_path):
    deep = tmp_path.joinpath(*["d" * 200] * 10)
    deep.mkdir(parents=True)
    Project(deep).set_pointer(b"{broken")

    reason = commit_gate.blocking_reason(deep)

    assert 0 < len(reason) <= 2000


def test_the_ledger_root_is_the_git_top_level_of_the_session_directory(
    commit_gate, tmp_path
):
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    nested = tmp_path / "a" / "b"
    nested.mkdir(parents=True)

    assert commit_gate.ledger_root(str(nested)).resolve() == tmp_path.resolve()


def test_the_ledger_root_falls_back_to_the_directory_outside_a_repository(
    commit_gate, tmp_path
):
    assert commit_gate.ledger_root(str(tmp_path)) == tmp_path


def test_the_ledger_root_falls_back_to_the_directory_when_it_does_not_exist(
    commit_gate, tmp_path
):
    missing = tmp_path / "gone"

    assert commit_gate.ledger_root(str(missing)) == missing


def test_the_repository_lookup_is_bounded_by_a_timeout(commit_gate, monkeypatch, tmp_path):
    seen = {}

    def fake_run(arguments, **kwargs):
        seen.update(kwargs)
        return subprocess.CompletedProcess(arguments, 0, stdout=str(tmp_path) + "\n")

    monkeypatch.setattr(commit_gate.subprocess, "run", fake_run)

    commit_gate.ledger_root(str(tmp_path))

    assert seen["timeout"] == 2
    assert seen["cwd"] == str(tmp_path)


def test_a_repository_lookup_that_times_out_falls_back_to_the_directory(
    commit_gate, monkeypatch, tmp_path
):
    def time_out(arguments, **kwargs):
        raise subprocess.TimeoutExpired(arguments, kwargs["timeout"])

    monkeypatch.setattr(commit_gate.subprocess, "run", time_out)

    assert commit_gate.ledger_root(str(tmp_path)) == tmp_path


def run_hook(payload, cwd=None, raw=None):
    stdin = raw if raw is not None else json.dumps(payload).encode()
    return subprocess.run(
        [sys.executable, str(COMMIT_GATE_PATH)],
        input=stdin, capture_output=True, cwd=cwd, timeout=20,
    )


def bash_payload(command, cwd):
    return {
        "hook_event_name": "PreToolUse",
        "tool_name": "Bash",
        "tool_input": {"command": command},
        "cwd": str(cwd),
    }


@pytest.fixture
def blocked_repository(blocked_project):
    subprocess.run(["git", "init", "-q", str(blocked_project.root)], check=True)
    return blocked_project


def test_the_hook_prints_a_deny_decision_for_a_guarded_command_on_a_blocked_ticket(
    blocked_repository
):
    result = run_hook(bash_payload("git commit -m test", blocked_repository.root))

    decision = json.loads(result.stdout)["hookSpecificOutput"]
    assert result.returncode == 0
    assert decision["hookEventName"] == "PreToolUse"
    assert decision["permissionDecision"] == "deny"
    assert "SECOPS_APPROVED required — run /secops" in decision["permissionDecisionReason"]
    assert result.stderr == b""


def test_the_hook_locates_the_ledger_from_a_subdirectory_of_the_session(blocked_repository):
    nested = blocked_repository.root / "src" / "deep"
    nested.mkdir(parents=True)

    result = run_hook(bash_payload("git push", nested))

    assert json.loads(result.stdout)["hookSpecificOutput"]["permissionDecision"] == "deny"


def test_the_hook_ignores_where_the_command_says_it_is_running(blocked_repository, tmp_path_factory):
    elsewhere = tmp_path_factory.mktemp("elsewhere")

    result = run_hook(bash_payload(f"git -C {elsewhere} commit -m x", blocked_repository.root))

    assert json.loads(result.stdout)["hookSpecificOutput"]["permissionDecision"] == "deny"


def test_the_hook_is_silent_once_the_gate_is_passed(blocked_repository):
    ledger = json.loads(blocked_repository.ledger_path.read_text())
    ledger["TCK-001"]["gates"]["SECOPS_APPROVED"]["state"] = "passed"
    blocked_repository.set_ledger(ledger)

    result = run_hook(bash_payload("git commit -m test", blocked_repository.root))

    assert (result.returncode, result.stdout, result.stderr) == (0, b"", b"")


def test_the_hook_is_silent_for_an_unguarded_command_even_with_a_malformed_ledger(
    blocked_repository
):
    blocked_repository.ledger_path.write_bytes(b"{broken")

    result = run_hook(bash_payload("git status", blocked_repository.root))

    assert (result.returncode, result.stdout, result.stderr) == (0, b"", b"")


def test_the_hook_denies_a_guarded_command_when_the_ledger_is_malformed(blocked_repository):
    blocked_repository.ledger_path.write_bytes(b"{broken")

    result = run_hook(bash_payload("gh pr create --fill", blocked_repository.root))

    decision = json.loads(result.stdout)["hookSpecificOutput"]
    assert decision["permissionDecision"] == "deny"
    assert str(blocked_repository.ledger_path) in decision["permissionDecisionReason"]


def test_the_hook_never_returns_allow(blocked_repository):
    ledger = json.loads(blocked_repository.ledger_path.read_text())
    ledger["TCK-001"]["gates"]["SECOPS_APPROVED"]["state"] = "passed"
    blocked_repository.set_ledger(ledger)

    result = run_hook(bash_payload("git commit -m test", blocked_repository.root))

    assert b"allow" not in result.stdout


def test_the_hook_decodes_invalid_utf8_in_the_payload_without_failing(blocked_repository):
    payload = json.dumps(bash_payload("git commit -m x", blocked_repository.root)).encode()
    payload = payload.replace(b"-m x", b"-m \xff")

    result = run_hook(None, raw=payload)

    assert json.loads(result.stdout)["hookSpecificOutput"]["permissionDecision"] == "deny"


@pytest.mark.parametrize(
    "raw",
    [
        b"",
        b"not json",
        b"[]",
        b"\"text\"",
        b"[" * 100000,
        json.dumps({"tool_name": "Write", "tool_input": {"command": "git commit"}}).encode(),
        json.dumps({"tool_name": "Bash", "tool_input": {}}).encode(),
        json.dumps({"tool_name": "Bash", "tool_input": {"command": 5}}).encode(),
        json.dumps({"tool_name": "Bash", "tool_input": "git commit"}).encode(),
        json.dumps({"tool_name": "Bash"}).encode(),
    ],
)
def test_an_unusable_payload_prints_one_stderr_line_and_exits_non_blocking(raw, tmp_path):
    result = run_hook(None, cwd=tmp_path, raw=raw)

    assert result.returncode == 1
    assert result.stdout == b""
    assert len(result.stderr.decode().strip().splitlines()) == 1


def test_an_unexpected_exception_prints_one_stderr_line_and_exits_non_blocking(
    commit_gate, monkeypatch, capsys
):
    def explode(command):
        raise RuntimeError("boom")

    monkeypatch.setattr(commit_gate, "is_guarded_command", explode)
    payload = json.dumps({"tool_name": "Bash", "tool_input": {"command": "git commit"}}).encode()
    monkeypatch.setattr(sys, "stdin", io.TextIOWrapper(io.BytesIO(payload)))

    status = commit_gate.main()

    captured = capsys.readouterr()
    assert status == 1
    assert captured.out == ""
    assert len(captured.err.strip().splitlines()) == 1


@pytest.fixture
def demo_project(project):
    demo_ledger = COMMIT_GATE_PATH.parents[2] / "examples" / "demo" / ".workflow-state.json"
    project.ledger_path.write_bytes(demo_ledger.read_bytes())
    return project


def test_the_demo_ticket_with_security_review_pending_blocks(commit_gate, demo_project):
    demo_project.set_pointer({"ticket": "ADT-130"})

    reason = commit_gate.blocking_reason(demo_project.root)

    assert "SECOPS_APPROVED required — run /secops" in reason
    assert "ARCH_APPROVED" not in reason


def test_every_demo_ticket_requires_the_gates_its_preset_always_requires():
    import yaml

    demo = COMMIT_GATE_PATH.parents[2] / "examples" / "demo"
    workflow = yaml.safe_load((demo / ".aidevteam" / "workflow.yaml").read_text(encoding="utf-8"))
    always_required = set(workflow["presets"][workflow["preset"]]["always_required"])
    ledger = json.loads((demo / ".workflow-state.json").read_text(encoding="utf-8"))

    for ticket_id, ticket in ledger.items():
        assert always_required <= set(ticket["required_gates"]), ticket_id


@pytest.mark.parametrize("ticket", ["ADT-118", "ADT-124"])
def test_the_demo_tickets_past_their_pre_implementation_gates_allow(
    commit_gate, demo_project, ticket
):
    demo_project.set_pointer({"ticket": ticket})

    assert commit_gate.blocking_reason(demo_project.root) is None


def test_the_hook_falls_back_to_the_process_directory_when_the_payload_has_no_cwd(
    blocked_repository
):
    payload = bash_payload("git commit -m x", blocked_repository.root)
    del payload["cwd"]

    result = run_hook(payload, cwd=blocked_repository.root)

    assert json.loads(result.stdout)["hookSpecificOutput"]["permissionDecision"] == "deny"
