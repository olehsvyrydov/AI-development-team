#!/usr/bin/env python3
"""PreToolUse hook: block `git commit`, `git push` and `gh pr create` while the
active ticket has an unmet hard, pre-implementation gate.

The active ticket is named in <repo>/.aidevteam/state/active-ticket.json and its
required gates are recorded in <repo>/.workflow-state.json. <repo> is the git top
level of the session's working directory. Anything that is not a guarded command
passes untouched, and a hook that cannot run (missing python3, crash, timeout)
lets the command through.
"""

from __future__ import annotations

import json
import os
import re
import shlex
import subprocess
import sys
from pathlib import Path

LEDGER_FILE = ".workflow-state.json"
ACTIVE_TICKET_FILE = Path(".aidevteam") / "state" / "active-ticket.json"
MAX_FILE_BYTES = 1024 * 1024
MAX_REASON_CHARACTERS = 2000
OMITTED_GATES_RESERVE = 40

PRE_IMPLEMENTATION = "pre_implementation"
REFUSALS = ("hard", "soft")
PHASES = (PRE_IMPLEMENTATION, "pre_done")
INVALID = "<invalid>"

TICKET_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")
GATE_NAME = re.compile(r"[A-Z][A-Z0-9_]{0,63}")
OWNER = re.compile(r"/[a-z0-9-]{1,32}")

USER_DECISION = (
    "Clearing the active ticket or marking a gate passed is the user's decision "
    "— ask before editing the ledger."
)

PUNCTUATION = "();<>|&\n"
SEPARATOR_CHARACTERS = frozenset(";&|()\n")
SEGMENT_START_WORDS = frozenset(
    {"{", "!", "then", "do", "else", "elif", "if", "while", "until"}
)
ASSIGNMENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*=")

WRAPPER_OPTIONS_WITH_VALUE = {
    "time": frozenset({"-f", "--format", "-o", "--output"}),
    "command": frozenset(),
    "builtin": frozenset(),
    "nice": frozenset({"-n", "--adjustment"}),
    "nohup": frozenset(),
    "stdbuf": frozenset({"-i", "-o", "-e", "--input", "--output", "--error"}),
    "timeout": frozenset({"-s", "--signal", "-k", "--kill-after"}),
    "env": frozenset({"-u", "--unset", "-C", "--chdir"}),
    "sudo": frozenset(
        {"-u", "--user", "-g", "--group", "-h", "--host", "-p", "--prompt",
         "-C", "--close-from", "-D", "--chdir", "-R", "--chroot",
         "-T", "--command-timeout", "-r", "--role", "-t", "--type",
         "-U", "--other-user"}
    ),
    "xargs": frozenset(
        {"-a", "--arg-file", "-d", "--delimiter", "-E", "-I", "-L",
         "-n", "--max-args", "-P", "--max-procs", "-s", "--max-chars"}
    ),
    "exec": frozenset({"-a"}),
}
WRAPPER_POSITIONALS = {"timeout": 1}

GIT_OPTIONS_WITH_VALUE = frozenset(
    {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--super-prefix"}
)
GIT_FLAGS = frozenset(
    {"-p", "-P", "--paginate", "--no-pager", "--bare", "--no-replace-objects",
     "--literal-pathspecs", "--glob-pathspecs", "--noglob-pathspecs",
     "--icase-pathspecs", "--no-optional-locks", "--exec-path"}
)
GUARDED_GIT_SUBCOMMANDS = frozenset({"commit", "push"})
GH_OPTIONS_WITH_VALUE = frozenset({"-R", "--repo"})
GUARDED_GH_COMMANDS = (("pr", "create"), ("pr", "new"))

WORD = r"[^\s;&|()`]"
COMMAND_START = (
    r"(?:^|[;&|(\n`])[ \t]*"
    r"(?:[A-Za-z_][A-Za-z0-9_]*=" + WORD + r"*[ \t]+)*"
    r"(?:(?:sudo|env|time|command|exec|nohup|xargs)[ \t]+(?:-" + WORD + r"+[ \t]+)*)*"
    r"(?:" + WORD + r"*/)?"
)
COMMAND_END = r"(?=[\s;&|()]|$)"
GIT_VALUE_OPTIONS = r"(?:git-dir|work-tree|namespace|config-env|super-prefix)"
UNPARSEABLE_GIT = re.compile(
    COMMAND_START
    + r"git(?:[ \t]+(?:-[Cc][ \t]+\S+"
    r"|--" + GIT_VALUE_OPTIONS + r"[ \t]+\S+"
    r"|--(?!" + GIT_VALUE_OPTIONS + r"(?:[ \t]|$))[a-z-]+(?:=\S+)?"
    r"|-[pP]))*[ \t]+(?:commit|push)" + COMMAND_END
)
UNPARSEABLE_GH = re.compile(
    COMMAND_START
    + r"gh(?:[ \t]+(?:-R[ \t]+\S+|--repo(?:=\S+|[ \t]+\S+)))*[ \t]+pr[ \t]+(?:create|new)" + COMMAND_END
)


class Blocked(Exception):
    pass


class UnusablePayload(Exception):
    pass


def join_continuations(command: str) -> str:
    return command.replace("\\\n", "")


def command_segments(command: str) -> list[list[str]]:
    return joined_command_segments(join_continuations(command))


def joined_command_segments(command: str) -> list[list[str]]:
    lexer = shlex.shlex(command, posix=True, punctuation_chars=PUNCTUATION)
    lexer.whitespace_split = True
    lexer.whitespace = " \t\r"
    lexer.commenters = ""
    segments: list[list[str]] = [[]]
    for token in lexer:
        if is_separator(token):
            segments.append([])
            continue
        if token.startswith("`") and segments[-1]:
            segments.append([])
        word = token.strip("`")
        if word:
            segments[-1].append(word)
        if token.endswith("`"):
            segments.append([])
    return segments


def is_separator(token: str) -> bool:
    if not token or not all(character in PUNCTUATION for character in token):
        return False
    return all(character in SEPARATOR_CHARACTERS for character in token) or token.endswith("(")


def skip_wrapper_options(wrapper: str, words: list[str], index: int) -> int:
    options_with_value = WRAPPER_OPTIONS_WITH_VALUE[wrapper]
    while index < len(words) and words[index].startswith("-") and words[index] != "-":
        option = words[index]
        index += 1
        if option == "--":
            break
        if option in options_with_value:
            index += 1
    return index + WRAPPER_POSITIONALS.get(wrapper, 0)


def program_words(words: list[str]) -> list[str]:
    index = 0
    while index < len(words):
        word = words[index]
        wrapper = os.path.basename(word)
        if word in SEGMENT_START_WORDS or ASSIGNMENT.match(word):
            index += 1
        elif wrapper in WRAPPER_OPTIONS_WITH_VALUE:
            index = skip_wrapper_options(wrapper, words, index + 1)
        else:
            break
    return words[index:]


def git_subcommand(arguments: list[str]) -> str | None:
    index = 0
    while index < len(arguments):
        argument = arguments[index]
        option = argument.split("=", 1)[0]
        if argument in GIT_OPTIONS_WITH_VALUE:
            index += 2
        elif option in GIT_OPTIONS_WITH_VALUE or option in GIT_FLAGS:
            index += 1
        else:
            break
    return arguments[index] if index < len(arguments) else None


def gh_command(arguments: list[str]) -> tuple[str, ...]:
    words: list[str] = []
    index = 0
    while index < len(arguments) and len(words) < 2:
        argument = arguments[index]
        if argument in GH_OPTIONS_WITH_VALUE:
            index += 2
            continue
        index += 1
        if not argument.startswith("-"):
            words.append(argument)
    return tuple(words)


def is_guarded_segment(words: list[str]) -> bool:
    argv = program_words(words)
    if not argv:
        return False
    program = os.path.basename(argv[0])
    if program == "git":
        return git_subcommand(argv[1:]) in GUARDED_GIT_SUBCOMMANDS
    if program == "gh":
        return gh_command(argv[1:]) in GUARDED_GH_COMMANDS
    return False


def is_guarded_command(command: str) -> bool:
    joined = join_continuations(command)
    if "git" not in joined and "gh" not in joined:
        return False
    try:
        segments = joined_command_segments(joined)
    except ValueError:
        return bool(UNPARSEABLE_GIT.search(joined) or UNPARSEABLE_GH.search(joined))
    return any(is_guarded_segment(segment) for segment in segments)


def echoable(value: object, pattern: re.Pattern) -> str:
    if isinstance(value, str) and pattern.fullmatch(value):
        return value
    return INVALID


def malformed(path: Path, problem: str) -> Blocked:
    return Blocked(
        f"Blocked: {path} is malformed ({problem}), so the commit gate cannot tell "
        f"whether the active ticket's gates are met. Ask the user to fix or remove it. "
        f"{USER_DECISION}"
    )


def read_json_object(path: Path) -> dict | None:
    try:
        with open(path, "rb") as handle:
            raw = handle.read(MAX_FILE_BYTES + 1)
    except FileNotFoundError:
        return None
    except OSError:
        raise malformed(path, "unreadable")
    if len(raw) > MAX_FILE_BYTES:
        raise malformed(path, "larger than 1 MiB")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise malformed(path, "not valid UTF-8")
    if not text.strip():
        raise malformed(path, "empty")
    try:
        data = json.loads(text)
    except RecursionError:
        raise malformed(path, "nested too deeply")
    except ValueError:
        raise malformed(path, "invalid JSON")
    if not isinstance(data, dict):
        raise malformed(path, "top level is not an object")
    return data


def active_ticket_id(pointer: dict, pointer_path: Path) -> str | None:
    ticket = pointer.get("ticket")
    if "ticket" not in pointer or not (ticket is None or isinstance(ticket, str)):
        raise malformed(pointer_path, "'ticket' must be a string or null")
    return ticket


def validate_required_gates(required_gates: object, ledger_path: Path) -> dict:
    if not isinstance(required_gates, dict):
        raise malformed(ledger_path, "'required_gates' must be an object")
    for name, entry in required_gates.items():
        label = f"required_gates.{echoable(name, GATE_NAME)}"
        if not isinstance(entry, dict):
            raise malformed(ledger_path, f"{label} must be an object")
        if entry.get("refusal") not in REFUSALS:
            raise malformed(ledger_path, f"{label}.refusal must be hard or soft")
        if entry.get("phase") not in PHASES:
            raise malformed(ledger_path, f"{label}.phase must be pre_implementation or pre_done")
    return required_gates


def is_unmet(ticket: dict, gate: str) -> bool:
    gates = ticket.get("gates")
    entry = gates.get(gate) if isinstance(gates, dict) else None
    state = entry.get("state") if isinstance(entry, dict) else None
    return state != "passed"


def unmet_gates_reason(ticket_id: str, ledger_path: Path, pointer_path: Path, lines: list[str]) -> str:
    header = (
        f"Blocked: ticket {ticket_id} has unmet hard pre-implementation gates "
        f"(ledger {ledger_path}):"
    )
    footer = (
        "To clear: run the owner so the gate is recorded as passed, or clear the active "
        f"ticket in {pointer_path}. {USER_DECISION}"
    )
    used = len(header) + len(footer) + 2
    limit = MAX_REASON_CHARACTERS - OMITTED_GATES_RESERVE
    shown: list[str] = []
    for line in lines:
        if used + len(line) + 1 > limit:
            break
        shown.append(line)
        used += len(line) + 1
    if len(shown) < len(lines):
        shown.append(f"- ... and {len(lines) - len(shown)} more")
    return "\n".join([header, *shown, footer])


def check(root: Path) -> str | None:
    pointer_path = root / ACTIVE_TICKET_FILE
    ledger_path = root / LEDGER_FILE
    pointer = read_json_object(pointer_path)
    if pointer is None:
        return None
    ticket_id = active_ticket_id(pointer, pointer_path)
    if ticket_id is None:
        return None
    shown_id = echoable(ticket_id, TICKET_ID)
    ledger = read_json_object(ledger_path)
    if ledger is None:
        raise Blocked(
            f"Blocked: active ticket {shown_id} is set in {pointer_path} but the ledger "
            f"{ledger_path} is missing. Run the workflow-engine to record the ticket, or "
            f"clear the active ticket. {USER_DECISION}"
        )
    if ticket_id not in ledger:
        raise Blocked(
            f"Blocked: active ticket {shown_id} is not in the ledger {ledger_path}. "
            f"Run the workflow-engine to record the ticket, or clear the active ticket in "
            f"{pointer_path}. {USER_DECISION}"
        )
    ticket = ledger[ticket_id]
    if not isinstance(ticket, dict):
        raise malformed(ledger_path, f"ledger entry {shown_id} is not an object")
    if "required_gates" not in ticket:
        return None
    required_gates = validate_required_gates(ticket["required_gates"], ledger_path)
    lines = [
        f"- {echoable(name, GATE_NAME)} required — run {echoable(entry.get('owner'), OWNER)}"
        for name, entry in required_gates.items()
        if entry["refusal"] == "hard" and entry["phase"] == PRE_IMPLEMENTATION
        and is_unmet(ticket, name)
    ]
    if not lines:
        return None
    return unmet_gates_reason(shown_id, ledger_path, pointer_path, lines)


def blocking_reason(root: Path) -> str | None:
    try:
        reason = check(root)
    except Blocked as blocked:
        reason = str(blocked)
    return reason[:MAX_REASON_CHARACTERS] if reason else None


def ledger_root(cwd: str) -> Path:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=cwd, capture_output=True, text=True, timeout=2,
        )
    except (OSError, ValueError, subprocess.SubprocessError):
        return Path(cwd)
    top_level = result.stdout.strip()
    if result.returncode != 0 or not top_level:
        return Path(cwd)
    return Path(top_level)


def parse_payload(raw: bytes) -> tuple[str, str]:
    try:
        payload = json.loads(raw.decode("utf-8", errors="replace"))
    except RecursionError:
        raise UnusablePayload("payload is nested too deeply")
    except ValueError:
        raise UnusablePayload("payload is not valid JSON")
    if not isinstance(payload, dict):
        raise UnusablePayload("payload is not an object")
    if payload.get("tool_name") != "Bash":
        raise UnusablePayload("payload is not a Bash tool call")
    tool_input = payload.get("tool_input")
    command = tool_input.get("command") if isinstance(tool_input, dict) else None
    if not isinstance(command, str):
        raise UnusablePayload("payload has no command string")
    cwd = payload.get("cwd")
    return command, cwd if isinstance(cwd, str) and cwd else os.getcwd()


def deny(reason: str) -> dict:
    return {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }


def run(raw: bytes) -> int:
    command, cwd = parse_payload(raw)
    if not is_guarded_command(command):
        return 0
    reason = blocking_reason(ledger_root(cwd))
    if reason:
        print(json.dumps(deny(reason)))
    return 0


def main() -> int:
    try:
        return run(sys.stdin.buffer.read())
    except UnusablePayload as problem:
        message = str(problem)
    except Exception as failure:
        message = f"unexpected {type(failure).__name__}"
    print(f"commit gate skipped: {message}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
