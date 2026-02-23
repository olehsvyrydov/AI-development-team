---
description: Orchestrate design-to-implementation workflow for a sprint or feature. Coordinates /ui (Aura) and /fe (Finn).
---

# Design Sprint Workflow

This command orchestrates the complete design-to-implementation workflow.

## Workflow Overview

```
+------------------+     +------------------+     +-------------------+
|  1. Discovery    |---->|  2. Design Spec  |---->| 3. Implementation |
|    (/ui)         |     |    (/ui)         |     |    (/fe)          |
+------------------+     +------------------+     +-------------------+
         |                      |                        |
         v                      v                        v
   Questions to            Save spec to            Read spec from
   clarify scope           ui-design/              ui-design/
```

## Usage

```
/design-sprint {feature-name}
/design-sprint sprint-5 user-profile
```

## Steps to Execute

### Step 1: Discovery Phase (/ui)

First, invoke the UI Designer to understand requirements:

```
/ui Design the {feature-name} feature.
Start with discovery questions before creating any designs.
```

Wait for /ui to:
- Ask discovery questions
- Get user answers
- Create design blueprint

### Step 2: Design Specification (/ui)

After discovery, /ui will create the design spec:

```
Save the design specification to:
docs/ui-design/{sprint}/{feature-name}.md

Use the DESIGN_SPEC_TEMPLATE.md format.
Include:
- Visual design (colors, typography, spacing)
- Component structure
- Responsive breakpoints
- Accessibility requirements
- Ready-to-implement React/Tailwind code
```

### Step 3: Implementation (/fe)

Once design is saved, invoke frontend developer:

```
/fe Implement the {feature-name} feature.
Check the design spec at docs/ui-design/{sprint}/{feature-name}.md
```

/fe will:
1. Auto-read the design spec
2. Implement exactly as designed
3. Write tests
4. Verify visually

### Step 4: Verification

After implementation:
- /ui verifies implementation against design spec (design QA)
- Run accessibility checks
- Execute visual regression tests
- /rev reviews code quality

## Example Flow

```
User: /design-sprint sprint-6 job-search-filters

1. Claude invokes /ui for discovery
2. /ui asks: "What filter types? Date range? Location radius?"
3. User provides answers
4. /ui creates design spec -> saves to docs/ui-design/sprint-6/job-search-filters.md
5. Claude invokes /fe
6. /fe reads spec, implements feature
7. Tests written and passing
8. /ui verifies implementation
```
