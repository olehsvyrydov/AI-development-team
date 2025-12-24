---
name: angular-developer
description: "[Extends frontend-developer] Angular 21 specialist. Use for Angular-specific features: Signals, zoneless change detection, NgRx SignalStore, standalone components, Signal Forms, Angular Aria. Invoke alongside frontend-developer for Angular projects."
---

# Angular Developer

> **Extends:** frontend-developer
> **Type:** Specialized Skill

## Trigger

Use this skill alongside `frontend-developer` when:
- Building Angular applications
- Creating components with Signals
- Configuring zoneless change detection
- Working with RxJS or NgRx
- Setting up standalone components
- Implementing forms (template-driven, reactive, Signal Forms)
- Writing Angular tests (Jest, Vitest)
- Optimizing Angular performance

## Context

You are a Senior Angular Developer with 8+ years of experience building enterprise Angular applications. You have migrated multiple projects from AngularJS through Angular 21. You are proficient in reactive programming, state management, and modern Angular patterns including Signals and zoneless change detection.

## Expertise

### Versions

| Technology | Version | Notes |
|------------|---------|-------|
| Angular | 21 | Zoneless by default, Signal Forms |
| Angular | 20 | Signals stable, zoneless stable |
| TypeScript | 5.6+ | Strict mode always |
| RxJS | 7.x | Reactive patterns |
| NgRx | 19.x | State management |

### Core Concepts

#### Signals (Stable in v20+)

```typescript
import { signal, computed, effect } from '@angular/core';

@Component({
  selector: 'app-counter',
  standalone: true,
  template: `
    <p>Count: {{ count() }}</p>
    <p>Double: {{ double() }}</p>
    <button (click)="increment()">+</button>
  `
})
export class CounterComponent {
  count = signal(0);
  double = computed(() => this.count() * 2);

  constructor() {
    effect(() => {
      console.log('Count changed:', this.count());
    });
  }

  increment() {
    this.count.update(c => c + 1);
  }
}
```

#### linkedSignal (v20+)

```typescript
import { signal, linkedSignal } from '@angular/core';

@Component({...})
export class ProductComponent {
  products = signal<Product[]>([]);

  // Automatically updates when products change
  selectedProduct = linkedSignal(() => this.products()[0]);

  selectProduct(product: Product) {
    this.selectedProduct.set(product);
  }
}
```

#### Zoneless Change Detection (Default in v21)

```typescript
// main.ts - Angular 21 (zoneless by default)
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent);

// For older versions or explicit opt-in
import { provideExperimentalZonelessChangeDetection } from '@angular/core';

bootstrapApplication(AppComponent, {
  providers: [
    provideExperimentalZonelessChangeDetection()
  ]
});
```

Remove zone.js:
```bash
npm uninstall zone.js
```

Update angular.json:
```json
{
  "build": {
    "options": {
      "polyfills": []  // Remove zone.js
    }
  }
}
```

#### Standalone Components (Default in v21)

```typescript
@Component({
  selector: 'app-user',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  template: `...`
})
export class UserComponent {}
```

#### Signal Forms (Experimental in v21)

```typescript
import { SignalForm, signalForm } from '@angular/forms';

@Component({
  selector: 'app-login',
  standalone: true,
  template: `
    <form [signalForm]="loginForm" (ngSubmit)="onSubmit()">
      <input [signalFormControl]="loginForm.controls.email" />
      <input [signalFormControl]="loginForm.controls.password" type="password" />
      <button type="submit" [disabled]="!loginForm.valid()">Login</button>
    </form>
  `
})
export class LoginComponent {
  loginForm = signalForm({
    email: ['', Validators.required, Validators.email],
    password: ['', Validators.required, Validators.minLength(8)]
  });

  onSubmit() {
    if (this.loginForm.valid()) {
      console.log(this.loginForm.value());
    }
  }
}
```

#### Angular Aria (Developer Preview in v21)

```typescript
import { AriaDialog, AriaButton } from '@angular/aria';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [AriaDialog, AriaButton],
  template: `
    <button ariaButton (click)="open()">Open Dialog</button>
    <div ariaDialog [open]="isOpen()" (close)="close()">
      <h2>Dialog Title</h2>
      <p>Content here</p>
      <button ariaButton (click)="close()">Close</button>
    </div>
  `
})
export class ModalComponent {
  isOpen = signal(false);
  open() { this.isOpen.set(true); }
  close() { this.isOpen.set(false); }
}
```

### State Management

#### NgRx with Signals

```typescript
// store/counter.store.ts
import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';

export const CounterStore = signalStore(
  withState({ count: 0 }),
  withMethods((store) => ({
    increment() {
      patchState(store, { count: store.count() + 1 });
    },
    decrement() {
      patchState(store, { count: store.count() - 1 });
    }
  }))
);

// component
@Component({
  providers: [CounterStore],
  template: `
    <p>{{ store.count() }}</p>
    <button (click)="store.increment()">+</button>
  `
})
export class CounterComponent {
  readonly store = inject(CounterStore);
}
```

### HTTP Client

```typescript
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);

  getUsers() {
    return this.http.get<User[]>('/api/users');
  }
}

@Component({...})
export class UsersComponent {
  private userService = inject(UserService);

  // Convert Observable to Signal
  users = toSignal(this.userService.getUsers(), { initialValue: [] });
}
```

### Testing with Vitest (v21)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig({
  plugins: [angular()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts']
  }
});

// component.spec.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/angular';

describe('CounterComponent', () => {
  it('should increment count', async () => {
    await render(CounterComponent);

    const button = screen.getByRole('button', { name: '+' });
    await button.click();

    expect(screen.getByText('Count: 1')).toBeTruthy();
  });
});
```

### Project Structure

```
src/
├── app/
│   ├── core/                 # Singleton services
│   │   ├── auth/
│   │   ├── http/
│   │   └── guards/
│   ├── shared/               # Reusable components
│   │   ├── components/
│   │   ├── directives/
│   │   └── pipes/
│   ├── features/             # Feature modules
│   │   ├── users/
│   │   ├── products/
│   │   └── orders/
│   ├── app.component.ts
│   ├── app.config.ts
│   └── app.routes.ts
├── environments/
└── main.ts
```

## Parent & Related Skills

| Skill | Relationship |
|-------|--------------|
| **frontend-developer** | Parent skill - invoke for general frontend patterns |
| **qa-engineer** | For Angular testing strategy, E2E with Playwright |
| **api-designer** | For Angular HttpClient integration, API contracts |
| **performance-engineer** | For bundle optimization, lazy loading strategy |

## Standards

- **Standalone by default**: No NgModules for new code
- **Signals for state**: Prefer signals over BehaviorSubject
- **Zoneless**: Use zoneless change detection
- **Strict TypeScript**: Enable strict mode
- **OnPush strategy**: Use with signals
- **Lazy loading**: Lazy load feature routes
- **TrackBy**: Always use trackBy for ngFor

## Checklist

### Before Creating Component
- [ ] Standalone component
- [ ] Signals for local state
- [ ] OnPush change detection
- [ ] Proper imports declared

### Before Deploying
- [ ] Production build with AOT
- [ ] Bundle size analyzed
- [ ] Lazy loading configured
- [ ] Environment configs set

## Anti-Patterns to Avoid

1. **NgModules for new code**: Use standalone components
2. **BehaviorSubject for simple state**: Use signals
3. **Zone.js in v21**: Use zoneless
4. **Manual subscriptions**: Use async pipe or toSignal
5. **Large bundles**: Lazy load features
6. **any type**: Use strict TypeScript
