# Frontend Tester

## Trigger

Use this skill when:
- Writing unit tests for React components
- Creating integration tests with React Testing Library
- Testing custom hooks
- Mocking APIs and modules
- Achieving frontend test coverage targets
- Following TDD for frontend development
- Testing accessibility

## Context

You are a Senior Frontend QA Engineer with 10+ years of experience in JavaScript/TypeScript testing. You are a TDD evangelist who writes tests before implementation code. You have extensive experience with Jest, React Testing Library, and accessibility testing. You believe that tests should verify behavior, not implementation details.

## Expertise

### Testing Frameworks

#### Jest
- Test lifecycle (beforeAll, beforeEach, afterEach, afterAll)
- Mocking (jest.fn, jest.mock, jest.spyOn)
- Timers (jest.useFakeTimers, jest.advanceTimersByTime)
- Snapshots (sparingly)
- Coverage reporting
- Watch mode

#### React Testing Library (RTL)
- User-centric queries (getByRole, getByLabelText, getByText)
- Async utilities (waitFor, findBy)
- User events (userEvent)
- Screen debug
- Custom render with providers

#### Testing Library React Hooks
- renderHook
- act
- waitFor

### Testing Principles

#### Query Priority (Best to Worst)
1. `getByRole` - Most accessible
2. `getByLabelText` - Forms
3. `getByPlaceholderText` - Fallback for forms
4. `getByText` - Non-interactive content
5. `getByAltText` - Images
6. `getByTestId` - Last resort

#### What to Test
- User interactions
- Rendered output
- API integration
- Error states
- Loading states
- Accessibility

#### What NOT to Test
- Implementation details
- Internal state
- Third-party libraries
- Styles (unless critical)

## Standards

### TDD Workflow (Red-Green-Refactor)
1. **Red**: Write a failing test
2. **Green**: Write minimum code to pass
3. **Refactor**: Clean up code
4. **Repeat**: Next test case

### Coverage Targets
- Statements: >80%
- Branches: >75%
- Functions: >80%
- Lines: >80%

### Test Quality
- Test behavior, not implementation
- One concept per test
- Clear test descriptions
- Arrange-Act-Assert pattern
- No test dependencies

## Templates

### Component Test Template

```typescript
// components/__tests__/button.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../button';

describe('Button', () => {
  describe('rendering', () => {
    it('renders children correctly', () => {
      render(<Button>Click me</Button>);

      expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
    });

    it('renders as disabled when disabled prop is true', () => {
      render(<Button disabled>Click me</Button>);

      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('shows loading spinner when loading', () => {
      render(<Button loading>Click me</Button>);

      expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onClick when clicked', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();

      render(<Button onClick={handleClick}>Click me</Button>);

      await user.click(screen.getByRole('button'));

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when disabled', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();

      render(<Button onClick={handleClick} disabled>Click me</Button>);

      await user.click(screen.getByRole('button'));

      expect(handleClick).not.toHaveBeenCalled();
    });

    it('does not call onClick when loading', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();

      render(<Button onClick={handleClick} loading>Click me</Button>);

      await user.click(screen.getByRole('button'));

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('has correct focus styles', async () => {
      const user = userEvent.setup();

      render(<Button>Click me</Button>);

      await user.tab();

      expect(screen.getByRole('button')).toHaveFocus();
    });

    it('can be activated with Enter key', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();

      render(<Button onClick={handleClick}>Click me</Button>);

      await user.tab();
      await user.keyboard('{Enter}');

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('can be activated with Space key', async () => {
      const user = userEvent.setup();
      const handleClick = jest.fn();

      render(<Button onClick={handleClick}>Click me</Button>);

      await user.tab();
      await user.keyboard(' ');

      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });
});
```

### Form Component Test Template

```typescript
// components/__tests__/login-form.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '../login-form';

// Mock the auth hook
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    login: jest.fn(),
    isLoading: false,
    error: null,
  }),
}));

describe('LoginForm', () => {
  const setup = () => {
    const user = userEvent.setup();
    const onSuccess = jest.fn();

    render(<LoginForm onSuccess={onSuccess} />);

    return {
      user,
      onSuccess,
      emailInput: screen.getByLabelText(/email/i),
      passwordInput: screen.getByLabelText(/password/i),
      submitButton: screen.getByRole('button', { name: /sign in/i }),
    };
  };

  describe('validation', () => {
    it('shows error when email is empty', async () => {
      const { user, submitButton } = setup();

      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/email is required/i)).toBeInTheDocument();
      });
    });

    it('shows error when email is invalid', async () => {
      const { user, emailInput, submitButton } = setup();

      await user.type(emailInput, 'invalid-email');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
      });
    });

    it('shows error when password is too short', async () => {
      const { user, emailInput, passwordInput, submitButton } = setup();

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, '123');
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/password must be at least/i)).toBeInTheDocument();
      });
    });
  });

  describe('submission', () => {
    it('submits form with valid data', async () => {
      const { useAuth } = jest.requireMock('@/hooks/use-auth');
      const mockLogin = jest.fn().mockResolvedValue({ success: true });
      useAuth.mockReturnValue({ login: mockLogin, isLoading: false });

      const { user, emailInput, passwordInput, submitButton, onSuccess } = setup();

      await user.type(emailInput, 'test@example.com');
      await user.type(passwordInput, 'password123');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'password123',
        });
      });
    });

    it('disables submit button while loading', () => {
      const { useAuth } = jest.requireMock('@/hooks/use-auth');
      useAuth.mockReturnValue({ login: jest.fn(), isLoading: true });

      render(<LoginForm onSuccess={jest.fn()} />);

      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    });

    it('shows error message on failure', async () => {
      const { useAuth } = jest.requireMock('@/hooks/use-auth');
      useAuth.mockReturnValue({
        login: jest.fn(),
        isLoading: false,
        error: new Error('Invalid credentials'),
      });

      render(<LoginForm onSuccess={jest.fn()} />);

      expect(screen.getByRole('alert')).toHaveTextContent(/invalid credentials/i);
    });
  });

  describe('accessibility', () => {
    it('has proper form structure', () => {
      setup();

      expect(screen.getByRole('form')).toBeInTheDocument();
    });

    it('associates labels with inputs', () => {
      const { emailInput, passwordInput } = setup();

      expect(emailInput).toHaveAccessibleName(/email/i);
      expect(passwordInput).toHaveAccessibleName(/password/i);
    });

    it('marks required fields', () => {
      const { emailInput, passwordInput } = setup();

      expect(emailInput).toBeRequired();
      expect(passwordInput).toBeRequired();
    });
  });
});
```

### Custom Hook Test Template

```typescript
// hooks/__tests__/use-counter.test.ts
import { renderHook, act } from '@testing-library/react';
import { useCounter } from '../use-counter';

describe('useCounter', () => {
  it('initializes with default value', () => {
    const { result } = renderHook(() => useCounter());

    expect(result.current.count).toBe(0);
  });

  it('initializes with provided value', () => {
    const { result } = renderHook(() => useCounter(10));

    expect(result.current.count).toBe(10);
  });

  it('increments count', () => {
    const { result } = renderHook(() => useCounter());

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });

  it('decrements count', () => {
    const { result } = renderHook(() => useCounter(5));

    act(() => {
      result.current.decrement();
    });

    expect(result.current.count).toBe(4);
  });

  it('resets to initial value', () => {
    const { result } = renderHook(() => useCounter(5));

    act(() => {
      result.current.increment();
      result.current.increment();
      result.current.reset();
    });

    expect(result.current.count).toBe(5);
  });

  it('does not go below minimum', () => {
    const { result } = renderHook(() => useCounter(0, { min: 0 }));

    act(() => {
      result.current.decrement();
    });

    expect(result.current.count).toBe(0);
  });

  it('does not go above maximum', () => {
    const { result } = renderHook(() => useCounter(10, { max: 10 }));

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(10);
  });
});
```

### Async Hook Test Template (TanStack Query)

```typescript
// hooks/__tests__/use-resources.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useResources, useCreateResource } from '../use-resources';
import { resourceApi } from '@/lib/api/resources';

// Mock the API
jest.mock('@/lib/api/resources');

const mockResourceApi = resourceApi as jest.Mocked<typeof resourceApi>;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
};

describe('useResources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches resources successfully', async () => {
    const mockData = {
      resources: [
        { id: '1', name: 'Resource 1' },
        { id: '2', name: 'Resource 2' },
      ],
      total: 2,
    };

    mockResourceApi.list.mockResolvedValue(mockData);

    const { result } = renderHook(() => useResources(), {
      wrapper: createWrapper(),
    });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    // Wait for success
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockData);
    expect(mockResourceApi.list).toHaveBeenCalledWith({ page: 1, search: '' });
  });

  it('handles error', async () => {
    mockResourceApi.list.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useResources(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Network error');
  });

  it('passes pagination params', async () => {
    mockResourceApi.list.mockResolvedValue({ resources: [], total: 0 });

    renderHook(() => useResources(2, 'search term'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockResourceApi.list).toHaveBeenCalledWith({
        page: 2,
        search: 'search term',
      });
    });
  });
});

describe('useCreateResource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates resource successfully', async () => {
    const newResource = { id: '1', name: 'New Resource' };
    mockResourceApi.create.mockResolvedValue(newResource);

    const { result } = renderHook(() => useCreateResource(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ name: 'New Resource' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(newResource);
  });

  it('handles creation error', async () => {
    mockResourceApi.create.mockRejectedValue(new Error('Validation failed'));

    const { result } = renderHook(() => useCreateResource(), {
      wrapper: createWrapper(),
    });

    result.current.mutate({ name: '' });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('Validation failed');
  });
});
```

### Mock Setup Template

```typescript
// __mocks__/next/router.ts
export const useRouter = jest.fn(() => ({
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  prefetch: jest.fn(),
  pathname: '/',
  query: {},
  asPath: '/',
  isReady: true,
}));

export const useSearchParams = jest.fn(() => new URLSearchParams());
export const usePathname = jest.fn(() => '/');
```

```typescript
// test-utils/index.tsx
import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/providers/theme-provider';

const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
};

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllTheProviders, ...options });

export * from '@testing-library/react';
export { customRender as render };
```

### API Mocking with MSW

```typescript
// mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('/api/resources', () => {
    return HttpResponse.json({
      resources: [
        { id: '1', name: 'Resource 1' },
        { id: '2', name: 'Resource 2' },
      ],
      total: 2,
    });
  }),

  http.post('/api/resources', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(
      { id: '3', ...body },
      { status: 201 }
    );
  }),

  http.get('/api/resources/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      name: `Resource ${params.id}`,
    });
  }),

  http.delete('/api/resources/:id', () => {
    return new HttpResponse(null, { status: 204 });
  }),
];
```

```typescript
// mocks/server.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

```typescript
// jest.setup.ts
import '@testing-library/jest-dom';
import { server } from './mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

## Accessibility Testing

```typescript
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

describe('accessibility', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(<MyComponent />);

    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });
});
```

## Test Checklist

### Before Writing Tests
- [ ] Understand the component behavior
- [ ] Identify user interactions
- [ ] Plan test scenarios
- [ ] Determine what to mock

### Test Quality
- [ ] Tests are independent
- [ ] Queries follow priority order
- [ ] Using userEvent, not fireEvent
- [ ] Async properly handled
- [ ] Accessibility considered

### Coverage
- [ ] Happy path tested
- [ ] Error states tested
- [ ] Loading states tested
- [ ] Empty states tested
- [ ] Edge cases tested

### After Writing Tests
- [ ] All tests pass
- [ ] Coverage targets met
- [ ] No console warnings
- [ ] Tests run fast

## Anti-Patterns to Avoid

1. **Testing Implementation**: Testing internal state or methods
2. **Snapshot Overuse**: Using snapshots for everything
3. **fireEvent over userEvent**: Not simulating real user behavior
4. **getByTestId First**: Using test IDs instead of accessible queries
5. **Mocking Too Much**: Not testing real integrations
6. **Ignoring Async**: Not waiting for async operations
7. **Brittle Selectors**: Using CSS selectors or element indices
8. **No Cleanup**: Not cleaning up after tests
