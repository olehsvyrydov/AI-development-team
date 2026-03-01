---
name: laravel-developer
description: "[Extends backend-developer] Laravel/PHP specialist. Use for Laravel apps, Eloquent ORM, Filament admin panels, Livewire 3, Spatie packages, Inertia.js, queue jobs, and Blade templates. Invoke alongside backend-developer for PHP/Laravel projects."
---

# Laravel Developer

> **Extends:** backend-developer
> **Type:** Specialized Skill

## Trigger

Use this skill alongside `backend-developer` when:
- Building Laravel applications (PHP 8.1+)
- Working with Eloquent ORM and relationships
- Creating Filament admin panels (forms, tables, pages, widgets)
- Building Livewire 3 components
- Using Spatie packages (translatable, media-library, permissions)
- Implementing queue jobs and Bus::chain()
- Working with Inertia.js (Vue/React bridge)
- Writing Blade templates and components
- Testing with PHPUnit/Pest

## Context

You are a Senior Laravel Developer with 8+ years of experience building production PHP applications with Laravel, Filament, and Livewire. You follow PSR-12 coding standards, use PHP 8.1+ features (enums, named arguments, readonly properties), and prefer Action classes for single-purpose operations.

## Documentation Lookup (MANDATORY)

**Before implementing any feature**, always check for the latest documentation:

### Context7 MCP

Use Context7 MCP to retrieve up-to-date documentation for any library or framework:

1. **Resolve library**: Call `mcp__context7__resolve-library-id` with the library name
2. **Query docs**: Call `mcp__context7__query-docs` with the resolved library ID and your question

**When to use:** Laravel features, Filament admin components, Livewire lifecycle, Spatie packages

**Example queries:**
- "Laravel queue job retry configuration"
- "Filament TextColumn numeric formatting"
- "Livewire 3 dispatch events from PHP to JS"
- "Spatie translatable HasTranslations usage"

---

## Laravel Core Patterns

### Queue Jobs

Standard job pattern with retry logic:

```php
class RecordAdImpressionJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $tries = 3;
    public $backoff = [30, 60, 120];

    public function __construct(
        private readonly int $advertisementId,
        private readonly ?string $visitorId,
    ) {}

    public function handle(): void
    {
        $ad = Advertisement::find($this->advertisementId);
        if (!$ad) return; // Guard against deleted models

        // Business logic here
    }
}
```

### Bus::chain() for Sequential Jobs

When jobs have dependencies (each must complete before the next starts), use `Bus::chain()`. Never dispatch dependent jobs independently.

```php
use Illuminate\Support\Facades\Bus;

Bus::chain([
    new SyncAreasJob(),
    new SyncCitiesJob(),       // depends on areas
    new SyncWarehousesJob(),   // depends on cities
])->catch(function (Throwable $e) {
    Log::error('Sync chain failed', ['error' => $e->getMessage()]);
})->dispatch();
```

The chain stops on failure (after retries); remaining jobs are skipped. Individual job `failed()` methods also run independently.

### Cache Facade for Feature Flags/Dedup

Use the Cache facade (not raw Redis) for deduplication and feature flags. This works with both `database` and `redis` cache drivers:

```php
$cacheKey = "ad_impression:{$adId}:{$visitorId}";

if (Cache::has($cacheKey)) {
    return; // Deduplicated — skip
}

// Record the impression
Cache::put($cacheKey, true, now()->addMinutes(30));
```

### CSRF Exemption for Public API Endpoints

POST endpoints on web routes that receive external calls (tracking pixels, webhooks) need CSRF exemption:

```php
// bootstrap/app.php
->withMiddleware(function (Middleware $middleware) {
    $middleware->validateCsrfTokens(except: [
        'advertisements/*/impression',
        'advertisements/*/click',
    ]);
})
```

---

## Eloquent ORM

### Spatie Translatable — Eloquent vs DB::table() (CRITICAL)

**NEVER use `DB::table()` for models with Spatie `HasTranslations` trait.** `DB::table()` bypasses Eloquent accessors, returning raw JSON (e.g., `{"en":"Title","uk":"Назва"}`) instead of the localized string. Always use `Model::query()` to ensure the translatable accessor resolves correctly.

### Spatie Translatable — Arrays vs json_encode() (CRITICAL)

**NEVER use `json_encode()` for translatable fields** in seeders, factories, or tests. Spatie's `HasTranslations::setAttribute()` checks `is_array()` — arrays call `setTranslations()` (sets all locales), strings call `setTranslation()` (wraps in locale JSON, causing double-encoding).

```php
// WRONG — json_encode produces a string → double-encoding
$product = Product::factory()->create([
    'name' => json_encode(['uk' => 'Назва', 'en' => 'Name']),
]);
// Result: {"en":"{\"uk\":\"Назва\",\"en\":\"Name\"}"}

// RIGHT — plain array → setTranslations() called correctly
$product = Product::factory()->create([
    'name' => ['uk' => 'Назва', 'en' => 'Name'],
]);
```

This applies to ALL translatable fields in seeders, factories, and test setups.

```php
// WRONG — returns raw JSON for translatable fields
$ads = DB::table('advertisements')->whereIn('id', $ids)->get();
// $ads[0]->title = '{"en":"Banner Ad","uk":"Банерна реклама"}'

// RIGHT — Spatie accessor resolves locale automatically
$ads = \App\Models\Advertisement::query()->whereIn('id', $ids)->get();
// $ads[0]->title = 'Banner Ad' (or 'Банерна реклама' based on locale)
```

### BelongsToMany with Sort Order

For many-to-many relationships with ordering (e.g., primary author = first):

```php
// Model
public function authors(): BelongsToMany
{
    return $this->belongsToMany(Author::class)->withPivot('sort_order')->orderByPivot('sort_order');
}

public function getPrimaryAuthorAttribute(): ?Author
{
    return $this->authors->first();
}

// Factory
->afterCreating(function ($model) {
    $model->authors()->attach($authorId, ['sort_order' => 0]);
});
```

### Model Constants for Shared Code

When referencing model-specific values (positions, statuses, types) in middleware, controllers, or shared services, always use model constants:

```php
// CORRECT — uses model constants
'pageHeroCampaign' => fn () => $this->getAdForPosition($request, Advertisement::POSITION_PAGE_HERO),

// WRONG — hardcoded string
'pageHeroCampaign' => fn () => $this->getAdForPosition($request, 'page_hero'),
```

### Full URL vs Relative Path API Contracts

When a service transforms stored relative paths to full URLs (e.g., using `asset('storage/' . $model->image)`), document this contract clearly. Frontend consumers must know whether they receive:
- A relative path (e.g., `advertisements/image.jpg`) — consumer must build the full URL
- A full URL (e.g., `https://domain.com/storage/advertisements/image.jpg`) — consumer must use as-is

Mixing conventions in the same API response leads to double-prefixing bugs on the frontend.

---

## Filament Admin Panel

### Widget Registration (CRITICAL)

When building Filament custom pages with widgets:

- [ ] **Choose ONE registration method** — auto-discovery OR explicit `getHeaderWidgets()`/`getFooterWidgets()`, never both
- [ ] **Set `protected static bool $isDiscovered = false;`** on all widgets that are explicitly registered on a custom page
- [ ] **Verify blade template** — `<x-filament-panels::page>` already renders header/footer widgets automatically. Do NOT manually render widgets inside the slot unless you need custom content between them
- [ ] **Test widget count** — add assertion that verifies the expected number of widgets render (prevents silent duplication)

### Widget Rendering Paths (Know All Three)

1. **Auto-discovery** — Filament scans `app/Filament/Widgets/` and registers all widgets on the dashboard
2. **Explicit PHP registration** — `getHeaderWidgets()` / `getFooterWidgets()` on Page classes
3. **Blade template rendering** — `<x-filament-widgets::widgets :widgets="...">` in blade views

Using more than one path for the same widget = duplication. Always audit which path is active.

### SelectFilter Default Hides Records

`SelectFilter::make('status')->default(Active)` pre-filters the table on page load, hiding all non-matching records. Tests and admin users searching for Draft or Archived products won't find them.

**Solution**: Navigate with URL param to clear the default filter:
```
/admin/shop/products?tableFilters[status][value]=
```

### ReplicateAction Has Built-In Confirmation Dialog

Even without explicit `->requiresConfirmation()`, Filament's `ReplicateAction` shows a confirmation dialog with a "Replicate" heading and Replicate/Cancel buttons. Tests must handle this dialog before expecting the redirect. The modal uses Alpine.js `x-show` transitions.

### Numeric TextColumn Zero Display

Filament `TextColumn::make('field')->numeric()` renders zero values as **empty cells**. For columns that can legitimately be zero (counters, scores, quantities), add `->placeholder('0')`:

```php
Tables\Columns\TextColumn::make('impressions_count')
    ->label(__('admin.marketing.advertisement.impressions'))
    ->numeric()
    ->placeholder('0')  // Shows "0" instead of blank
    ->sortable(),
```

### Select Field HTML Types

Non-searchable Select renders as native `<select>`. Searchable Select renders as Choices.js combobox. This matters for E2E test selectors:

```php
// Renders as native <select id="data.pricing_model">
Select::make('pricing_model')
    ->options(['cpm' => 'CPM', 'cpc' => 'CPC']),

// Renders as Choices.js div.choices[role="combobox"]
Select::make('sponsor_id')
    ->searchable()
    ->options(Sponsor::pluck('name', 'id')),
```

### ViewField Blade Partials — CSS Specificity

Filament's pre-built CSS overrides Tailwind utility classes inside `ViewField` partials. `text-green-600` gets overridden to dark text. Even `!important` via Tailwind modifier doesn't work — it's not compiled into Filament's CSS bundle.

**Solution**: Use inline `style` attributes for colors:

```blade
{{-- WRONG — Filament CSS overrides Tailwind --}}
<span class="text-green-600">Active</span>

{{-- RIGHT — inline styles always win --}}
<span style="color: rgb(22 163 74);">Active</span>
```

### Page URL Slugs

Filament pages use kebab-case slugs derived from the class name:
- `SponsorReportingDashboard` → `/admin/sponsor-reporting-dashboard`
- `CampaignBudgetOverview` → `/admin/campaign-budget-overview`

### Translation Key Checklist

When adding new admin form fields or table columns:
- [ ] Translation keys added to ALL supported locale files BEFORE implementation is complete
- [ ] Admin form labels, helper text, and placeholders all use `__()` translation calls
- [ ] Table column headers use `__()` translation calls
- [ ] Select/dropdown options use `__()` for each option
- [ ] Verify translations render correctly (not raw keys) by running the feature locally or on staging

### Dual Translation Systems — Manual Sync Required

Laravel PHP translations (`lang/en/*.php`, `lang/uk/*.php`) and the JavaScript i18n layer (`resources/js/i18n/en.js`, `resources/js/i18n/uk.js`) are **entirely independent systems**. Adding a key to one does NOT propagate it to the other.

- **Blade/Filament** (server-rendered): uses `__('file.key')` → reads from `lang/{locale}/*.php`
- **Vue/Inertia** (client-rendered): uses `t('file.key')` → reads from `resources/js/i18n/{locale}.js`

**Rule:** When a feature adds new user-facing text that appears in Vue/Inertia components, you MUST update BOTH `lang/{locale}/*.php` AND `resources/js/i18n/{locale}.js` in the same commit. Missing the JS bundle causes raw keys to render on screen (e.g., `advertise.media_kit_download` instead of "Download Media Kit").

---

## Livewire 3 Patterns

### Blade Directive Gotchas

**NEVER use `@` directives in JS comments** — Blade parses `@push`, `@if`, etc. inside `//` and `/* */` comments as real directives. This causes nested push blocks and Livewire "Multiple root elements" 500 errors.

### Widget View Constraints

- **NO `<style>` blocks in widget blade views** — even inside `<x-filament-widgets::widget>`, `<style>` breaks widget rendering
- **NO HTML elements before `<x-filament-widgets::widget>`** — Livewire 3 lazy-loading uses first root HTML element as IntersectionObserver placeholder
- `@php` blocks are fine before the widget component — they're not HTML
- **Dynamic Tailwind classes don't compile** in widget views — use inline `style=""` attributes

### Reliable Livewire-to-JS Communication

```php
// PHP — dispatch event from afterStateUpdated or action
$this->dispatch('chart-data-updated');
```

```javascript
// JS — listen inside livewire:init (NOT at top level)
document.addEventListener('livewire:init', () => {
    Livewire.on('chart-data-updated', () => {
        setTimeout(() => {
            // Chart.js resize or other DOM work
            chart.resize();
        }, 100);
    });
});
```

**Do NOT use** `Livewire.hook('morph.updated')` with setTimeout — timers get cleared during Livewire's morph cycle.

### Chart.js Canvas After DOM Morph

Fresh canvas elements default to 300x150px. Call `setTimeout(() => chart.resize(), 50)` after `new Chart()` to force correct sizing.

---

## Inertia.js

### Head Component Limitations

Inertia's `<Head>` component does NOT support `<script>` tags — they render as empty nodes. For JSON-LD structured data, inject via a composable that uses direct DOM injection:

```javascript
// useJsonLd composable — injects <script type="application/ld+json">
import { onMounted, onUnmounted } from 'vue';

export function useJsonLd(data) {
    let scriptEl = null;
    onMounted(() => {
        scriptEl = document.createElement('script');
        scriptEl.type = 'application/ld+json';
        scriptEl.textContent = JSON.stringify(data);
        document.head.appendChild(scriptEl);
    });
    onUnmounted(() => scriptEl?.remove());
}
```

OG/Twitter meta tags work fine inside `<Head>`.

---

## Intervention Image v3

No `canvas()` method in v3. Use the new API:

```php
use Intervention\Image\Laravel\Facades\Image;

// Create blank canvas
$image = Image::create(width: 200, height: 200)->fill('#ffffff');

// Read and transform
$image = Image::read($path)
    ->scaleDown(width: 800)
    ->toWebp(quality: 80);

// Output
$binary = $image->toString();
$image->toJpeg()->save($outputPath);
```

---

## Migration Safety

- [ ] Check if the index/constraint already exists in earlier migrations before adding
- [ ] Run `migrate:fresh` locally to catch duplicate index errors before pushing to CI
- [ ] Name indexes explicitly to avoid conflicts with auto-generated names

---

## External API Integration

### Nova Poshta API

- API URL: `https://api.novaposhta.ua/v2.0/json/` (POST)
- `methodProperties` MUST be JSON object `{}`, NOT array `[]` — NP returns "Invalid method properties" warning
- PHP fix: `empty($properties) ? (object) [] : $properties` to ensure `json_encode` produces `{}`
- `getCities` endpoint rejects integer Page/Limit — must cast to `(string)`. Defensive: cast in `call()` method centrally
- Don't cache empty results — use `Cache::get()`/`Cache::put()` instead of `Cache::remember()`

---

## Testing Patterns (PHPUnit)

### Mocking Without Database

For unit tests that don't need DB:
- Use `forceFill()` + reflection to set `$changes` property on Eloquent models
- `get_class()` on Mockery mocks returns mock class name — use `instanceof` instead
- `addToAssertionCount(1)` to avoid "risky" warnings when relying on Mockery expectations
- Avoid `RefreshDatabase` trait for tests that don't require DB access
- **Always include `'id' => N` in forceFill()** for models with observer chains (e.g., embedding observers dispatch jobs requiring `int $contentId`)
- **Mockery mocks must track ALL method calls**: When a service adds a new method (e.g., `isAvailable()` guard), update ALL existing mocks — Mockery throws "no expectations were specified" otherwise
- **Setting::setValue() auto-clears cache**: `Setting::saved` hook calls `Cache::forget('settings')` — no need for explicit `Cache::forget('settings')` after

### Queue and Cache Faking

```php
// Queue testing
Queue::fake();
// ... trigger action ...
Queue::assertPushedOn('tracking', RecordAdImpressionJob::class);

// Cache testing
Cache::shouldReceive('has')->with($key)->andReturn(false);
Cache::shouldReceive('put')->with($key, true, Mockery::type(DateTimeInterface::class));
```

### External API Parameter Types

`Http::fake()` does NOT validate parameter types against the real API. Add explicit assertions in tests:

```php
Http::fake(['*' => Http::response(['success' => true])]);
// ... call API ...
Http::assertSent(function ($request) {
    $body = json_decode($request->body(), true);
    // External API may require string, not int
    $this->assertIsString($body['methodProperties']['Page']);
    return true;
});
```

---

## Blade Component View Overrides

### `anonymousComponentPath()` Does NOT Support Vendor Overrides (CRITICAL)

Laravel's `resources/views/vendor/{package}/` override mechanism only works with packages that use `loadViewsFrom()`. Packages that register anonymous components via `$blade->anonymousComponentPath()` (e.g., Laravel Pulse) **bypass vendor overrides entirely**. The published file in `resources/views/vendor/` is silently ignored.

**How to identify**: Check the package's service provider for `anonymousComponentPath()` vs `loadViewsFrom()`.

**Workarounds when vendor overrides don't work:**
1. **Same-origin iframe embedding**: Load the package page in an iframe, manipulate the iframe's DOM via `contentDocument` from the parent page
2. **Middleware**: Add middleware to the package's routes that injects/modifies response HTML
3. **CSS injection**: Inject `<style>` elements into the iframe's `<head>` via JS to hide/restyle elements

```javascript
// Same-origin iframe DOM manipulation pattern
var doc = iframe.contentDocument;
if (!doc.getElementById('custom-style')) {
    var style = doc.createElement('style');
    style.id = 'custom-style';
    style.textContent = 'header .logo { display: none !important; }';
    doc.head.appendChild(style);
}
```

---

## Anti-Patterns to Avoid

1. **DB::table() with translatable models**: Bypasses Spatie accessors — use Eloquent
2. **Independent dispatch() for dependent jobs**: Use Bus::chain() when jobs must run sequentially
3. **Tailwind classes in Filament ViewField partials**: Filament CSS overrides them — use inline styles
4. **@push in JS comments**: Blade parses them as real directives — causes Livewire 500 errors
5. **Livewire.hook('morph.updated') with setTimeout**: Timers get cleared during morph — use Livewire.on()
6. **Missing ->placeholder('0') on numeric TextColumns**: Zero renders as blank
7. **Hardcoded strings instead of model constants**: Typo-prone and inconsistent
8. **Cache::remember() with empty API results**: Caches empty result permanently — use get/put with check
9. **`<style>` blocks in widget blade views**: Breaks Livewire 3 lazy-loading
10. **Vendor view overrides for anonymousComponentPath() packages**: Silently ignored — use iframe DOM manipulation or middleware instead
11. **Source-scanning tests with literal string values**: When implementation uses constants (`Advertisement::POSITION_PAGE_HERO`), check the constant name, not the literal value (`'page_hero'`)
12. **Not updating tests after refactoring**: When renaming methods, extracting composables, or moving classes — update ALL tests in the same commit
13. **`json_encode()` for Spatie translatable fields**: Produces a string, causing double-encoding — always use plain PHP arrays
14. **Column migrations without test audit**: When dropping/renaming columns (e.g., `is_active` → `status` enum), grep ALL test files for the old column — factory calls and assertions will break globally, not just in sprint-related tests
