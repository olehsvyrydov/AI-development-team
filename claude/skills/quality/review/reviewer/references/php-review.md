# Code Review — PHP/Laravel

> Loaded by /rev for PHP/Laravel code review (Psalm/PHPStan; Laravel patterns).


# PHP Code Reviewer [Extends /rev]

## Trigger

Use this skill when /rev is reviewing:
- PHP/Laravel code (`.php`, `composer.json`)
- PHP test code (PHPUnit, Pest)
- Filament admin panels, Livewire, Blade templates

## Context

You are a Senior PHP Code Reviewer with 10+ years of PHP experience and deep expertise in Laravel ecosystem. This skill extends `/rev` with PHP-specific checklists, nullable dereference patterns, and static analysis tool commands.

## Documentation Lookup (MANDATORY)

Use Context7 MCP and WebSearch before reviewing — see `/rev` for details.

**Example queries:**
- "Laravel 12 Eloquent best practices"
- "Filament 3 widget registration"
- "PHPStan level 8 configuration"
- "Pest testing assertions"

## Code Quality Tools

### PHPStan (Static Analysis)
- **Version**: 2.x+
- **Purpose**: Find bugs via static analysis
- **Levels**: 0 (loose) to 9 (strictest); level 8+ catches nullable dereferences

### Psalm (Type Analysis)
- **Version**: 6.x+
- **Purpose**: Type safety and taint analysis
- **Detects**: Nullable dereferences, type mismatches, taint flows (XSS, SQL injection)

### PHP CS Fixer / Pint (Style Enforcement)
- **Purpose**: PSR-12 / Laravel style enforcement

## Static Analysis Commands (/rev runs these directly)

### PHPStan (catches nullable dereferences at level 8+)
```bash
vendor/bin/phpstan analyse --level=8 app/ tests/
```

### Psalm (type safety + taint analysis)
```bash
vendor/bin/psalm --show-info=true
```

### PHP CS Fixer / Pint
```bash
vendor/bin/pint --test
# or
vendor/bin/php-cs-fixer fix --dry-run --diff
```

### Dependency vulnerabilities
```bash
composer audit
```

## Nullable Dereference Detection (CRITICAL)

### Dangerous Patterns — Flag as BLOCKING

| Pattern | Risk | Fix |
|---------|------|-----|
| `$response->json('key')->method()` | null if key missing | Null-check or `assertNotNull()` |
| `$model->relation->field` | null if relation not loaded | `assertNotNull($model->relation)` first |
| `collect($items)->first()->property` | `first()` returns null on empty | Guard with `assertNotNull()` |
| `$request->user()->id` | null if unauthenticated | Check auth first or use middleware |
| `$model->relation()->first()->field` | null if no results | Guard with null check |
| `optional($obj)->method()` used as non-null | `optional()` returns null silently | Don't chain if you need the value |

### Correct Pattern
```php
// BAD — null dereference if relation not loaded
$this->assertEquals('admin', $user->role->name);

// GOOD — null-safe with assertion
$this->assertNotNull($user->role, 'User should have a role');
$this->assertEquals('admin', $user->role->name);

// GOOD — PHP 8.0+ nullsafe operator (non-test code)
$roleName = $user->role?->name;
```

### How to Detect
1. **Manual grep** during Pass 2: search for `->first()->`, `->json(`, `->user()->`, `->relation->` without null checks
2. **Run PHPStan** at level 8+ (see command above) — catches most nullable dereferences
3. **Run Psalm** for deeper type analysis and taint detection

## PHP/Laravel Code Quality Checklist

- [ ] No PHPStan errors at configured level
- [ ] PSR-12 / Laravel coding style (Pint passes)
- [ ] Proper use of Eloquent (no raw queries without parameterization)
- [ ] Mass assignment protection (`$fillable` or `$guarded` configured)
- [ ] Proper validation on all request inputs
- [ ] No `env()` calls outside config files
- [ ] Queue jobs are idempotent
- [ ] Middleware applied correctly
- [ ] Database migrations are reversible
- [ ] No N+1 queries (use `with()` eager loading)
- [ ] Service classes for business logic (not in controllers)
- [ ] Form Requests for validation (not inline `$request->validate()`)
- [ ] Proper use of PHP 8.x features (enums, named args, match, readonly)
- [ ] No debug statements (`dd()`, `dump()`, `var_dump()`)
- [ ] `strict_types=1` declared

## Widget & Admin Panel Review Checklist

When reviewing code that touches admin panel widgets (Filament, Nova, etc.):

- [ ] **Widget registration audit** — verify widgets use exactly ONE registration path (auto-discovery, explicit PHP, or blade). Mixed paths cause duplication.
- [ ] **`$isDiscovered = false`** present on all widgets explicitly registered on custom pages
- [ ] **Blade template check** — ensure custom page blade doesn't manually render widgets that the parent component already renders automatically
- [ ] **Widget count verification** — E2E or integration test exists that asserts the expected number of widgets on the page

## Translation Key Review Checklist

When reviewing code that adds new user-facing or admin-facing text:

- [ ] **All `__()` keys exist** in every supported locale file (en, uk, etc.)
- [ ] **No raw translation keys** will appear in the UI — check that keys are not just referenced but actually defined
- [ ] **Locale files updated in the SAME commit** as the code that uses the keys
- [ ] **Select/dropdown options** all use translation keys (easy to miss individual options)
- [ ] **Helper text and placeholders** use translation keys (often forgotten)
- [ ] **JS i18n files updated for Vue/Inertia components** — Laravel PHP `lang/` and JavaScript `resources/js/i18n/` are separate systems. If the feature uses `t('key')` in Vue components, verify keys exist in BOTH PHP and JS bundles

## Staging Verification for UI Features

For features with visual output (admin dashboards, widgets, form changes):

- [ ] **Quick staging check** — after approving code, do a 5-minute visual verification on staging
- [ ] **Both locales verified** — switch locale and confirm labels/text render correctly
- [ ] **Widget deduplication check** — visually confirm widgets appear the expected number of times

## Code Smells (PHP-Specific)

| Smell | Detection | Action |
|-------|-----------|--------|
| N+1 Queries | Loop with relation access | Use `with()` eager loading |
| Fat Controller | Business logic in controller | Extract to Service class |
| Raw DB queries | `DB::raw()` without binding | Use parameterized queries |
| Missing `$fillable` | Mass assignment unprotected | Define `$fillable` or `$guarded` |
| `env()` in code | Config not cached properly | Use `config()` instead |
| Mixed registration | Widget auto-discover + manual | Pick ONE path |

## Security Checklist (PHP/Laravel)

- [ ] No SQL injection (use Eloquent or parameterized queries)
- [ ] No XSS (Blade `{{ }}` escaping, not `{!! !!}` without sanitization)
- [ ] CSRF protection on all forms
- [ ] Proper authentication/authorization (Gates, Policies)
- [ ] Mass assignment protection
- [ ] File upload validation (type, size, extension)
- [ ] No `eval()` or dynamic code execution
- [ ] Rate limiting on sensitive endpoints
- [ ] Sensitive data not logged

## Related Skills

- **laravel-developer**: Laravel best practices, implementation patterns
- **secops-engineer**: Security review, vulnerability assessment
- **frontend-reviewer**: For Blade/Livewire frontend concerns
- **solution-architect**: Architecture pattern validation
