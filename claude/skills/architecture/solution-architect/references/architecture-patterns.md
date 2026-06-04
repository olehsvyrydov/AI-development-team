# Architecture — Scaling, Microservices & Microfrontends

## System Scaling & Transformation

### Scaling Strategies

#### Horizontal vs Vertical Scaling

| Aspect | Vertical (Scale Up) | Horizontal (Scale Out) |
|--------|---------------------|------------------------|
| **How** | Bigger machine | More machines |
| **Cost** | Exponential | Linear |
| **Limit** | Hardware ceiling | Theoretically unlimited |
| **Complexity** | Low | Higher (distributed systems) |
| **Downtime** | Required for upgrade | Zero-downtime possible |
| **Best for** | Databases, legacy apps | Stateless services, web apps |

#### Scaling Dimensions

```
         ┌─────────────────────────────────────────┐
         │           Application Scaling           │
         │  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
         │  │ Service │ │ Service │ │ Service │   │
         │  │ Instance│ │ Instance│ │ Instance│   │
         │  └────┬────┘ └────┬────┘ └────┬────┘   │
         └───────┼───────────┼───────────┼────────┘
                 │           │           │
         ┌───────▼───────────▼───────────▼────────┐
         │              Load Balancer              │
         └───────────────────┬────────────────────┘
                             │
         ┌───────────────────▼────────────────────┐
         │            Database Scaling             │
         │  ┌─────────┐ ┌─────────┐ ┌─────────┐   │
         │  │ Primary │ │ Replica │ │ Replica │   │
         │  │  (Write)│ │  (Read) │ │  (Read) │   │
         │  └─────────┘ └─────────┘ └─────────┘   │
         └────────────────────────────────────────┘
```

### Legacy Modernization Patterns

#### Strangler Fig Pattern

Gradually replace legacy components with new implementations.

```
Phase 1: Facade
┌─────────────────────────────────────────┐
│              API Gateway                │
│  ┌──────────────────────────────────┐  │
│  │   100% → Legacy Monolith         │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘

Phase 2: Extract First Service
┌─────────────────────────────────────────┐
│              API Gateway                │
│  ┌───────────────┬──────────────────┐  │
│  │ /users → New  │ /* → Legacy      │  │
│  │   Service     │    Monolith      │  │
│  └───────────────┴──────────────────┘  │
└─────────────────────────────────────────┘

Phase 3: Continue Extraction
┌─────────────────────────────────────────┐
│              API Gateway                │
│  ┌────────┬────────┬────────┬───────┐  │
│  │ Users  │ Orders │Products│Legacy │  │
│  │Service │Service │Service │(small)│  │
│  └────────┴────────┴────────┴───────┘  │
└─────────────────────────────────────────┘

Phase 4: Decommission Legacy
┌─────────────────────────────────────────┐
│              API Gateway                │
│  ┌────────┬────────┬────────┬───────┐  │
│  │ Users  │ Orders │Products│ ...   │  │
│  │Service │Service │Service │       │  │
│  └────────┴────────┴────────┴───────┘  │
└─────────────────────────────────────────┘
```

**Implementation Steps:**
1. Create API Gateway/Facade in front of legacy
2. Identify bounded contexts for extraction
3. Build new service alongside legacy
4. Route traffic gradually (canary/feature flags)
5. Migrate data with dual-write or CDC
6. Decommission legacy component

#### Anti-Corruption Layer (ACL)

Protects new system from legacy system's domain model.

```
┌─────────────────────────────────────────────────────┐
│                   New System                        │
│  ┌──────────────────────────────────────────────┐  │
│  │            Clean Domain Model                │  │
│  │   Customer, Order, Product (new concepts)    │  │
│  └──────────────────────┬───────────────────────┘  │
│                         │                          │
│  ┌──────────────────────▼───────────────────────┐  │
│  │         Anti-Corruption Layer (ACL)          │  │
│  │  - Translators (converts legacy → new)       │  │
│  │  - Adapters (wraps legacy APIs)              │  │
│  │  - Facades (simplifies legacy interfaces)    │  │
│  └──────────────────────┬───────────────────────┘  │
└─────────────────────────┼───────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│                  Legacy System                      │
│  CUST_MSTR, ORD_HDR, PROD_TBL (legacy concepts)    │
└─────────────────────────────────────────────────────┘
```

#### Branch by Abstraction

Refactor in-place using feature toggles.

```java
// Step 1: Create abstraction
interface PaymentProcessor {
    PaymentResult process(Payment payment);
}

// Step 2: Wrap legacy behind abstraction
class LegacyPaymentProcessor implements PaymentProcessor {
    private final LegacyPaymentService legacy;

    public PaymentResult process(Payment payment) {
        return adaptToNewModel(legacy.executePayment(toLegacyFormat(payment)));
    }
}

// Step 3: Build new implementation
class ModernPaymentProcessor implements PaymentProcessor {
    public PaymentResult process(Payment payment) {
        // New implementation
    }
}

// Step 4: Toggle between implementations
class PaymentProcessorFactory {
    public PaymentProcessor create(String customerId) {
        if (featureFlags.isEnabled("modern-payments", customerId)) {
            return new ModernPaymentProcessor();
        }
        return new LegacyPaymentProcessor();
    }
}
```

### Migration Strategies

| Strategy | Risk | Downtime | Complexity | Best For |
|----------|------|----------|------------|----------|
| **Big Bang** | High | Long | Low | Small systems, hard deadlines |
| **Strangler Fig** | Low | Zero | Medium | Large monoliths, gradual migration |
| **Parallel Run** | Medium | Zero | High | Critical systems, data validation |
| **Blue-Green** | Low | Seconds | Medium | Full system replacement |
| **Canary** | Low | Zero | Medium | Testing in production |

---

## Microservices Architecture

### Service Decomposition Strategies

#### By Business Capability

```
E-Commerce Business Capabilities:
├── Customer Management
│   └── User Service (registration, authentication, profiles)
├── Product Management
│   └── Catalog Service (products, categories, inventory)
├── Order Management
│   └── Order Service (cart, checkout, order tracking)
├── Payment Processing
│   └── Payment Service (transactions, refunds)
├── Fulfillment
│   └── Shipping Service (logistics, tracking)
└── Customer Support
    └── Support Service (tickets, chat)
```

#### By Domain-Driven Design (DDD)

**Bounded Context Mapping:**

```
┌─────────────────────────────────────────────────────────────┐
│                     E-Commerce Domain                       │
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Catalog    │    │   Ordering   │    │   Shipping   │  │
│  │   Context    │    │   Context    │    │   Context    │  │
│  │              │    │              │    │              │  │
│  │ - Product    │    │ - Order      │    │ - Shipment   │  │
│  │ - Category   │    │ - OrderItem  │    │ - Carrier    │  │
│  │ - Price      │    │ - Cart       │    │ - Tracking   │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │          │
│         │    Customer/      │    Conformist     │          │
│         │    Supplier       │                   │          │
│         └───────────────────┴───────────────────┘          │
│                                                             │
│  Context Relationships:                                     │
│  - Catalog ←→ Ordering: Customer/Supplier                  │
│  - Ordering → Shipping: Conformist                         │
└─────────────────────────────────────────────────────────────┘
```

### Service Communication Patterns

#### Synchronous (Request-Response)

| Pattern | Use Case | Pros | Cons |
|---------|----------|------|------|
| **REST** | CRUD, simple queries | Simple, cacheable, widely understood | Tight coupling, limited real-time |
| **gRPC** | Service-to-service, high throughput | Fast, typed contracts, streaming | Complex setup, not browser-native |
| **GraphQL** | Frontend aggregation | Flexible queries, single endpoint | Complexity, caching challenges |

#### Asynchronous (Event-Driven)

| Pattern | Use Case | Pros | Cons |
|---------|----------|------|------|
| **Pub/Sub** | Notifications, fan-out | Loose coupling, scalable | Eventual consistency |
| **Message Queue** | Task processing, reliable delivery | Guaranteed delivery, backpressure | Order complexity |
| **Event Streaming** | Real-time analytics, audit log | Replay, time-travel | Storage cost, complexity |

### API Gateway Patterns

```
                    ┌─────────────────────┐
                    │      Clients        │
                    │  (Web, Mobile, IoT) │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │     API Gateway     │
                    │  ┌───────────────┐  │
                    │  │ Rate Limiting │  │
                    │  │ Auth/AuthZ    │  │
                    │  │ Routing       │  │
                    │  │ Transformation│  │
                    │  │ Caching       │  │
                    │  │ Circuit Break │  │
                    │  └───────────────┘  │
                    └──────────┬──────────┘
          ┌───────────────────┼───────────────────┐
          │                   │                   │
┌─────────▼─────────┐ ┌───────▼───────┐ ┌─────────▼─────────┐
│   User Service    │ │ Order Service │ │  Catalog Service  │
└───────────────────┘ └───────────────┘ └───────────────────┘
```

**Gateway Technologies:**
- **Kong**: Open-source, plugin ecosystem
- **AWS API Gateway**: Serverless, AWS integration
- **Envoy**: Cloud-native, service mesh data plane
- **NGINX Plus**: High performance, advanced routing

### Service Mesh Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Control Plane                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐    │
│  │   Istiod     │ │   Pilot      │ │    Citadel       │    │
│  │ (Config)     │ │ (Discovery)  │ │ (Security/mTLS)  │    │
│  └──────────────┘ └──────────────┘ └──────────────────┘    │
└─────────────────────────────┬───────────────────────────────┘
                              │ Configuration
┌─────────────────────────────▼───────────────────────────────┐
│                       Data Plane                            │
│  ┌─────────────────────┐      ┌─────────────────────┐      │
│  │  ┌───────┐ ┌─────┐  │      │  ┌───────┐ ┌─────┐  │      │
│  │  │Service│ │Envoy│◄─┼──────┼─►│ Envoy │ │Service  │      │
│  │  │   A   │ │Proxy│  │ mTLS │  │ Proxy │ │   B   │      │
│  │  └───────┘ └─────┘  │      │  └───────┘ └─────┘  │      │
│  │       Pod A         │      │       Pod B         │      │
│  └─────────────────────┘      └─────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

**Service Mesh Benefits:**
- **Observability**: Distributed tracing, metrics, logging
- **Security**: mTLS, policy enforcement
- **Reliability**: Retries, timeouts, circuit breaking
- **Traffic Management**: Canary deployments, A/B testing

**Leading Solutions (2025):**
- **Istio**: Full-featured, complex
- **Linkerd**: Lightweight, simple
- **Consul Connect**: HashiCorp ecosystem
- **Kuma**: Kong, multi-zone support

### Microservices Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| **Distributed Monolith** | Services tightly coupled, deploy together | Proper bounded contexts, async communication |
| **Chatty Services** | Too many inter-service calls | API composition, BFF pattern, caching |
| **Shared Database** | Services share tables, no autonomy | Database per service, eventual consistency |
| **Nano-services** | Too fine-grained, operational overhead | Right-size services, merge if coupled |
| **No API Versioning** | Breaking changes, cascading failures | Semantic versioning, deprecation policy |

---

## Microfrontend Architecture

### Composition Strategies

| Strategy | When | Pros | Cons |
|----------|------|------|------|
| **Build-time** | Low dynamism needed | Simple, optimized bundle | Deploy all together |
| **Server-side** | SEO important, fast initial load | SSR, consistent | Server complexity |
| **Runtime** | Independent deployments critical | True independence | Runtime overhead |
| **Edge-side** | Global distribution | CDN caching | Limited interactivity |

### Module Federation (Webpack 5 / Rspack)

Module Federation 2.0 enables sharing code between builds at runtime.

**Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                        Shell App (Host)                     │
│  - Bootstraps application                                   │
│  - Provides shared dependencies (React, design system)      │
│  - Handles routing between micro-frontends                  │
└───────────────────────┬─────────────────────────────────────┘
                        │ Runtime loading
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼───────┐ ┌─────▼─────┐ ┌───────▼───────┐
│   Product MFE │ │ Cart MFE  │ │  Checkout MFE │
│   (Remote)    │ │ (Remote)  │ │   (Remote)    │
│               │ │           │ │               │
│ Team: Catalog │ │Team: Cart │ │ Team: Payment │
│ Deploy: Daily │ │Deploy: CI │ │ Deploy: Weekly│
└───────────────┘ └───────────┘ └───────────────┘
```

**Configuration Example:**

```javascript
// Host (Shell) webpack.config.js
const { ModuleFederationPlugin } = require('webpack').container;

module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: 'shell',
      remotes: {
        productMfe: 'productMfe@https://product.example.com/remoteEntry.js',
        cartMfe: 'cartMfe@https://cart.example.com/remoteEntry.js',
        checkoutMfe: 'checkoutMfe@https://checkout.example.com/remoteEntry.js',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
        '@company/design-system': { singleton: true },
      },
    }),
  ],
};

// Remote (Product MFE) webpack.config.js
module.exports = {
  plugins: [
    new ModuleFederationPlugin({
      name: 'productMfe',
      filename: 'remoteEntry.js',
      exposes: {
        './ProductList': './src/components/ProductList',
        './ProductDetail': './src/components/ProductDetail',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^18.0.0' },
        'react-dom': { singleton: true, requiredVersion: '^18.0.0' },
      },
    }),
  ],
};
```

### Communication Between Micro-Frontends

| Method | Use Case | Coupling |
|--------|----------|----------|
| **Props** | Parent-child, build-time | Tight |
| **Custom Events** | Cross-MFE, loose coupling | Loose |
| **Shared State** | Global state (auth, cart) | Medium |
| **URL/Query Params** | Navigation, deep linking | Loose |
| **Pub/Sub** | Decoupled communication | Loose |

### Styling Isolation

| Approach | Isolation | Complexity |
|----------|-----------|------------|
| **CSS Modules** | File-level | Low |
| **CSS-in-JS** | Component-level | Medium |
| **Shadow DOM** | Full encapsulation | High |
| **BEM + Namespace** | Convention-based | Low |
| **Tailwind + Prefix** | Utility-based | Low |

### Micro-Frontend Best Practices

1. **Share only what's necessary**: Design system, auth, analytics
2. **Version shared dependencies**: Avoid conflicts
3. **Define clear contracts**: APIs between MFEs
4. **Independent deployments**: Each MFE deploys independently
5. **Fallback strategies**: Handle remote loading failures
6. **Performance budgets**: Monitor bundle sizes per MFE

---

