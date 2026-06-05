# Design — Templates (user flow · design spec · discovery)

## User Flow: [Feature Name]

### Entry Points
- Direct URL
- Navigation menu
- Search results
- Email link

### Happy Path
1. User lands on → [Page A]
2. User clicks → [Action]
3. System shows → [Page B]
4. User completes → [Form]
5. System confirms → [Success State]

### Error Paths
- Invalid input → Inline validation
- Server error → Error page with retry
- Timeout → Loading state → Retry prompt

### Edge Cases
- Empty state (no data)
- Loading state (skeleton)
- Partial data (progressive)
- Offline state (cached/retry)


## Overview
{Brief description of what was designed and why}

## Design Decisions
| Decision | Rationale |
|----------|-----------|
| Color palette | {why these colors} |
| Layout approach | {why this layout} |
| Animation choices | {why these motions} |

## Component Specifications

### {Component Name}
- **Variants**: Default, Hover, Active, Focus, Disabled, Error
- **Responsive**: Desktop → Tablet → Mobile behavior
- **Accessibility**: ARIA attributes, keyboard interaction
- **Animation**: Entry, interaction, exit motions

## Color Palette
| Token | Value | Usage |
|-------|-------|-------|
| --color-primary | oklch(...) | CTA, links |
| --color-surface | oklch(...) | Backgrounds |

## Typography
| Element | Font | Size | Weight | Line Height |
|---------|------|------|--------|-------------|
| H1 | Display | 3xl | Bold | 1.2 |
| Body | Body | base | Regular | 1.5 |

## Responsive Behavior
| Breakpoint | Layout Changes |
|-----------|----------------|
| Mobile (< 640px) | Single column, stacked |
| Tablet (768px) | Two column |
| Desktop (1024px+) | Full layout |

## States
- [ ] Default
- [ ] Loading (skeleton)
- [ ] Empty
- [ ] Error
- [ ] Success

## Accessibility Notes
- Focus order: {description}
- Screen reader: {announcements}
- Keyboard: {interactions}
- Reduced motion: {alternatives}

## Templates

### Discovery Questions Template

```markdown
## Discovery Phase - [Project Name]

I've analyzed your request. Before I initialize the design modules,
I require clarity on these points:

### 1. Brand & Style Balance
How do you define the "Firm Style"?
- Traditional Corporate (serifs, dark navies, rigid grids)
- Modern Tech-Corporate (sans-serif, vibrant accents, soft shadows)
- Experimental Risk Level (1-10)?

### 2. Hero UI Elements
Which elements need the "Wow" factor?
- [ ] Interactive data visualization
- [ ] Creative hero section
- [ ] Unique navigation
- [ ] Complex form/wizard
- [ ] Dashboard widgets
- [ ] Other: ___

### 3. Page Architecture
Beyond the main page, which are mandatory?
- [ ] User onboarding flow
- [ ] Settings/Profile
- [ ] Transaction/History
- [ ] Detail modals
- [ ] Forms with validation

### 4. Mobile Strategy
- Responsive Web (optimized for mobile browsers)
- Native App Concept (platform-specific patterns)
- Both with shared design language

### 5. Interaction Depth
- Subtle: Smooth fades, hover states
- Moderate: Micro-interactions, transitions
- High-Energy: Magnetic buttons, parallax, morphing layouts

### 6. Visual Identity
- Existing Brand Book (provide HEX/fonts)
- New identity synthesis based on industry/niche

### 7. Accessibility
- WCAG 2.2 AA (standard)
- WCAG 2.2 AAA (strict)
- Specific needs: screen reader, motor, cognitive

### 8. Dark Mode
- Required from launch
- Future consideration
- Not needed

### 9. Anti-Patterns
What design trends should I strictly avoid?
```

### TailwindCSS v4 Design Tokens Template

```css
/* design-tokens.css — TailwindCSS v4 */
@import "tailwindcss";

@theme {
  /* === Colors (OKLCH) === */
  --color-primary-50:  oklch(0.97 0.02 VAR_HUE);
  --color-primary-100: oklch(0.93 0.04 VAR_HUE);
  --color-primary-200: oklch(0.87 0.08 VAR_HUE);
  --color-primary-300: oklch(0.78 0.12 VAR_HUE);
  --color-primary-400: oklch(0.68 0.16 VAR_HUE);
  --color-primary-500: oklch(0.58 0.20 VAR_HUE);
  --color-primary-600: oklch(0.48 0.18 VAR_HUE);
  --color-primary-700: oklch(0.38 0.15 VAR_HUE);
  --color-primary-800: oklch(0.28 0.12 VAR_HUE);
  --color-primary-900: oklch(0.18 0.08 VAR_HUE);

  /* Semantic */
  --color-surface: var(--color-primary-50);
  --color-on-surface: var(--color-primary-900);
  --color-accent: var(--color-primary-500);
  --color-muted: oklch(0.55 0.00 0);
  --color-success: oklch(0.60 0.16 145);
  --color-warning: oklch(0.75 0.16 85);
  --color-error: oklch(0.55 0.22 25);
  --color-info: oklch(0.60 0.16 250);

  /* === Typography === */
  --font-display: 'Cal Sans', 'Inter', system-ui, sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* === Spacing (4px base) === */
  --spacing-0: 0;
  --spacing-1: 0.25rem;
  --spacing-2: 0.5rem;
  --spacing-3: 0.75rem;
  --spacing-4: 1rem;
  --spacing-5: 1.25rem;
  --spacing-6: 1.5rem;
  --spacing-8: 2rem;
  --spacing-10: 2.5rem;
  --spacing-12: 3rem;
  --spacing-16: 4rem;
  --spacing-20: 5rem;
  --spacing-24: 6rem;

  /* === Border Radius === */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-2xl: 1.5rem;
  --radius-full: 9999px;

  /* === Shadows === */
  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px oklch(0 0 0 / 0.07), 0 2px 4px oklch(0 0 0 / 0.06);
  --shadow-lg: 0 10px 15px oklch(0 0 0 / 0.1), 0 4px 6px oklch(0 0 0 / 0.05);
  --shadow-xl: 0 20px 25px oklch(0 0 0 / 0.1), 0 8px 10px oklch(0 0 0 / 0.04);

  /* === Animation === */
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 400ms;
}
```

### React Component Template (Hero Section)

```tsx
'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface HeroSectionProps {
  title: string;
  subtitle: string;
  ctaText: string;
  onCtaClick: () => void;
  className?: string;
}

export function HeroSection({
  title,
  subtitle,
  ctaText,
  onCtaClick,
  className,
}: HeroSectionProps) {
  return (
    <section
      className={cn(
        'relative min-h-screen flex items-center justify-center',
        'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
        'overflow-hidden',
        className
      )}
    >
      {/* Glassmorphic background elements */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <motion.div
          className="absolute top-1/4 -left-20 w-96 h-96 rounded-full bg-blue-500/20 blur-3xl"
          animate={{ x: [0, 50, 0], y: [0, 30, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute bottom-1/4 -right-20 w-96 h-96 rounded-full bg-purple-500/20 blur-3xl"
          animate={{ x: [0, -50, 0], y: [0, -30, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
        <motion.h1
          className="text-5xl md:text-7xl font-bold text-white mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          {title}
        </motion.h1>

        <motion.p
          className="text-xl md:text-2xl text-slate-300 mb-10 max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          {subtitle}
        </motion.p>

        <motion.button
          onClick={onCtaClick}
          className={cn(
            'px-8 py-4 rounded-full text-lg font-semibold',
            'bg-gradient-to-r from-blue-500 to-purple-600',
            'text-white shadow-lg shadow-blue-500/25',
            'hover:shadow-xl hover:shadow-blue-500/40',
            'transition-all duration-300',
            'focus-visible:outline-2 focus-visible:outline-offset-2',
            'focus-visible:outline-blue-500'
          )}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.98 }}
        >
          {ctaText}
        </motion.button>
      </div>
    </section>
  );
}
```

