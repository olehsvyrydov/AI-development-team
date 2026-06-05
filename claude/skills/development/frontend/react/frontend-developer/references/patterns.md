# Frontend — Patterns (same-origin iframe embedding · self-documenting code style)

## Same-Origin Iframe Embedding Patterns

When embedding same-origin content (dashboards, monitoring tools) inside an admin panel:

### Theme Sync via MutationObserver

Watch the parent's `<html>` element for class changes (dark mode toggle), then sync to the iframe:

```javascript
// Detect parent theme changes
var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
        if (m.attributeName === 'class') syncIframeTheme();
    });
});
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

// Apply theme to iframe via contentDocument (same-origin only)
function syncIframeTheme() {
    var doc = iframe.contentDocument;
    if (!doc) return;
    if (document.documentElement.classList.contains('dark')) {
        doc.documentElement.classList.add('dark');
    } else {
        doc.documentElement.classList.remove('dark');
    }
}
```

### CSS Injection to Hide Unwanted UI

Inject a `<style>` element once into the iframe's `<head>`:

```javascript
if (!doc.getElementById('embedded-style')) {
    var style = doc.createElement('style');
    style.id = 'embedded-style';
    style.textContent = '.logo { display: none !important; } .theme-switcher { display: none !important; }';
    doc.head.appendChild(style);
}
```

### Viewport-Filling Iframe Without Page Scroll

```javascript
// Prevent page-level scrolling
document.documentElement.style.overflow = 'hidden';

// Size container to fill remaining viewport
function sizeContainer() {
    var top = container.getBoundingClientRect().top;
    container.style.height = Math.max(window.innerHeight - top - 16, 150) + 'px';
    container.style.overflow = 'hidden';
}
sizeContainer();
window.addEventListener('resize', sizeContainer);
```

**Key insight**: CSS-only approaches (`calc(100vh - ...)`, flexbox with `overflow:hidden`) fail when the parent framework (Filament, WordPress admin, etc.) sets `min-h-screen` on multiple ancestor elements. The JS approach measures the actual position and forcibly prevents page scroll.

---

## Code Style: Self-Documenting Code

Write code that explains itself without needing comments:

```tsx
// BAD - obvious comments cluttering code
// Check if user is logged in
if (user !== null) {
  // Show the dashboard
  return <Dashboard />;
}

// GOOD - self-documenting
if (user) {
  return <Dashboard />;
}

// GOOD - JSDoc for component API (public interface)
/**
 * Displays user profile with edit capabilities.
 * @param userId - The user's unique identifier
 * @param onUpdate - Called when profile is successfully updated
 */
export function UserProfile({ userId, onUpdate }: UserProfileProps) { ... }
```

**Rules:**
- **No "what" comments** — code shows what; write clear code instead
- **"Why" comments OK** — explain non-obvious business logic or workarounds
- **JSDoc for public APIs** — document component props, hooks, utilities
- **No commented-out code** — delete it; version control preserves history
- **No noise in tests** — test names should describe behavior; no inline narration

---

