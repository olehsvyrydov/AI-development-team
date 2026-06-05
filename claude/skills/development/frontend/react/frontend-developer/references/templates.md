# Frontend — Templates (components · hooks · features)

## Templates

### Next.js Server Component Page

```typescript
// app/resources/page.tsx
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ResourceList } from '@/components/resources/resource-list';
import { ResourceListSkeleton } from '@/components/resources/resource-list-skeleton';

export const metadata: Metadata = {
  title: 'Resources | App Name',
  description: 'Browse all resources',
  openGraph: { title: 'Resources', description: 'Browse all resources' },
};

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>;
}) {
  const { page: pageStr } = await searchParams;
  const page = Number(pageStr) || 1;

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Resources</h1>
      <Suspense fallback={<ResourceListSkeleton />}>
        <ResourceList page={page} />
      </Suspense>
    </main>
  );
}
```

### React Client Component

```typescript
'use client';

import { memo } from 'react';
import type { Resource } from '@/types';

interface ResourceCardProps {
  resource: Resource;
  onSelect?: (resource: Resource) => void;
  isSelected?: boolean;
}

export const ResourceCard = memo(function ResourceCard({
  resource,
  onSelect,
  isSelected = false,
}: ResourceCardProps) {
  return (
    <button
      onClick={() => onSelect?.(resource)}
      className={`
        p-4 rounded-lg border transition-colors
        ${isSelected ? 'border-primary bg-primary/10' : 'border-gray-200 hover:border-gray-300'}
      `}
      aria-pressed={isSelected}
    >
      <h3 className="font-semibold">{resource.name}</h3>
      <p className="text-gray-600">{resource.description}</p>
    </button>
  );
});
```

### Server Action Form

```typescript
'use client';

import { useActionState } from 'react';
import { submitResource } from '@/actions/resources';

export function ResourceForm() {
  const [state, formAction, isPending] = useActionState(submitResource, {
    errors: {},
  });

  return (
    <form action={formAction}>
      <label htmlFor="name">Name</label>
      <input
        id="name"
        name="name"
        aria-describedby={state.errors?.name ? 'name-error' : undefined}
        aria-invalid={!!state.errors?.name}
      />
      {state.errors?.name && (
        <p id="name-error" role="alert">{state.errors.name}</p>
      )}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Resource'}
      </button>
    </form>
  );
}
```

### Custom Hook with TanStack Query

```typescript
import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Resource, CreateResourceInput } from '@/types';

export function useResources() {
  return useSuspenseQuery({
    queryKey: ['resources'],
    queryFn: () => api.resources.list(),
  });
}

export function useCreateResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateResourceInput) => api.resources.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}
```

### Test with MSW + RTL

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ResourceList } from './resource-list';
import { renderWithProviders } from '@/test/utils';

const server = setupServer(
  http.get('/api/resources', () =>
    HttpResponse.json([{ id: '1', name: 'Test Resource' }])
  ),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('ResourceList', () => {
  it('should display resources after loading', async () => {
    renderWithProviders(<ResourceList />);
    expect(await screen.findByText('Test Resource')).toBeInTheDocument();
  });

  it('should show empty state when no resources', async () => {
    server.use(http.get('/api/resources', () => HttpResponse.json([])));
    renderWithProviders(<ResourceList />);
    expect(await screen.findByText(/no resources/i)).toBeInTheDocument();
  });
});
```

---

