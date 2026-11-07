#!/usr/bin/env python3
"""Mechanical gates for the framework repository.

Every check here exists because the thing it checks actually broke once. The
skills in this repo are markdown, so nothing compiles and no test suite runs —
which means a defect stays invisible until someone reads the exact line. These
are the reads, automated.

Run: python3 scripts/validate-framework.py
     python3 scripts/validate-framework.py --private-names-only
Exit: 0 if every gate passes, 1 otherwise (each failure is printed with its file).
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import re
import subprocess
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# The single reference file allowed to name a concrete backend product. Skills
# describe judgement and capability; a backend is an optional adapter.
ADAPTER_REFERENCE = "claude/skills/specialized/kai/references/rule-sources.md"

# Mechanisms that were retired. A reference to one is a promise the repo no
# longer keeps, which is the defect class this framework exists to catch.
RETIRED = [
    (r"\.aidevteam/learnings", "the /retro learnings store, which never existed"),
    (r"commands/retro\.md", "the removed /retro command"),
    (r"praxis-rules\.md", "renamed to references/rule-sources.md"),
    (r"file-based-learnings\.md", "replaced by references/rule-sources.md"),
]

# Hidden credential-shaped files. This repository is public.
CREDENTIAL_SHAPE = re.compile(
    r"(^|/)\.[^/]*(password|secret|credential|token)|\.(pem|key|p12|pfx)$|(^|/)id_(rsa|ed25519)",
    re.IGNORECASE,
)

# The private-names check reads a local file of names this public repository must
# never mention. The file is never tracked and its entries are never printed.
PRIVATE_NAMES_FILE_ENV = "AIDEVTEAM_PRIVATE_NAMES_FILE"
DEFAULT_PRIVATE_NAMES_FILE = ".aidevteam/private-names"
REGEX_ENTRY_PREFIX = "re:"
COMMIT_MESSAGE_SOURCE_FILE = "aidevteam-commit-msg-source"
EDITOR_TEMPLATE_MESSAGE_SOURCES = ("", "template", "squash")
SCISSORS_TAIL = " ------------------------ >8 ------------------------"
SCISSORS_LINE = re.compile(r"^(.) -{24} >8 -{24}$", re.MULTILINE)
EDITOR_TEMPLATE_LINE = re.compile(r"^(.) Please enter the commit message", re.MULTILINE)

# A tax-year label (2026/27, 2026-27, 2026–27, 2026/2027, FY2026/27) followed by
# "(current)", "(current year)" or "(current tax year)", in any case and with any
# mix of bold, italics, spaces, colons and dashes between the two.
CURRENT_TAX_YEAR_LABEL = re.compile(
    r"(?<!\d)(\d{4})\s?([/\-–—])\s?(\d{4}|\d{2})(?!\d)[*_\s:–—-]*"
    r"\(\s*current(?:\s+(?:tax\s+)?year)?\s*\)",
    re.IGNORECASE,
)
VERIFIED_PHRASE = re.compile(r"Verified against GOV\.UK on(?P<rest>.*)")
ISO_DATE = re.compile(r"(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)")
COMPLIANCE_SKILLS = "claude/skills/compliance/"
GRACE_DAYS = 30
ARCHIVE_PREFIX = "docs/archive/"


@dataclass
class Report:
    failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)

    def fail(self, gate: str, detail: str) -> None:
        self.failures.append(f"{gate}: {detail}")

    def warn(self, gate: str, detail: str) -> None:
        self.warnings.append(f"{gate}: {detail}")

    def skip(self, gate: str, detail: str) -> None:
        note = f"{gate}: {detail}"
        self.skipped.append(note)
        self.notes.append(note)


def summary_line(report: Report) -> str:
    passed = len(report.notes) - len(report.skipped)
    gates = "gate" if passed == 1 else "gates"
    if report.skipped:
        summary = f"{passed} {gates} passed, {len(report.skipped)} skipped"
    else:
        summary = f"All {passed} {gates} passed"
    if report.warnings:
        summary += f" with {len(report.warnings)} warning(s)"
    return f"{summary}."


def is_archived(rel: str) -> bool:
    return rel.startswith(ARCHIVE_PREFIX)


def tracked_files(root: Path = ROOT, include_archived: bool = False) -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=root, capture_output=True, text=True, check=True
    ).stdout
    return [f for f in out.split("\0") if f and (include_archived or not is_archived(f))]


def files_or_tracked(root: Path, files: list[str] | None) -> list[str]:
    return tracked_files(root) if files is None else files


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def uk_tax_year_start(day: date) -> date:
    start_year = day.year if (day.month, day.day) >= (4, 6) else day.year - 1
    return date(start_year, 4, 6)


def uk_tax_year(day: date) -> str:
    start_year = uk_tax_year_start(day).year
    return f"{start_year}/{(start_year + 1) % 100:02d}"


def first_iso_date(text: str) -> date | None:
    match = ISO_DATE.search(text)
    if match is None:
        return None
    try:
        return date.fromisoformat(match.group())
    except ValueError:
        return None


def normalise_tax_year_label(start: str, end: str) -> str | None:
    start_year = int(start)
    next_year = start_year + 1
    consecutive = int(end) == next_year if len(end) == 4 else int(end) == next_year % 100
    return f"{start_year}/{next_year % 100:02d}" if consecutive else None


def looks_like_year_month(separator: str, end: str) -> bool:
    return separator == "-" and len(end) == 2 and 1 <= int(end) <= 12


# --- G1 -- every skill's frontmatter parses, and carries name + description ----
# A skill whose frontmatter does not parse loads with EMPTY metadata: no
# description, so it can never auto-trigger. It looks correct in the file and
# passes review. This has happened: an unquoted value containing ": " is not a
# valid YAML scalar, and the skill about proving a change landed had not landed.
def gate_frontmatter(report: Report, root: Path = ROOT) -> None:
    try:
        import yaml  # noqa: PLC0415
    except ImportError:
        report.fail("G1 frontmatter", "PyYAML is not installed (pip install pyyaml)")
        return

    skills_dir = root / "claude" / "skills"
    skills = sorted(skills_dir.rglob("SKILL.md"))
    if not skills:
        report.fail("G1 frontmatter", f"no SKILL.md found under {skills_dir}")
        return

    for path in skills:
        rel = path.relative_to(root)
        text = read(path)
        if not text.startswith("---"):
            report.fail("G1 frontmatter", f"{rel}: no frontmatter block")
            continue
        parts = text.split("---", 2)
        if len(parts) < 3:
            report.fail("G1 frontmatter", f"{rel}: unterminated frontmatter")
            continue
        try:
            data = yaml.safe_load(parts[1])
        except yaml.YAMLError as exc:
            first = str(exc).split("\n")[0]
            report.fail("G1 frontmatter", f"{rel}: YAML does not parse -- {first}")
            continue
        if not isinstance(data, dict):
            report.fail("G1 frontmatter", f"{rel}: frontmatter is not a mapping")
            continue
        for key in ("name", "description"):
            if not data.get(key):
                report.fail("G1 frontmatter", f"{rel}: empty or missing '{key}'")
    report.notes.append(f"G1 frontmatter: {len(skills)} skills parsed")


# --- G2 -- the plugin manifests parse, and `version` stays deliberately absent -
# Omitting `version` is a decision, not an oversight: the commit SHA becomes the
# version, so every push is an update. Adding one silently changes distribution.
def gate_manifests(report: Report, root: Path = ROOT) -> None:
    for rel in (".claude-plugin/marketplace.json", "claude/.claude-plugin/plugin.json"):
        path = root / rel
        if not path.exists():
            report.fail("G2 manifests", f"{rel} is missing")
            continue
        try:
            data = json.loads(read(path))
        except json.JSONDecodeError as exc:
            report.fail("G2 manifests", f"{rel}: invalid JSON -- {exc}")
            continue
        # Valid JSON is not necessarily an object. Without this the next
        # `.get()` raises and aborts the whole run, so a malformed manifest
        # would take out every remaining gate instead of reporting itself.
        if not isinstance(data, dict):
            report.fail("G2 manifests", f"{rel}: top level is {type(data).__name__}, expected an object")
            continue
        if rel.endswith("plugin.json"):
            if "version" in data:
                report.fail(
                    "G2 manifests",
                    "claude/.claude-plugin/plugin.json defines 'version'. It is omitted on "
                    "purpose so the commit SHA is the version -- remove it, or change this gate "
                    "deliberately.",
                )
            for key in ("name", "description"):
                if not data.get(key):
                    report.fail("G2 manifests", f"{rel}: empty or missing '{key}'")
    report.notes.append("G2 manifests: both parse, plugin.json has no version key")


# --- G3 -- documented counts equal the tree ----------------------------------
# These drifted nine behind before anyone noticed, in four files at once.
def gate_counts(report: Report, root: Path = ROOT, files: list[str] | None = None) -> None:
    actual = {
        "skills": len(list((root / "claude" / "skills").rglob("SKILL.md"))),
        "commands": len(list((root / "claude" / "commands").glob("*.md"))),
        "templates": len(list((root / "claude" / "templates").glob("*.md"))),
    }
    patterns = [
        (re.compile(r"~?(\d+)\s+(?:specialist\s+)?(?:agent\s+)?skills?\b", re.I), "skills"),
        (re.compile(r"\*\*Skills\*\*:\s*(\d+)"), "skills"),
        (re.compile(r"(\d+)\s+slash commands?\b", re.I), "commands"),
        (re.compile(r"\*\*Commands\*\*:\s*(\d+)"), "commands"),
        (re.compile(r"(\d+)\s+document templates?\b", re.I), "templates"),
        (re.compile(r"\*\*Templates\*\*:\s*(\d+)"), "templates"),
    ]
    # The changelog records history: past releases legitimately state past counts.
    for rel in [f for f in files_or_tracked(root, files) if f.endswith(".md") and f != "CHANGELOG.md"]:
        for lineno, line in enumerate(read(root / rel).split("\n"), 1):
            for pattern, kind in patterns:
                for match in pattern.finditer(line):
                    claimed = int(match.group(1))
                    if claimed != actual[kind]:
                        report.fail(
                            "G3 counts",
                            f"{rel}:{lineno} claims {claimed} {kind}, tree has {actual[kind]} "
                            f"-- {match.group(0)!r}",
                        )
    report.notes.append(
        f"G3 counts: skills={actual['skills']} commands={actual['commands']} "
        f"templates={actual['templates']}"
    )


# --- G4 -- no link points at a file that is not there -------------------------
# Fenced blocks are skipped: several skills embed a template README for the
# user's project, and a link inside one is illustrative, not a reference to
# anything in this repository.
def strip_fenced(text: str) -> str:
    out, fence = [], None
    for line in text.split("\n"):
        stripped = line.lstrip()
        if fence is None and stripped.startswith("```"):
            fence = "`" * (len(stripped) - len(stripped.lstrip("`")))
            out.append("")
            continue
        if fence is not None:
            if stripped.startswith(fence):
                fence = None
            out.append("")
            continue
        out.append(line)
    return "\n".join(out)


def gate_links(report: Report, root: Path = ROOT, files: list[str] | None = None) -> None:
    link = re.compile(r"\[[^\]]*\]\(([^)#\s]+\.md)[^)]*\)")
    checked = 0
    for rel in [f for f in files_or_tracked(root, files) if f.endswith(".md")]:
        base = os.path.dirname(rel)
        for match in link.finditer(strip_fenced(read(root / rel))):
            target = match.group(1)
            if target.startswith(("http://", "https://", "mailto:")) or "{" in target:
                continue
            checked += 1
            # Resolve, then confirm the result is still inside the repository.
            # Without that, enough `../` segments (or a leading `/`) escape root
            # and the check silently passes against some unrelated file that
            # happens to exist on the runner -- a false negative in a gate,
            # which is worse than no gate.
            resolved = (root / os.path.normpath(os.path.join(base, target))).resolve()
            try:
                resolved.relative_to(root.resolve())
            except ValueError:
                report.fail("G4 links", f"{rel} -> {target} escapes the repository")
                continue
            if not resolved.exists():
                report.fail("G4 links", f"{rel} -> {target} does not exist")
    report.notes.append(f"G4 links: {checked} relative links resolved (fenced blocks skipped)")


# --- G5 -- no credential-shaped file is tracked -------------------------------
# Commits here have been staged with `git add -A`; a hidden secret dropped into
# the tree would be published by the next one.
def gate_credentials(report: Report, root: Path = ROOT, files: list[str] | None = None) -> None:
    for rel in files_or_tracked(root, files):
        if CREDENTIAL_SHAPE.search(rel):
            report.fail("G5 credentials", f"{rel} is tracked and looks like key material")
    report.notes.append("G5 credentials: no credential-shaped file is tracked")


# --- G6 -- no reference to a retired mechanism --------------------------------
def gate_retired(report: Report, root: Path = ROOT, files: list[str] | None = None) -> None:
    for rel in [f for f in files_or_tracked(root, files) if f.endswith(".md") and f != "CHANGELOG.md"]:
        text = read(root / rel)
        for pattern, why in RETIRED:
            if re.search(pattern, text):
                report.fail("G6 retired", f"{rel} still references {pattern!r} -- {why}")
    report.notes.append(f"G6 retired: {len(RETIRED)} retired mechanisms are unreferenced")


# --- G7 -- skills name no product outside the adapter reference ---------------
# Skills describe judgement and capability. A concrete backend is an optional
# adapter, named in a references/ file or docs/ -- never in a skill's contract,
# and never in frontmatter, which decides when the skill loads.
def gate_vendor_neutrality(report: Report, root: Path = ROOT, files: list[str] | None = None) -> None:
    products = re.compile(r"\bpraxis\b|\.praxis/", re.IGNORECASE)
    for rel in files_or_tracked(root, files):
        if not rel.startswith("claude/") or not rel.endswith(".md"):
            continue
        if rel == ADAPTER_REFERENCE:
            continue
        text = read(root / rel)
        if products.search(text):
            report.fail(
                "G7 vendor-neutrality",
                f"{rel} names a backend product. Skills describe capability; concrete "
                f"backends belong in {ADAPTER_REFERENCE} or docs/.",
            )
    report.notes.append(f"G7 vendor-neutrality: only {ADAPTER_REFERENCE} names a product")


# --- G7 (private names) -- no tracked path, line or commit message names a private project
# The names live in a local, untracked file because writing them into a check in
# this public repository would publish them. Every message therefore carries a
# location and an entry number, never the name, the pattern, or an exception.
PRIVATE_NAMES_GATE = "G7 private-names"


@dataclass(frozen=True)
class PrivateNameEntry:
    number: int
    pattern: re.Pattern[str]


@dataclass
class PrivateNames:
    entries: list[PrivateNameEntry] = field(default_factory=list)
    invalid_lines: list[int] = field(default_factory=list)


class PrivateNamesFileUnreadable(Exception):
    pass


def literal_whole_word(name: str) -> str:
    start = r"\b" if re.match(r"\w", name[0]) else ""
    end = r"\b" if re.match(r"\w", name[-1]) else ""
    return f"{start}{re.escape(name)}{end}"


def compile_private_name(entry: str) -> re.Pattern[str]:
    if entry.startswith(REGEX_ENTRY_PREFIX):
        pattern = re.compile(entry[len(REGEX_ENTRY_PREFIX):], re.MULTILINE)
    else:
        pattern = re.compile(literal_whole_word(entry), re.MULTILINE)
    if pattern.search(""):
        raise ValueError("pattern matches every line")
    return pattern


def load_private_names(path: Path) -> PrivateNames | None:
    try:
        lines = path.read_bytes().decode("utf-8-sig").split("\n")
    except FileNotFoundError:
        return None
    except Exception:
        raise PrivateNamesFileUnreadable from None

    names = PrivateNames()
    for number, line in enumerate(lines, 1):
        entry = line.strip()
        if not entry or entry.startswith("#"):
            continue
        try:
            names.entries.append(PrivateNameEntry(number, compile_private_name(entry)))
        except Exception:
            names.invalid_lines.append(number)
    return names


def git_output(root: Path, *args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=root, capture_output=True, text=True, check=True
    ).stdout


def main_checkout_root(root: Path) -> Path | None:
    try:
        toplevel = git_output(root, "rev-parse", "--show-toplevel").strip()
        first_worktree = git_output(root, "worktree", "list", "--porcelain").split("\n\n")[0]
    except (OSError, subprocess.CalledProcessError):
        return None
    fields = first_worktree.split("\n")
    if Path(toplevel).resolve() != root.resolve() or "bare" in fields:
        return None
    main_checkout = Path(fields[0].removeprefix("worktree "))
    return main_checkout if (main_checkout / ".git").exists() else None


def default_private_names_file(root: Path) -> Path:
    return (main_checkout_root(root) or root) / DEFAULT_PRIVATE_NAMES_FILE


def load_active_private_names(
    report: Report, root: Path, environ: Mapping[str, str]
) -> tuple[list[PrivateNameEntry], Path] | None:
    configured = environ.get(PRIVATE_NAMES_FILE_ENV)
    pattern_file = Path(configured) if configured else default_private_names_file(root)
    try:
        names = load_private_names(pattern_file)
    except PrivateNamesFileUnreadable:
        report.fail(PRIVATE_NAMES_GATE, "private-names file unreadable")
        return None
    if names is None:
        if configured:
            report.fail(
                PRIVATE_NAMES_GATE, "private-names file not found at the configured path"
            )
        else:
            is_linked_worktree = (root / ".git").is_file()
            report.skip(
                PRIVATE_NAMES_GATE,
                "skipped (list not found)" if is_linked_worktree else "skipped (no entries)",
            )
        return None
    for number in names.invalid_lines:
        report.fail(PRIVATE_NAMES_GATE, f"private-names line {number}: invalid pattern")
    if names.invalid_lines:
        return None
    if not names.entries:
        report.skip(PRIVATE_NAMES_GATE, "skipped (no entries)")
        return None
    return names.entries, pattern_file


def entries_checked(entries: list[PrivateNameEntry]) -> str:
    return f"{len(entries)} {'entry' if len(entries) == 1 else 'entries'} checked"


def staged_files(root: Path) -> list[str]:
    out = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "-z", "--diff-filter=ACMRT"],
        cwd=root,
        capture_output=True,
        check=True,
    ).stdout
    return [path.decode("utf-8", "surrogateescape") for path in out.split(b"\0") if path]


def working_tree_reader(root: Path) -> Callable[[str], bytes | None]:
    def read_bytes(rel: str) -> bytes | None:
        try:
            return (root / rel).read_bytes()
        except OSError:
            return None

    return read_bytes


def staged_reader(root: Path) -> Callable[[str], bytes | None]:
    def read_bytes(rel: str) -> bytes | None:
        shown = subprocess.run(["git", "show", f":{rel}"], cwd=root, capture_output=True)
        return shown.stdout if shown.returncode == 0 else None

    return read_bytes


def decode_utf8_or_none(data: bytes | None) -> str | None:
    if data is None:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def matching_line_numbers(pattern: re.Pattern[str], text: str) -> list[int]:
    line, position, lines = 1, 0, []
    for match in pattern.finditer(text):
        line += text.count("\n", position, match.start())
        position = match.start()
        lines.append(line)
    return sorted(set(lines))


def scan_private_names(
    report: Report,
    root: Path,
    entries: list[PrivateNameEntry],
    paths: list[str],
    read_bytes: Callable[[str], bytes | None],
    pattern_file: Path | None,
) -> None:
    excluded = pattern_file.resolve() if pattern_file else None
    for rel in paths:
        if excluded is not None and (root / rel).resolve() == excluded:
            continue
        path_matches = [entry.number for entry in entries if entry.pattern.search(rel)]
        for number in path_matches:
            report.fail(
                PRIVATE_NAMES_GATE, f"a tracked file path matches private-names entry #{number}"
            )
        if path_matches:
            continue
        text = decode_utf8_or_none(read_bytes(rel))
        if text is None:
            continue
        hits = sorted(
            (lineno, entry.number)
            for entry in entries
            for lineno in matching_line_numbers(entry.pattern, text)
        )
        for lineno, number in hits:
            report.fail(
                PRIVATE_NAMES_GATE, f"{rel}:{lineno} matches private-names entry #{number}"
            )


def gate_private_names(
    report: Report,
    root: Path = ROOT,
    files: list[str] | None = None,
    environ: Mapping[str, str] | None = None,
    staged: bool = False,
) -> None:
    active = load_active_private_names(report, root, os.environ if environ is None else environ)
    if active is None:
        return
    entries, pattern_file = active
    failures_before = len(report.failures)
    try:
        if staged:
            paths = staged_files(root) if files is None else files
            read_bytes = staged_reader(root)
        else:
            paths = tracked_files(root, include_archived=True) if files is None else files
            read_bytes = working_tree_reader(root)
        scan_private_names(report, root, entries, paths, read_bytes, pattern_file)
    except Exception:
        report.fail(PRIVATE_NAMES_GATE, "scan failed")
        return
    if len(report.failures) == failures_before:
        report.notes.append(f"{PRIVATE_NAMES_GATE}: {entries_checked(entries)}")


def configured_comment_prefix(root: Path) -> str | None:
    for key in ("core.commentString", "core.commentChar"):
        try:
            value = git_output(root, "config", "--get", key).strip()
        except (OSError, subprocess.CalledProcessError):
            continue
        if value:
            return value
    return None


def commit_comment_prefixes(root: Path, text: str) -> list[str]:
    configured = configured_comment_prefix(root)
    if configured is None:
        return ["#"]
    if configured != "auto":
        return [configured]
    template_line = SCISSORS_LINE.search(text) or EDITOR_TEMPLATE_LINE.search(text)
    return [template_line.group(1)] if template_line else []


def consume_commit_message_source(root: Path) -> str | None:
    try:
        record = Path(
            git_output(
                root, "rev-parse", "--path-format=absolute", "--git-path", COMMIT_MESSAGE_SOURCE_FILE
            ).strip()
        )
        source = record.read_text(encoding="utf-8").strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    with contextlib.suppress(OSError):
        record.unlink()
    return source


def commit_message_body(text: str, comment_prefixes: list[str], source: str | None) -> str:
    scissors_lines = tuple(f"{prefix}{SCISSORS_TAIL}" for prefix in comment_prefixes)
    lines = text.split("\n")
    scissors_at = next((i for i, line in enumerate(lines) if line.startswith(scissors_lines)), None)
    editor_ran = (
        scissors_at is not None
        or source is None
        or source in EDITOR_TEMPLATE_MESSAGE_SOURCES
    )
    body = lines if scissors_at is None else lines[:scissors_at]
    if editor_ran:
        body = [line for line in body if not line.startswith(tuple(comment_prefixes))]
    return "\n".join(body)


def gate_private_names_message(
    report: Report,
    message_file: Path,
    root: Path = ROOT,
    environ: Mapping[str, str] | None = None,
) -> None:
    source = consume_commit_message_source(root)
    active = load_active_private_names(report, root, os.environ if environ is None else environ)
    if active is None:
        return
    entries, _ = active
    try:
        raw = message_file.read_bytes().decode("utf-8", "replace")
    except Exception:
        report.fail(PRIVATE_NAMES_GATE, "commit message unreadable")
        return
    message = commit_message_body(raw, commit_comment_prefixes(root, raw), source)
    failures_before = len(report.failures)
    for entry in entries:
        if entry.pattern.search(message):
            report.fail(
                PRIVATE_NAMES_GATE, f"commit message matches private-names entry #{entry.number}"
            )
    if len(report.failures) == failures_before:
        report.notes.append(f"{PRIVATE_NAMES_GATE}: {entries_checked(entries)}")


# --- G8 -- UK tax tables name the tax year that is current today ---------------
# The accountant skill's rate tables mark one column "(current)". On 6 April the
# tax year rolls over and the marked column silently becomes last year's, while
# the file still reads as authoritative. Moving the marker means re-checking the
# figures, so every table carrying the marker needs a "Verified against GOV.UK
# on" line directly above it, and every such date must be real, within the
# current tax year and not in the future. For the first GRACE_DAYS days of a new
# tax year a stale marker or date is a warning rather than a failure.
def gate_uk_tax_year(
    report: Report,
    root: Path = ROOT,
    files: list[str] | None = None,
    today: date | None = None,
) -> None:
    today = today or date.today()
    expected = uk_tax_year(today)
    year_start = uk_tax_year_start(today)
    grace_end = year_start + timedelta(days=GRACE_DAYS)
    in_grace = today < grace_end

    def report_stale(location: str, detail: str) -> None:
        if in_grace:
            report.warn(
                "G8 uk-tax-year",
                f"{location} {detail}; refresh before {grace_end.day} "
                f"{grace_end:%B} (grace period)",
            )
        else:
            report.fail("G8 uk-tax-year", f"{location} {detail}")

    scanned = 0
    for rel in files_or_tracked(root, files):
        if not rel.startswith(COMPLIANCE_SKILLS) or not rel.endswith(".md"):
            continue
        scanned += 1
        lines = read(root / rel).split("\n")
        tables_without_verified_line: set[int] = set()
        for index, line in enumerate(lines):
            location = f"{rel}:{index + 1}"
            for match in CURRENT_TAX_YEAR_LABEL.finditer(line):
                start, separator, end = match.groups()
                label = normalise_tax_year_label(start, end)
                if label is None:
                    if not looks_like_year_month(separator, end):
                        report.fail(
                            "G8 uk-tax-year",
                            f"{location} marks {match.group(0)!r} as (current), which is "
                            f"not a tax-year label: the end year must follow the start year",
                        )
                    continue
                if label != expected:
                    report_stale(
                        location,
                        f"marks {label!r} as (current), but the current UK tax year "
                        f"is {expected!r}",
                    )
                if is_table_row(line):
                    table_start = table_start_index(lines, index)
                    if not has_verified_line_above(lines, table_start):
                        tables_without_verified_line.add(table_start)
            verified = VERIFIED_PHRASE.search(line)
            if verified:
                check_verified_date(
                    report, report_stale, location, verified.group("rest"), year_start, today
                )
        for table_start in sorted(tables_without_verified_line):
            report.fail(
                "G8 uk-tax-year",
                f"{rel}:{table_start + 1} table marks a tax year (current) but has no "
                f"'Verified against GOV.UK on' line directly above it",
            )
    report.notes.append(
        f"G8 uk-tax-year: {scanned} compliance files checked against tax year {expected}"
    )


def is_table_row(line: str) -> bool:
    return line.lstrip().startswith("|")


def table_start_index(lines: list[str], row_index: int) -> int:
    start = row_index
    while start > 0 and is_table_row(lines[start - 1]):
        start -= 1
    return start


def has_verified_line_above(lines: list[str], table_start: int) -> bool:
    index = table_start - 1
    while index >= 0 and not lines[index].strip():
        index -= 1
    return index >= 0 and VERIFIED_PHRASE.search(lines[index]) is not None


def check_verified_date(
    report: Report,
    report_stale: Callable[[str, str], None],
    location: str,
    rest: str,
    year_start: date,
    today: date,
) -> None:
    verified = first_iso_date(rest)
    if verified is None:
        report.fail(
            "G8 uk-tax-year",
            f"{location} 'Verified against GOV.UK on' needs an ISO date "
            f"(YYYY-MM-DD), found {rest.strip()!r}",
        )
    elif verified > today:
        report.fail(
            "G8 uk-tax-year",
            f"{location} verified on {verified.isoformat()}, which is in the future",
        )
    elif verified < year_start:
        report_stale(
            location,
            f"verified on {verified.isoformat()}, before the current tax year began on "
            f"{year_start.isoformat()}; re-check the figures and move the date",
        )


# --- G9 -- the plugin hooks manifest parses and points only at files that exist -
# A hook whose script path is wrong is skipped without a visible error, so the
# commit gate would silently stop guarding anything.
HOOKS_MANIFEST = "claude/hooks/hooks.json"
PLUGIN_ROOT_PATH = re.compile(r"\$\{CLAUDE_PLUGIN_ROOT\}/([^\s\"']+)")


def strings_in(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [text for item in value for text in strings_in(item)]
    if isinstance(value, dict):
        return [text for item in value.values() for text in strings_in(item)]
    return []


def runs_on_every_bash_call(hooks: dict) -> bool:
    entries = hooks.get("PreToolUse")
    return isinstance(entries, list) and any(
        isinstance(entry, dict) and entry.get("matcher") == "Bash" and entry.get("hooks")
        for entry in entries
    )


def gate_hooks(report: Report, root: Path = ROOT) -> None:
    path = root / HOOKS_MANIFEST
    if not path.exists():
        report.fail("G9 hooks", f"{HOOKS_MANIFEST} is missing")
        return
    try:
        data = json.loads(read(path))
    except json.JSONDecodeError as exc:
        report.fail("G9 hooks", f"{HOOKS_MANIFEST}: invalid JSON -- {exc}")
        return
    if not isinstance(data, dict) or not isinstance(data.get("hooks"), dict):
        report.fail("G9 hooks", f"{HOOKS_MANIFEST}: top level must be an object with a 'hooks' object")
        return
    failures_before = len(report.failures)
    if not runs_on_every_bash_call(data["hooks"]):
        report.fail("G9 hooks", f"{HOOKS_MANIFEST}: no PreToolUse entry with matcher 'Bash'")
    plugin_dir = (root / "claude").resolve()
    checked = 0
    for text in strings_in(data["hooks"]):
        for match in PLUGIN_ROOT_PATH.finditer(text):
            checked += 1
            target = (plugin_dir / match.group(1)).resolve()
            if plugin_dir not in target.parents or not target.exists():
                report.fail(
                    "G9 hooks",
                    f"{HOOKS_MANIFEST}: ${{CLAUDE_PLUGIN_ROOT}}/{match.group(1)} "
                    f"does not exist inside claude/",
                )
    if checked == 0:
        report.fail("G9 hooks", f"{HOOKS_MANIFEST}: no ${{CLAUDE_PLUGIN_ROOT}}/... path to check")
    if len(report.failures) == failures_before:
        report.notes.append(f"G9 hooks: manifest parses, {checked} plugin path(s) exist")


# --- G10 -- every gate declares the phase at which it must be passed -----------
# The commit gate blocks only on hard gates of the pre_implementation phase, and
# it reads the phase the workflow engine copies from workflow.yaml. A gate with no
# phase, or a schema that stops requiring one, leaves it guarding nothing.
WORKFLOW_PHASES = ("pre_implementation", "pre_done")
WORKFLOW_DEFINITIONS = (
    "claude/workflow/workflow.yaml",
    "examples/demo/.aidevteam/workflow.yaml",
)
WORKFLOW_SCHEMA = "claude/workflow/workflow.schema.json"


def gate_workflow_phases(report: Report, root: Path = ROOT) -> None:
    try:
        import yaml  # noqa: PLC0415
    except ImportError:
        report.fail("G10 phases", "PyYAML is not installed (pip install pyyaml)")
        return

    failures_before = len(report.failures)
    checked = 0
    for rel in WORKFLOW_DEFINITIONS:
        try:
            gates = yaml.safe_load(read(root / rel))["gates"]
        except (OSError, yaml.YAMLError, KeyError, TypeError) as exc:
            report.fail("G10 phases", f"{rel}: cannot read the gates -- {type(exc).__name__}")
            continue
        if not isinstance(gates, dict) or not gates:
            report.fail("G10 phases", f"{rel}: 'gates' must be a non-empty mapping")
            continue
        for name, gate in gates.items():
            checked += 1
            phase = gate.get("phase") if isinstance(gate, dict) else None
            if phase not in WORKFLOW_PHASES:
                report.fail(
                    "G10 phases",
                    f"{rel}: gate {name} has phase {phase!r}, expected one of {list(WORKFLOW_PHASES)}",
                )

    try:
        gate_schema = json.loads(read(root / WORKFLOW_SCHEMA))["properties"]["gates"]["additionalProperties"]
        requires_phase = "phase" in gate_schema["required"]
        phases = gate_schema["properties"]["phase"]["enum"]
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as exc:
        report.fail("G10 phases", f"{WORKFLOW_SCHEMA}: cannot read the gate definition -- {type(exc).__name__}")
        return
    if not requires_phase or list(phases) != list(WORKFLOW_PHASES):
        report.fail(
            "G10 phases",
            f"{WORKFLOW_SCHEMA}: gates must require 'phase' with enum {list(WORKFLOW_PHASES)}",
        )
    if len(report.failures) == failures_before:
        report.notes.append(f"G10 phases: {checked} gate(s) declare a valid phase")


STANDALONE_GATES = (gate_frontmatter, gate_manifests, gate_hooks, gate_workflow_phases)
ARCHIVE_SCANNING_GATES = (gate_private_names,)
FILE_GATES = (
    gate_counts,
    gate_links,
    gate_credentials,
    gate_retired,
    gate_vendor_neutrality,
    gate_private_names,
    gate_uk_tax_year,
)


def print_notes(report: Report) -> None:
    for note in report.notes:
        label = "skip" if note in report.skipped else "ok  "
        print(f"  {label} {note}")
    for warning in report.warnings:
        print(f"  warn {warning}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the framework's mechanical gates.")
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument(
        "--private-names-only",
        action="store_true",
        help="run only the private-names check, which needs nothing outside the standard library",
    )
    modes.add_argument(
        "--private-names-message",
        metavar="FILE",
        type=Path,
        help="check a commit message file against the private names",
    )
    parser.add_argument(
        "--staged",
        action="store_true",
        help="with --private-names-only, check the staged snapshot instead of the working tree",
    )
    args = parser.parse_args(argv)
    if args.staged and not args.private_names_only:
        parser.error("--staged requires --private-names-only")

    quiet_when_clean = args.staged or args.private_names_message is not None
    report = Report()
    if args.private_names_message:
        gate_private_names_message(report, args.private_names_message)
    elif args.private_names_only:
        gate_private_names(report, staged=args.staged)
    else:
        all_files = tracked_files(include_archived=True)
        files = [f for f in all_files if not is_archived(f)]
        for gate in STANDALONE_GATES:
            gate(report)
        for gate in FILE_GATES:
            gate(report, files=all_files if gate in ARCHIVE_SCANNING_GATES else files)

    if report.failures:
        if not quiet_when_clean:
            print_notes(report)
        print(f"\n{len(report.failures)} failure(s):\n", file=sys.stderr)
        for failure in report.failures:
            print(f"  FAIL {failure}", file=sys.stderr)
        return 1

    if not quiet_when_clean:
        print_notes(report)
        print(f"\n{summary_line(report)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
