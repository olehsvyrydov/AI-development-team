# Design Foundations (color · typography · Tailwind v4 · modern CSS · a11y · motion · design systems · responsive)

## Core Expertise

### 1. Color Theory & Modern Color Science

#### OKLCH Color Spaces (Perceptually Uniform)
OKLCH is the modern standard for perceptually uniform color palettes — colors at the same lightness value actually LOOK equally bright, unlike HSL/RGB.

```css
/* OKLCH: oklch(lightness chroma hue) */
/* Lightness: 0-1, Chroma: 0-0.4, Hue: 0-360 */

/* Generate a harmonious palette with uniform perceived brightness */
:root {
  --primary-50:  oklch(0.97 0.02 250);
  --primary-100: oklch(0.93 0.04 250);
  --primary-200: oklch(0.87 0.08 250);
  --primary-300: oklch(0.78 0.12 250);
  --primary-400: oklch(0.68 0.16 250);
  --primary-500: oklch(0.58 0.20 250);  /* Base */
  --primary-600: oklch(0.48 0.18 250);
  --primary-700: oklch(0.38 0.15 250);
  --primary-800: oklch(0.28 0.12 250);
  --primary-900: oklch(0.18 0.08 250);
}
```

**Why OKLCH over HSL:**
| Feature | HSL | OKLCH |
|---------|-----|-------|
| Perceptual uniformity | No (blue looks darker than yellow at same L) | Yes |
| Gamut mapping | sRGB only | P3, Rec2020 support |
| Palette generation | Manual adjustment needed | Consistent by formula |
| Browser support | Universal | 96%+ (2025) |
| TailwindCSS v4 | Not default | Native support |

#### Contrast-Safe Palette Design
```
WCAG 2.2 Contrast Requirements:
- Normal text (< 24px): 4.5:1 minimum
- Large text (≥ 24px or ≥ 18.67px bold): 3:1 minimum
- UI components & graphical objects: 3:1 minimum
- Focus indicators: 3:1 against adjacent colors

APCA (Advanced Perceptual Contrast Algorithm) — future standard:
- Body text: Lc 75+ (preferred Lc 90)
- Large text: Lc 60+
- Non-text UI: Lc 45+
```

#### Color Palette Strategies
| Strategy | Hue Range | Use Case |
|----------|-----------|----------|
| Monochromatic | Single hue, vary L/C | Elegant, minimal |
| Analogous | Adjacent hues (30°) | Harmonious, warm/cool |
| Complementary | Opposite hues (180°) | High contrast, CTA |
| Split-complementary | 150° + 210° from base | Balanced contrast |
| Triadic | 120° apart | Vibrant, playful |

#### Dark Mode Color Design
```css
/* Dark mode is NOT just inverting colors */
/* Rules for dark mode: */
/* 1. Reduce contrast (use 87% white, not 100%) */
/* 2. Desaturate colors (lower chroma in OKLCH) */
/* 3. Avoid pure black backgrounds (use 8-12% lightness) */
/* 4. Elevate with brightness, not shadows */

.dark {
  --surface-0: oklch(0.13 0.01 250);    /* Base background */
  --surface-1: oklch(0.17 0.01 250);    /* Cards */
  --surface-2: oklch(0.21 0.01 250);    /* Elevated */
  --surface-3: oklch(0.25 0.01 250);    /* Dialogs */
  --text-primary: oklch(0.93 0.00 0);   /* 87% white, not 100% */
  --text-secondary: oklch(0.73 0.00 0); /* 60% white */
  --text-disabled: oklch(0.53 0.00 0);  /* 38% white */
}
```

### 2. Typography System Design

#### Type Scale (Mathematical Ratios)
| Ratio | Name | Factor | Best For |
|-------|------|--------|----------|
| 1.067 | Minor Second | Small steps | Dense UI, dashboards |
| 1.125 | Major Second | Moderate | Body-heavy content |
| 1.200 | Minor Third | Balanced | General purpose |
| 1.250 | Major Third | Distinct | Marketing, editorial |
| 1.333 | Perfect Fourth | Bold | Headlines, impact |
| 1.414 | Augmented Fourth | Dramatic | Hero sections |
| 1.618 | Golden Ratio | Maximum | Display typography |

#### Fluid Typography with CSS clamp()
```css
/* Fluid type scale: min at 320px, max at 1280px */
:root {
  --text-xs:   clamp(0.6944rem, 0.6504rem + 0.2198vw, 0.8333rem);
  --text-sm:   clamp(0.8333rem, 0.7667rem + 0.3333vw, 1rem);
  --text-base: clamp(1rem, 0.9rem + 0.5vw, 1.25rem);
  --text-lg:   clamp(1.2rem, 1.0533rem + 0.7333vw, 1.5625rem);
  --text-xl:   clamp(1.44rem, 1.2267rem + 1.0667vw, 1.9531rem);
  --text-2xl:  clamp(1.728rem, 1.4213rem + 1.5347vw, 2.4414rem);
  --text-3xl:  clamp(2.0736rem, 1.6387rem + 2.1747vw, 3.0518rem);
}
```

#### Typography Best Practices
- **Line length**: 45-75 characters (ideal: 66) — use `max-width: 65ch`
- **Line height**: 1.5 for body, 1.2 for headings, 1.1 for display
- **Paragraph spacing**: Use margin-bottom equal to line-height
- **Font pairing**: Maximum 2 families (1 display + 1 body)
- **Variable fonts**: Use `font-variation-settings` for performance (1 file vs 6+)
- **Font loading**: `font-display: swap` for FOUT prevention

### 3. TailwindCSS v4 Design Tokens (CSS-First)

TailwindCSS v4 uses **CSS-first configuration** — design tokens are defined in CSS, not `tailwind.config.js`.

#### @theme Directive (Replaces Config)
```css
/* app.css — TailwindCSS v4 design tokens */
@import "tailwindcss";

@theme {
  /* Colors — use OKLCH for perceptual uniformity */
  --color-brand-50:  oklch(0.97 0.02 250);
  --color-brand-100: oklch(0.93 0.04 250);
  --color-brand-500: oklch(0.58 0.20 250);
  --color-brand-900: oklch(0.18 0.08 250);

  /* Semantic colors */
  --color-surface: var(--color-brand-50);
  --color-on-surface: var(--color-brand-900);
  --color-accent: var(--color-brand-500);

  /* Typography scale */
  --font-display: 'Cal Sans', 'Inter', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Spacing rhythm */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;
  --spacing-2xl: 3rem;
  --spacing-3xl: 4rem;

  /* Border radius tokens */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-2xl: 1.5rem;
  --radius-full: 9999px;

  /* Shadow tokens */
  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px oklch(0 0 0 / 0.07), 0 2px 4px oklch(0 0 0 / 0.06);
  --shadow-lg: 0 10px 15px oklch(0 0 0 / 0.1), 0 4px 6px oklch(0 0 0 / 0.05);
  --shadow-glow: 0 0 40px oklch(0.58 0.20 250 / 0.3);

  /* Animation tokens */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 400ms;

  /* Breakpoints */
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
  --breakpoint-2xl: 1536px;
}

/* Dark mode tokens (automatic with .dark class) */
.dark {
  --color-surface: oklch(0.13 0.01 250);
  --color-on-surface: oklch(0.93 0.00 0);
  --color-accent: oklch(0.68 0.16 250);
}
```

#### TailwindCSS v4 Key Changes
| Feature | v3 | v4 |
|---------|----|----|
| Config | `tailwind.config.js` | `@theme` in CSS |
| Engine | JavaScript | **Oxide** (Rust, 5x full/100x incremental faster) |
| Colors | HEX/RGB | **OKLCH native** |
| Container queries | Plugin needed | `@container` built-in |
| `@starting-style` | Not supported | Native support |
| CSS cascade layers | Manual | Automatic (`@layer`) |
| `color-mix()` | Not supported | Native |
| Custom variants | Plugin API | `@custom-variant` directive |

### 4. Modern CSS Capabilities (2025)

#### Container Queries
```css
/* Size container queries — components adapt to parent, not viewport */
.card-container {
  container-type: inline-size;
  container-name: card;
}

@container card (min-width: 400px) {
  .card { flex-direction: row; }
  .card-image { width: 40%; }
}

@container card (max-width: 399px) {
  .card { flex-direction: column; }
  .card-image { width: 100%; }
}

/* Style container queries — respond to computed styles */
@container style(--theme: dark) {
  .card { background: oklch(0.17 0.01 250); }
}
```

#### :has() Selector (Parent Selector)
```css
/* Style parent based on child state */
.form-group:has(:invalid) { border-color: oklch(0.55 0.22 25); }
.form-group:has(:focus-visible) { outline: 2px solid var(--color-accent); }

/* Card with image vs without */
.card:has(img) { grid-template-rows: 200px 1fr; }
.card:not(:has(img)) { grid-template-rows: 1fr; }

/* Navigation with active link */
nav:has(.active) .nav-link:not(.active) { opacity: 0.7; }
```

#### View Transitions API
```css
/* Cross-document page transitions */
@view-transition {
  navigation: auto;
}

::view-transition-old(root) {
  animation: slide-out 300ms var(--ease-smooth);
}

::view-transition-new(root) {
  animation: slide-in 300ms var(--ease-smooth);
}

/* Named transitions for specific elements */
.product-image { view-transition-name: product-hero; }
.product-title { view-transition-name: product-title; }
```

#### Scroll-Driven Animations
```css
/* Progress bar tied to scroll position */
.progress-bar {
  animation: grow-width linear;
  animation-timeline: scroll(root);
}

@keyframes grow-width {
  from { width: 0%; }
  to { width: 100%; }
}

/* Element reveal on scroll-into-view */
.reveal-on-scroll {
  animation: fade-in linear;
  animation-timeline: view();
  animation-range: entry 0% entry 100%;
}
```

#### Anchor Positioning
```css
/* Tooltip positioned relative to anchor element */
.trigger { anchor-name: --my-trigger; }

.tooltip {
  position: fixed;
  position-anchor: --my-trigger;
  top: anchor(bottom);
  left: anchor(center);
  translate: -50% 8px;
}
```

#### Popover API
```html
<!-- Native popover — no JavaScript needed -->
<button popovertarget="menu">Open Menu</button>
<div id="menu" popover>
  <!-- Popover content — auto-dismissed on outside click -->
  <!-- Renders in top-layer, no z-index battles -->
</div>
```

#### @starting-style (Entry Animations)
```css
/* Animate elements when they first appear in DOM */
.dialog[open] {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 300ms, transform 300ms;

  @starting-style {
    opacity: 0;
    transform: translateY(-20px);
  }
}
```

### 5. Accessibility (WCAG 2.2 AA)

#### What Changed from WCAG 2.1 to 2.2
| New Criterion | Level | Requirement |
|--------------|-------|-------------|
| 2.4.11 Focus Appearance | AA | Focus indicator: ≥2px outline, 3:1 contrast against adjacent |
| 2.4.13 Focus Not Obscured | AA | Focused element not fully hidden by sticky headers/overlays |
| 2.5.7 Dragging Movements | AA | Drag operations must have single-pointer alternative |
| 2.5.8 Target Size | AA | Interactive targets ≥ 24x24px (up from advisory) |
| 3.3.7 Redundant Entry | A | Don't ask for same info twice in same process |
| 3.3.8 Accessible Authentication | AA | No cognitive function tests for login (allow paste, password managers) |

#### Focus Management Rules
```css
/* WCAG 2.2 compliant focus indicators */
:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  /* Ensure 3:1 contrast against ALL adjacent colors */
}

/* Don't remove focus on mouse click — just style differently */
:focus:not(:focus-visible) {
  outline: none;
}

/* Focus Not Obscured — ensure sticky elements don't cover focused items */
[tabindex]:focus-visible {
  scroll-margin-top: 80px; /* Account for sticky header height */
  scroll-margin-bottom: 60px;
}
```

#### Target Size (24x24px Minimum)
```css
/* Ensure minimum target size */
button, a, [role="button"], input[type="checkbox"], input[type="radio"] {
  min-width: 24px;
  min-height: 24px;
}

/* Better: use 44px for touch targets */
@media (pointer: coarse) {
  button, a, [role="button"] {
    min-width: 44px;
    min-height: 44px;
  }
}
```

#### ARIA Patterns Reference
| Pattern | Use Case | Key Attributes |
|---------|----------|----------------|
| Dialog (Modal) | Confirmation, forms | `role="dialog"`, `aria-modal`, focus trap |
| Tabs | Content switching | `role="tablist/tab/tabpanel"`, `aria-selected` |
| Accordion | Expandable sections | `aria-expanded`, `aria-controls` |
| Combobox | Searchable select | `role="combobox"`, `aria-expanded`, `aria-activedescendant` |
| Menu | Action menus | `role="menu/menuitem"`, `aria-haspopup` |
| Listbox | Selection list | `role="listbox/option"`, `aria-selected` |
| Tooltip | Supplementary info | `role="tooltip"`, `aria-describedby` |
| Alert | Status messages | `role="alert"`, `aria-live="assertive"` |
| Toast | Notifications | `role="status"`, `aria-live="polite"` |
| Breadcrumb | Navigation path | `nav[aria-label="Breadcrumb"]`, `aria-current="page"` |

#### Accessibility Testing Tools
| Tool | Type | Checks |
|------|------|--------|
| axe-core | Automated | WCAG violations, ARIA correctness |
| Lighthouse | Automated | Accessibility score, best practices |
| NVDA/JAWS | Screen reader | Manual reading order, announcements |
| VoiceOver | Screen reader | macOS/iOS testing |
| Colour Contrast Analyser | Manual | WCAG contrast ratios |
| WAVE | Browser extension | Visual overlay of issues |

### 6. Motion Design Principles

#### Purpose-Driven Animation
Every animation must serve one of these purposes:
1. **Orientation**: Where am I? (page transitions, breadcrumbs)
2. **Feedback**: Did it work? (button press, form submit, error shake)
3. **Relationship**: How are things connected? (expand/collapse, parent-child)
4. **Attention**: What matters now? (notification, error highlight)
5. **Delight**: Surprise and reward (success celebration, loading fun)

#### Timing Guidelines
| Duration | Use Case | Example |
|----------|----------|---------|
| 100ms | Instant feedback | Button hover, toggle |
| 150-200ms | Quick transitions | Dropdown open, tab switch |
| 250-300ms | Standard transitions | Modal open, slide panel |
| 300-400ms | Emphatic transitions | Page transition, hero reveal |
| 500ms+ | Storytelling only | Onboarding, data loading illustration |

**Sweet spot**: 150-400ms for most UI animations. Under 100ms feels instant (no animation needed). Over 500ms feels slow.

#### Easing Functions
| Easing | CSS | When |
|--------|-----|------|
| ease-out | `cubic-bezier(0, 0, 0.2, 1)` | Elements entering (modal open) |
| ease-in | `cubic-bezier(0.4, 0, 1, 1)` | Elements exiting (modal close) |
| ease-in-out | `cubic-bezier(0.4, 0, 0.2, 1)` | Elements moving (reorder) |
| spring | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful interactions (bounce) |
| linear | `linear` | Progress indicators, scroll-driven |

#### Reduced Motion Accessibility
```css
/* CRITICAL: Respect prefers-reduced-motion */
/* Reduced motion ≠ NO motion — use subtle alternatives */

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Better: provide reduced alternatives, not removal */
@media (prefers-reduced-motion: reduce) {
  .hero-animation {
    /* Replace slide animation with simple fade */
    animation: fade-in 200ms ease-out;
  }
  .parallax-section {
    /* Remove parallax but keep content visible */
    transform: none !important;
  }
}
```

**Stats**: ~35% of adults over 40 report motion sensitivity. Always provide alternatives.

#### Framer Motion Patterns
```tsx
// Shared layout animations
<AnimatePresence mode="wait">
  <motion.div
    key={activeTab}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.2 }}
  />
</AnimatePresence>

// Spring animation for natural feel
<motion.button
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
  transition={{ type: "spring", stiffness: 400, damping: 25 }}
/>

// Stagger children for list reveals
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } }
};
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 }
};
```

### 7. Design System Architecture

#### Atomic Design Methodology
```
Atoms → Molecules → Organisms → Templates → Pages

Atoms:      Button, Input, Label, Icon, Badge
Molecules:  SearchField (Input + Button), FormField (Label + Input + Error)
Organisms:  Header (Logo + Nav + SearchField + Avatar), ProductCard (Image + Title + Price + CTA)
Templates:  ProductListPage (Header + Filters + Grid + Pagination)
Pages:      /products (Template + real data + state)
```

#### Component Design Patterns

**Compound Components** (headless, composable):
```tsx
<Select>
  <Select.Trigger>Choose option</Select.Trigger>
  <Select.Content>
    <Select.Item value="a">Option A</Select.Item>
    <Select.Item value="b">Option B</Select.Item>
  </Select.Content>
</Select>
```

**Polymorphic Components** (render-as pattern):
```tsx
<Button as="a" href="/about">Link that looks like button</Button>
<Text as="h1" size="3xl">Heading</Text>
```

**Slot Pattern** (flexible composition):
```tsx
<Card>
  <Card.Header>
    <Card.Title>Title</Card.Title>
    <Card.Action><IconButton icon="more" /></Card.Action>
  </Card.Header>
  <Card.Body>{children}</Card.Body>
  <Card.Footer>{actions}</Card.Footer>
</Card>
```

#### Design Token Architecture
```
Tier 1: Global Tokens (primitive values)
  --color-blue-500: oklch(0.58 0.20 250);
  --spacing-4: 1rem;
  --radius-md: 0.5rem;

Tier 2: Semantic Tokens (purpose-mapped)
  --color-accent: var(--color-blue-500);
  --spacing-component-gap: var(--spacing-4);
  --radius-interactive: var(--radius-md);

Tier 3: Component Tokens (scoped)
  --button-bg: var(--color-accent);
  --button-padding: var(--spacing-component-gap);
  --button-radius: var(--radius-interactive);
```

### 8. Responsive Design Strategy

#### Breakpoint System
| Breakpoint | Width | Target |
|-----------|-------|--------|
| xs | < 640px | Small phones |
| sm | ≥ 640px | Large phones |
| md | ≥ 768px | Tablets |
| lg | ≥ 1024px | Laptops |
| xl | ≥ 1280px | Desktops |
| 2xl | ≥ 1536px | Large desktops |

#### Mobile-First Principles
1. **Content-first**: Design for smallest screen, add complexity upward
2. **Touch-first**: 44px minimum touch targets, thumb-zone optimization
3. **Performance-first**: Critical CSS inline, defer non-essential
4. **Progressive enhancement**: Core functionality works without JS/CSS

#### Thumb-Zone Optimization
```
┌─────────────────────┐
│  Hard to reach      │ ← Navigation, non-critical
│                     │
│  OK to reach        │ ← Secondary actions
│                     │
│  Easy to reach      │ ← Primary actions, FAB
│  ┌───────────────┐  │
│  │   Natural      │  │ ← Bottom navigation
│  │   thumb area   │  │
│  └───────────────┘  │
└─────────────────────┘
```

#### Safe Area Handling
```css
/* iOS notch, Dynamic Island, home indicator */
.app-shell {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

/* Bottom navigation with safe area */
.bottom-nav {
  padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
}
```

### 9. UX Research & User Flow Design

#### Discovery Methods
| Method | When | Output |
|--------|------|--------|
| Stakeholder interviews | Project kickoff | Goals, constraints, success metrics |
| Competitive analysis | Before design | Feature matrix, differentiation |
| User personas | Before wireframes | Archetype descriptions |
| User journey mapping | Before wireframes | End-to-end flow diagram |
| Card sorting | IA decisions | Information hierarchy |
| Heuristic evaluation | Redesign projects | Usability issues list |

#### User Flow Documentation

See **`references/templates.md`** for the User Flow template.
