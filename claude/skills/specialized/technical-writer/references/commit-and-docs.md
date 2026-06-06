# Commit Messages & Living Docs

Reference for the technical-writer standing duties: authoring commit messages, keeping
README/CHANGELOG current, generating release notes, and recommending CI gates.

---

## Conventional Commits

### Format

```
type(scope): subject

body

footer
```

- **type** (required): `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`, `style`, `revert`.
- **scope** (optional): the area touched, e.g. `retrieval`, `auth`, `api`, `ingest`.
- **subject** (required): imperative mood, no trailing period, **≤ 72 characters** including `type(scope): `.
- **body** (recommended): explain **WHAT changed and WHY**. The diff already shows *how* — do not narrate the code. Wrap at ~72 columns.
- **footer** (optional): `Refs: KEY-123`, `Closes: KEY-123`, `BREAKING CHANGE: <description>`.

### Hard rules

- Commit messages and PR descriptions **MAY** reference ticket/issue keys — correct VCS practice.
- Code and Javadoc **MUST NOT** carry ticket IDs / ADR numbers / review-condition codes / persona / sprint names — keep those facts-only.
- **NEVER** add a `Co-Authored-By` trailer to a commit or PR.
- Subject is specific: never "fix stuff", "updates", "wip", "misc".

### Reconcile-against-requirements workflow

Before writing the message:

1. List the commits in the sprint/phase (`git log --oneline <base>..HEAD`).
2. Read the acceptance criteria / plan the work was supposed to satisfy.
3. For each commit, write a subject + body that names the actual behaviour change and the
   reason for it — matched to the requirement it advances.
4. If a commit does not map to any requirement, say so (it may be incidental cleanup —
   `chore`/`refactor`) or flag it as scope creep.

### Examples

```
feat(auth): add invite-redemption page with auto sign-in

New users following an invite link land on a redemption page that sets
their password and signs them in automatically. Auto sign-in is scoped to
the invite flow only; password-reset still requires an explicit login.

Refs: KEY-204
```

```
fix(retrieval): clamp page size to documented maximum

The list endpoint promised "at most 50 results" but the query had no LIMIT,
so a large page-size request could scan the whole table. Clamp over-cap
limits down to the maximum (rather than rejecting with HTTP 400) and fall
back to the default when limit is absent.

Refs: KEY-1421
```

```
docs(readme): document the provider-selection config keys

Adapter selection moved to config; record the available provider values and
their defaults so operators can switch backends without reading the source.
```

---

## CHANGELOG (Keep a Changelog)

Maintain an `Unreleased` section; promote it on release.

```markdown
# Changelog

All notable changes to this project are documented here.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

### Added
- {new capability, user-visible}

### Changed
- {behaviour change}

### Fixed
- {bug fix}

### Deprecated
- {feature scheduled for removal}

### Removed
- {feature removed}

### Security
- {security-relevant change}

## [1.2.0] - 2026-01-15

### Added
- ...
```

Entries are written for humans (what changed, why it matters), not copied from commit subjects verbatim.

---

## Release notes from a commit range

```bash
# Collect commits since the last tag, grouped by Conventional-Commit type
git log "$(git describe --tags --abbrev=0)"..HEAD --pretty=format:'%s'
```

Group by type into reader-friendly headings:

```markdown
## Release {version} — {date}

### Features
- ...

### Fixes
- ...

### Performance
- ...

### Documentation
- ...

**Breaking changes**
- ...
```

---

## PR-description template

```markdown
## Summary
<!-- One or two sentences: what this PR delivers and why. -->

## Changes
<!-- Bullet list of the meaningful changes (behaviour, API, config). -->
-

## Risk
<!-- Blast radius, rollback plan, migrations, feature flags, backward-compat notes. -->

## Test evidence
<!-- What was run and the result: unit/integration/e2e, benchmark scenarios,
     screenshots, command output. Link CI run. -->
```

---

## Recommended CI gates

### commitlint-style message check

Enforce Conventional Commits and reject a `Co-Authored-By` trailer.

`commitlint.config.js`:

```js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 72],
    'subject-empty': [2, 'never'],
    'type-empty': [2, 'never'],
  },
  // Reject co-author attribution.
  plugins: [
    {
      rules: {
        'no-coauthor': ({ body }) =>
          [!/Co-Authored-By/i.test(body || ''), 'Co-Authored-By trailer is not allowed'],
      },
    },
  ],
};
```

Add `'no-coauthor': [2, 'always']` to `rules` to activate the custom rule.

### docs-freshness gate

Fail the build when a public API / CLI / config surface changed without a matching
README/CHANGELOG update. Sketch (adjust globs to the project):

```bash
#!/usr/bin/env bash
set -euo pipefail
base="${1:-origin/main}"
changed="$(git diff --name-only "$base"...HEAD)"

api_touched=$(echo "$changed" | grep -E '(controller|Controller|openapi|cli|config|application\.ya?ml)' || true)
docs_touched=$(echo "$changed" | grep -E '(README|CHANGELOG)' || true)

if [[ -n "$api_touched" && -z "$docs_touched" ]]; then
  echo "Doc drift: public surface changed but README/CHANGELOG were not updated."
  echo "$api_touched"
  exit 1
fi
```

---

## Stakeholder docs reuse

Stakeholder-readable Gherkin feature files double as living, human-readable proof
artifacts. Link or embed them in the docs rather than re-describing the same behaviour
in prose — the scenario plus its passing run IS the proof. Keep developer docs
(README/CHANGELOG) and these stakeholder docs current together.
