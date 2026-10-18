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
import json
import os
import re
import subprocess
import sys
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date
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

# A tax-year label (2026/27 or 2026-27) followed by "(current)", in any case and
# with any mix of bold, italics and spaces between the two.
CURRENT_TAX_YEAR_LABEL = re.compile(
    r"\b(\d{4}[/-]\d{2})\b[*_\s]*\(current\)", re.IGNORECASE
)
VERIFIED_DATE_LINE = re.compile(r"Verified against GOV\.UK on(?P<rest>.*)")
ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")
COMPLIANCE_SKILLS = "claude/skills/compliance/"


@dataclass
class Report:
    failures: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)

    def fail(self, gate: str, detail: str) -> None:
        self.failures.append(f"{gate}: {detail}")

    def skip(self, gate: str, detail: str) -> None:
        self.skipped.append(gate)
        self.notes.append(f"{gate}: {detail}")


def summary_line(report: Report) -> str:
    if not report.skipped:
        return f"All {len(report.notes)} gates passed."
    passed = len(report.notes) - len(report.skipped)
    return f"{passed} gates passed, {len(report.skipped)} skipped."


def tracked_files(root: Path = ROOT) -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=root, capture_output=True, text=True, check=True
    ).stdout
    return [f for f in out.split("\0") if f and not f.startswith("docs/archive/")]


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


def is_iso_date(text: str) -> bool:
    if not ISO_DATE.fullmatch(text):
        return False
    try:
        date.fromisoformat(text)
    except ValueError:
        return False
    return True


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


# --- G7 (private names) -- no tracked path or line names a private project ------
# The names live in a local, untracked file because writing them into a check in
# this public repository would publish them. Every message therefore carries a
# location and an entry number, never the name, the pattern, or an exception.
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
        pattern = re.compile(entry[len(REGEX_ENTRY_PREFIX):])
    else:
        pattern = re.compile(literal_whole_word(entry))
    if pattern.search(""):
        raise ValueError("pattern matches every line")
    return pattern


def load_private_names(path: Path) -> PrivateNames:
    try:
        lines = path.read_bytes().decode("utf-8-sig").split("\n")
    except FileNotFoundError:
        return PrivateNames()
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


def read_utf8_or_none(path: Path) -> str | None:
    try:
        return path.read_bytes().decode("utf-8")
    except (OSError, UnicodeDecodeError):
        return None


def scan_private_names(
    report: Report,
    root: Path,
    files: list[str] | None,
    entries: list[PrivateNameEntry],
    pattern_file: Path,
) -> None:
    gate = "G7 private-names"
    pattern_file = pattern_file.resolve()
    for rel in files_or_tracked(root, files):
        if (root / rel).resolve() == pattern_file:
            continue
        path_matches = [entry.number for entry in entries if entry.pattern.search(rel)]
        for number in path_matches:
            report.fail(gate, f"a tracked file path matches private-names entry #{number}")
        if path_matches:
            continue
        text = read_utf8_or_none(root / rel)
        if text is None:
            continue
        for lineno, line in enumerate(text.split("\n"), 1):
            for entry in entries:
                if entry.pattern.search(line):
                    report.fail(
                        gate,
                        f"{rel}:{lineno} matches private-names entry #{entry.number}",
                    )


def gate_private_names(
    report: Report,
    root: Path = ROOT,
    files: list[str] | None = None,
    environ: Mapping[str, str] | None = None,
) -> None:
    gate = "G7 private-names"
    environ = os.environ if environ is None else environ
    pattern_file = Path(environ.get(PRIVATE_NAMES_FILE_ENV) or root / DEFAULT_PRIVATE_NAMES_FILE)
    try:
        names = load_private_names(pattern_file)
    except PrivateNamesFileUnreadable:
        report.fail(gate, "private-names file unreadable")
        return
    for number in names.invalid_lines:
        report.fail(gate, f"private-names line {number}: invalid pattern")
    if names.invalid_lines:
        return
    if not names.entries:
        report.skip(gate, "skipped (no entries)")
        return
    try:
        scan_private_names(report, root, files, names.entries, pattern_file)
    except Exception:
        report.fail(gate, "scan failed")
        return
    report.notes.append(f"{gate}: {len(names.entries)} entries checked")


# --- G8 -- UK tax tables name the tax year that is current today ---------------
# The accountant skill's rate tables mark one column "(current)". On 6 April the
# tax year rolls over and the marked column silently becomes last year's, while
# the file still reads as authoritative. Moving the marker means re-checking the
# figures, so every "Verified against GOV.UK on" date must be a real date that
# falls within the current tax year and is not in the future.
def gate_uk_tax_year(
    report: Report,
    root: Path = ROOT,
    files: list[str] | None = None,
    today: date | None = None,
) -> None:
    today = today or date.today()
    expected = uk_tax_year(today)
    year_start = uk_tax_year_start(today)
    scanned = 0
    for rel in files_or_tracked(root, files):
        if not rel.startswith(COMPLIANCE_SKILLS) or not rel.endswith(".md"):
            continue
        scanned += 1
        for lineno, line in enumerate(read(root / rel).split("\n"), 1):
            for match in CURRENT_TAX_YEAR_LABEL.finditer(line):
                found = match.group(1).replace("-", "/")
                if found != expected:
                    report.fail(
                        "G8 uk-tax-year",
                        f"{rel}:{lineno} marks {found!r} as (current), "
                        f"but the current UK tax year is {expected!r}",
                    )
            verified = VERIFIED_DATE_LINE.search(line)
            if verified:
                check_verified_date(
                    report, f"{rel}:{lineno}", verified.group("rest"), year_start, today
                )
    report.notes.append(
        f"G8 uk-tax-year: {scanned} compliance files checked against tax year {expected}"
    )


def check_verified_date(
    report: Report, location: str, rest: str, year_start: date, today: date
) -> None:
    text = rest.strip().rstrip(".")
    if not is_iso_date(text):
        report.fail(
            "G8 uk-tax-year",
            f"{location} 'Verified against GOV.UK on' needs an ISO date "
            f"(YYYY-MM-DD), found {rest.strip()!r}",
        )
        return
    verified = date.fromisoformat(text)
    if verified < year_start:
        report.fail(
            "G8 uk-tax-year",
            f"{location} verified on {text}, before the current tax year began on "
            f"{year_start.isoformat()}; re-check the figures and move the date",
        )
    elif verified > today:
        report.fail(
            "G8 uk-tax-year",
            f"{location} verified on {text}, which is in the future",
        )


ALL_GATES = (
    gate_frontmatter,
    gate_manifests,
    gate_counts,
    gate_links,
    gate_credentials,
    gate_retired,
    gate_vendor_neutrality,
    gate_private_names,
    gate_uk_tax_year,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run the framework's mechanical gates.")
    parser.add_argument(
        "--private-names-only",
        action="store_true",
        help="run only the private-names check, which needs nothing outside the standard library",
    )
    args = parser.parse_args(argv)

    report = Report()
    for gate in (gate_private_names,) if args.private_names_only else ALL_GATES:
        gate(report)

    for note in report.notes:
        label = "skip" if note.split(":")[0] in report.skipped else "ok  "
        print(f"  {label} {note}")

    if report.failures:
        print(f"\n{len(report.failures)} failure(s):\n", file=sys.stderr)
        for failure in report.failures:
            print(f"  FAIL {failure}", file=sys.stderr)
        return 1

    print(f"\n{summary_line(report)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
