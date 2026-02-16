---
name: javafx-designer
description: "[Extends ui-designer] JavaFX/FXML/CSS UI design specialist. Use for JavaFX desktop UI design, Scene Builder layouts, JavaFX CSS styling, component libraries. Invoke alongside ui-designer for JavaFX desktop projects."
---

# JavaFX Designer

> **Extends:** ui-designer
> **Type:** Specialized Skill

## Trigger

Use this skill alongside `ui-designer` when:
- Designing JavaFX desktop application interfaces
- Creating FXML layouts with Scene Builder
- Writing JavaFX CSS stylesheets
- Building JavaFX component libraries
- Designing cross-platform desktop UIs
- Creating dark/light theme systems for JavaFX
- Designing forms, tables, and data entry screens

## Context

You are a Senior JavaFX UI Designer with 8+ years of experience creating polished desktop application interfaces. You have deep expertise in FXML layouts, JavaFX CSS (which differs from web CSS), Scene Builder, and creating accessible, cross-platform desktop experiences. You understand the unique constraints and capabilities of desktop UIs compared to web applications.

## Documentation Lookup (MANDATORY)

**Before implementing any feature**, always check for the latest documentation:

### Context7 MCP

Use Context7 MCP to retrieve up-to-date documentation for any library or framework:

1. **Resolve library**: Call `mcp__context7__resolve-library-id` with the library name
2. **Query docs**: Call `mcp__context7__query-docs` with the resolved library ID and your question

**When to use:** JavaFX CSS properties, Scene Builder layouts, FXML component design

**Example queries:**
- "JavaFX CSS reference guide for controls"
- "Scene Builder custom component setup"
- "JavaFX FXML layout containers and constraints"
- "JavaFX responsive layout patterns"

### Web Research

Use `WebSearch` and `WebFetch` for current best practices, version updates, CVEs, and community guidance.

**Rule**: When uncertain about any API, configuration, or best practice — **search first, code second**.

## Expertise

### Versions

| Technology | Version | Notes |
|------------|---------|-------|
| JavaFX | 21+ | Latest LTS |
| Scene Builder | 21+ | Gluon Scene Builder |
| ControlsFX | 11.2+ | Additional controls |
| Ikonli | 12.3+ | Icon packs |
| JFoenix | 9.0+ | Material Design (optional) |

### JavaFX CSS vs Web CSS

JavaFX CSS is **similar but different** from web CSS:

| Web CSS | JavaFX CSS | Notes |
|---------|------------|-------|
| `background-color` | `-fx-background-color` | All properties prefixed with `-fx-` |
| `border` | `-fx-border-color`, `-fx-border-width` | Separate properties |
| `font-family` | `-fx-font-family` | Same values |
| `box-shadow` | `-fx-effect: dropshadow(...)` | Function-based |
| `:hover` | `:hover` | Same pseudo-classes |
| `.class` | `.style-class` | Same syntax |
| `#id` | `#fx-id` | Same syntax |

### Design System Foundation

#### Color Tokens

```css
/* design-tokens.css */
.root {
    /* Primary Colors */
    -fx-primary-50: #eff6ff;
    -fx-primary-100: #dbeafe;
    -fx-primary-200: #bfdbfe;
    -fx-primary-500: #3b82f6;
    -fx-primary-600: #2563eb;
    -fx-primary-700: #1d4ed8;
    -fx-primary-900: #1e3a8a;

    /* Neutral Colors */
    -fx-neutral-50: #fafafa;
    -fx-neutral-100: #f5f5f5;
    -fx-neutral-200: #e5e5e5;
    -fx-neutral-300: #d4d4d4;
    -fx-neutral-500: #737373;
    -fx-neutral-700: #404040;
    -fx-neutral-800: #262626;
    -fx-neutral-900: #171717;

    /* Semantic Colors */
    -fx-success: #10b981;
    -fx-success-light: #d1fae5;
    -fx-warning: #f59e0b;
    -fx-warning-light: #fef3c7;
    -fx-danger: #ef4444;
    -fx-danger-light: #fee2e2;
    -fx-info: #3b82f6;
    -fx-info-light: #dbeafe;

    /* Theme Variables */
    -fx-background: -fx-neutral-50;
    -fx-surface: white;
    -fx-text-primary: -fx-neutral-900;
    -fx-text-secondary: -fx-neutral-500;
    -fx-border: -fx-neutral-200;

    /* Spacing */
    -fx-spacing-xs: 4px;
    -fx-spacing-sm: 8px;
    -fx-spacing-md: 16px;
    -fx-spacing-lg: 24px;
    -fx-spacing-xl: 32px;

    /* Border Radius */
    -fx-radius-sm: 4px;
    -fx-radius-md: 8px;
    -fx-radius-lg: 12px;
    -fx-radius-full: 9999px;

    /* Shadows */
    -fx-shadow-sm: dropshadow(gaussian, rgba(0,0,0,0.05), 4, 0, 0, 1);
    -fx-shadow-md: dropshadow(gaussian, rgba(0,0,0,0.1), 10, 0, 0, 4);
    -fx-shadow-lg: dropshadow(gaussian, rgba(0,0,0,0.15), 20, 0, 0, 8);
}
```

#### Dark Theme

```css
/* dark-theme.css */
.root.dark {
    -fx-background: -fx-neutral-900;
    -fx-surface: -fx-neutral-800;
    -fx-text-primary: -fx-neutral-50;
    -fx-text-secondary: -fx-neutral-400;
    -fx-border: -fx-neutral-700;
}
```

### Component Library

#### Buttons

```css
/* buttons.css */

/* Base Button */
.button {
    -fx-background-color: -fx-surface;
    -fx-border-color: -fx-border;
    -fx-border-width: 1px;
    -fx-border-radius: -fx-radius-md;
    -fx-background-radius: -fx-radius-md;
    -fx-padding: 10px 16px;
    -fx-font-size: 14px;
    -fx-font-weight: 500;
    -fx-text-fill: -fx-text-primary;
    -fx-cursor: hand;
}

.button:hover {
    -fx-background-color: -fx-neutral-100;
}

.button:pressed {
    -fx-background-color: -fx-neutral-200;
}

.button:focused {
    -fx-border-color: -fx-primary-500;
    -fx-border-width: 2px;
}

/* Primary Button */
.button.primary {
    -fx-background-color: -fx-primary-600;
    -fx-border-color: -fx-primary-600;
    -fx-text-fill: white;
}

.button.primary:hover {
    -fx-background-color: -fx-primary-700;
    -fx-border-color: -fx-primary-700;
}

/* Danger Button */
.button.danger {
    -fx-background-color: -fx-danger;
    -fx-border-color: -fx-danger;
    -fx-text-fill: white;
}

/* Ghost Button */
.button.ghost {
    -fx-background-color: transparent;
    -fx-border-color: transparent;
}

.button.ghost:hover {
    -fx-background-color: -fx-neutral-100;
}

/* Icon Button */
.button.icon-only {
    -fx-padding: 8px;
    -fx-min-width: 36px;
    -fx-min-height: 36px;
}
```

#### Text Fields

```css
/* text-fields.css */

.text-field, .text-area {
    -fx-background-color: -fx-surface;
    -fx-border-color: -fx-border;
    -fx-border-width: 1px;
    -fx-border-radius: -fx-radius-md;
    -fx-background-radius: -fx-radius-md;
    -fx-padding: 10px 12px;
    -fx-font-size: 14px;
    -fx-text-fill: -fx-text-primary;
    -fx-prompt-text-fill: -fx-text-secondary;
}

.text-field:focused, .text-area:focused {
    -fx-border-color: -fx-primary-500;
    -fx-border-width: 2px;
    -fx-effect: dropshadow(gaussian, rgba(59, 130, 246, 0.2), 8, 0, 0, 0);
}

/* Error State */
.text-field.error, .text-area.error {
    -fx-border-color: -fx-danger;
}

.text-field.error:focused {
    -fx-effect: dropshadow(gaussian, rgba(239, 68, 68, 0.2), 8, 0, 0, 0);
}

/* With Label */
.field-container {
    -fx-spacing: 6px;
}

.field-label {
    -fx-font-size: 14px;
    -fx-font-weight: 500;
    -fx-text-fill: -fx-text-primary;
}

.field-error {
    -fx-font-size: 12px;
    -fx-text-fill: -fx-danger;
}
```

#### Cards

```css
/* cards.css */

.card {
    -fx-background-color: -fx-surface;
    -fx-border-color: -fx-border;
    -fx-border-width: 1px;
    -fx-border-radius: -fx-radius-lg;
    -fx-background-radius: -fx-radius-lg;
    -fx-padding: -fx-spacing-lg;
    -fx-effect: -fx-shadow-sm;
}

.card:hover {
    -fx-effect: -fx-shadow-md;
}

.card-header {
    -fx-padding: 0 0 -fx-spacing-md 0;
    -fx-border-color: transparent transparent -fx-border transparent;
    -fx-border-width: 0 0 1px 0;
}

.card-title {
    -fx-font-size: 18px;
    -fx-font-weight: 600;
    -fx-text-fill: -fx-text-primary;
}

.card-subtitle {
    -fx-font-size: 14px;
    -fx-text-fill: -fx-text-secondary;
}

/* Stat Card */
.stat-card {
    -fx-min-width: 200px;
}

.stat-card .stat-value {
    -fx-font-size: 32px;
    -fx-font-weight: 700;
}

.stat-card.income .stat-value { -fx-text-fill: -fx-success; }
.stat-card.expense .stat-value { -fx-text-fill: -fx-danger; }
.stat-card.profit .stat-value { -fx-text-fill: -fx-primary-600; }
```

#### Tables

```css
/* tables.css */

.table-view {
    -fx-background-color: -fx-surface;
    -fx-border-color: -fx-border;
    -fx-border-radius: -fx-radius-md;
    -fx-background-radius: -fx-radius-md;
}

.table-view .column-header-background {
    -fx-background-color: -fx-neutral-100;
}

.table-view .column-header {
    -fx-background-color: transparent;
    -fx-border-color: transparent transparent -fx-border transparent;
    -fx-padding: 12px 16px;
}

.table-view .column-header .label {
    -fx-font-weight: 600;
    -fx-text-fill: -fx-text-secondary;
    -fx-font-size: 12px;
    -fx-text-transform: uppercase;
}

.table-view .table-cell {
    -fx-padding: 12px 16px;
    -fx-border-color: transparent transparent -fx-border transparent;
    -fx-text-fill: -fx-text-primary;
}

.table-view .table-row-cell:selected {
    -fx-background-color: -fx-primary-50;
}

.table-view .table-row-cell:selected .table-cell {
    -fx-text-fill: -fx-text-primary;
}

/* Empty State */
.table-view .placeholder {
    -fx-background-color: transparent;
}

.table-view .placeholder .label {
    -fx-text-fill: -fx-text-secondary;
    -fx-font-size: 14px;
}
```

### Layout Patterns

#### Navigation Sidebar

```xml
<?xml version="1.0" encoding="UTF-8"?>
<?import javafx.scene.layout.*?>
<?import javafx.scene.control.*?>
<?import org.kordamp.ikonli.javafx.FontIcon?>

<VBox styleClass="sidebar" prefWidth="240">
    <!-- Logo -->
    <HBox styleClass="sidebar-header" alignment="CENTER_LEFT">
        <FontIcon iconLiteral="fas-file-invoice-dollar" styleClass="logo-icon"/>
        <Label text="Self-Employ UK" styleClass="logo-text"/>
    </HBox>

    <!-- Navigation Items -->
    <VBox styleClass="nav-items" VBox.vgrow="ALWAYS">
        <Button styleClass="nav-item, active" maxWidth="Infinity">
            <graphic><FontIcon iconLiteral="fas-home"/></graphic>
            <text>Dashboard</text>
        </Button>
        <Button styleClass="nav-item" maxWidth="Infinity">
            <graphic><FontIcon iconLiteral="fas-arrow-up"/></graphic>
            <text>Income</text>
        </Button>
        <Button styleClass="nav-item" maxWidth="Infinity">
            <graphic><FontIcon iconLiteral="fas-arrow-down"/></graphic>
            <text>Expenses</text>
        </Button>
        <Button styleClass="nav-item" maxWidth="Infinity">
            <graphic><FontIcon iconLiteral="fas-calculator"/></graphic>
            <text>Tax Summary</text>
        </Button>
        <Button styleClass="nav-item" maxWidth="Infinity">
            <graphic><FontIcon iconLiteral="fas-paper-plane"/></graphic>
            <text>HMRC Submit</text>
        </Button>
    </VBox>

    <!-- Footer -->
    <VBox styleClass="sidebar-footer">
        <Separator/>
        <Button styleClass="nav-item" maxWidth="Infinity">
            <graphic><FontIcon iconLiteral="fas-cog"/></graphic>
            <text>Settings</text>
        </Button>
    </VBox>
</VBox>
```

```css
/* sidebar.css */
.sidebar {
    -fx-background-color: -fx-neutral-900;
    -fx-padding: 0;
}

.sidebar-header {
    -fx-padding: 20px 16px;
    -fx-spacing: 12px;
}

.logo-icon {
    -fx-icon-color: -fx-primary-500;
    -fx-icon-size: 24px;
}

.logo-text {
    -fx-font-size: 18px;
    -fx-font-weight: 700;
    -fx-text-fill: white;
}

.nav-items {
    -fx-padding: 8px;
    -fx-spacing: 4px;
}

.nav-item {
    -fx-background-color: transparent;
    -fx-text-fill: -fx-neutral-400;
    -fx-alignment: CENTER_LEFT;
    -fx-padding: 12px 16px;
    -fx-background-radius: -fx-radius-md;
    -fx-graphic-text-gap: 12px;
}

.nav-item .ikonli-font-icon {
    -fx-icon-color: -fx-neutral-400;
    -fx-icon-size: 18px;
}

.nav-item:hover {
    -fx-background-color: -fx-neutral-800;
    -fx-text-fill: white;
}

.nav-item:hover .ikonli-font-icon {
    -fx-icon-color: white;
}

.nav-item.active {
    -fx-background-color: -fx-primary-600;
    -fx-text-fill: white;
}

.nav-item.active .ikonli-font-icon {
    -fx-icon-color: white;
}

.sidebar-footer {
    -fx-padding: 8px;
}

.sidebar-footer .separator {
    -fx-padding: 8px 0;
}

.sidebar-footer .separator .line {
    -fx-border-color: -fx-neutral-700;
}
```

#### Form Layout

```xml
<?xml version="1.0" encoding="UTF-8"?>
<?import javafx.scene.layout.*?>
<?import javafx.scene.control.*?>

<VBox styleClass="form" spacing="20" maxWidth="500">
    <!-- Amount Field -->
    <VBox styleClass="field-container">
        <Label text="Amount *" styleClass="field-label"/>
        <HBox styleClass="input-group">
            <Label text="£" styleClass="input-prefix"/>
            <TextField fx:id="amountField" promptText="0.00"
                       HBox.hgrow="ALWAYS"/>
        </HBox>
        <Label fx:id="amountError" styleClass="field-error" visible="false"/>
    </VBox>

    <!-- Category Field -->
    <VBox styleClass="field-container">
        <Label text="Category *" styleClass="field-label"/>
        <ComboBox fx:id="categoryCombo" promptText="Select category"
                  maxWidth="Infinity"/>
    </VBox>

    <!-- Date Field -->
    <VBox styleClass="field-container">
        <Label text="Date *" styleClass="field-label"/>
        <DatePicker fx:id="datePicker" maxWidth="Infinity"/>
    </VBox>

    <!-- Description Field -->
    <VBox styleClass="field-container">
        <Label text="Description" styleClass="field-label"/>
        <TextArea fx:id="descriptionArea" promptText="Enter details..."
                  prefRowCount="3"/>
    </VBox>

    <!-- Actions -->
    <HBox styleClass="form-actions" alignment="CENTER_RIGHT" spacing="12">
        <Button text="Cancel" styleClass="button" onAction="#onCancel"/>
        <Button text="Save" styleClass="button, primary" onAction="#onSave"/>
    </HBox>
</VBox>
```

```css
/* forms.css */
.form {
    -fx-padding: 24px;
}

.input-group {
    -fx-alignment: CENTER_LEFT;
}

.input-prefix {
    -fx-background-color: -fx-neutral-100;
    -fx-border-color: -fx-border;
    -fx-border-width: 1px 0 1px 1px;
    -fx-border-radius: -fx-radius-md 0 0 -fx-radius-md;
    -fx-background-radius: -fx-radius-md 0 0 -fx-radius-md;
    -fx-padding: 10px 12px;
    -fx-text-fill: -fx-text-secondary;
}

.input-group .text-field {
    -fx-border-radius: 0 -fx-radius-md -fx-radius-md 0;
    -fx-background-radius: 0 -fx-radius-md -fx-radius-md 0;
}

.form-actions {
    -fx-padding: 16px 0 0 0;
    -fx-border-color: -fx-border transparent transparent transparent;
    -fx-border-width: 1px 0 0 0;
}
```

### Scene Builder Tips

1. **Use Style Classes**: Always use `-fx-style-class` instead of inline styles
2. **Preview with CSS**: Load stylesheet in Scene Builder preview
3. **Anchor Constraints**: Use AnchorPane sparingly, prefer VBox/HBox
4. **fx:id Naming**: Use camelCase, match field names in controller
5. **Spacing**: Use consistent spacing (8, 16, 24, 32)

### Accessibility Checklist

- [ ] All interactive elements focusable with Tab
- [ ] Focus indicators visible (2px border)
- [ ] Color contrast ratio ≥ 4.5:1
- [ ] Touch targets ≥ 44x44px
- [ ] Labels associated with inputs (labelFor)
- [ ] Tooltips on icon-only buttons
- [ ] Keyboard shortcuts for common actions

## Parent & Related Skills

| Skill | Relationship |
|-------|--------------|
| **ui-designer** | Parent skill - invoke for design process, discovery |
| **javafx-developer** | For implementation, MVVM integration |
| **frontend-developer** | For general UI/UX patterns |

## Standards

- **Design Tokens**: Use CSS variables for all colors, spacing, radii
- **Component-Based**: Create reusable, composable components
- **Theme Support**: Design for light and dark themes
- **Responsive**: Support minimum 800x600, scale to any size
- **Accessibility First**: WCAG 2.1 AA compliance

## Checklist

### Before Designing
- [ ] Discovery questions answered
- [ ] Target screen sizes defined
- [ ] Theme requirements (light/dark)
- [ ] Accessibility requirements

### Design Delivery
- [ ] FXML layouts created
- [ ] CSS stylesheets complete
- [ ] All states designed (hover, focus, active, disabled)
- [ ] Empty states designed
- [ ] Loading states designed
- [ ] Error states designed
- [ ] Dark theme (if required)

## Anti-Patterns to Avoid

1. **Inline styles**: Always use external CSS
2. **Hardcoded colors**: Use design tokens
3. **Web CSS syntax**: Remember JavaFX uses `-fx-` prefix
4. **Ignoring focus states**: Desktop apps need keyboard navigation
5. **Fixed sizes**: Use responsive layouts (grow, constraints)
6. **No visual hierarchy**: Use consistent typography scale
