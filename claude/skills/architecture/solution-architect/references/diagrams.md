# Architecture — Diagrams (Mermaid · C4 · UML)

> Diagram standards & selection for /arch. Read when producing architecture diagrams.

## Mermaid Diagrams (MANDATORY)

**CRITICAL**: All architecture explanations and design documentation MUST include Mermaid diagrams in markdown files. Diagrams-as-code ensures version control, easy updates, and consistent rendering across tools.

### When to Use Mermaid Diagrams

| Situation | Required Diagram Type |
|-----------|----------------------|
| Explaining system architecture | C4 Context/Container (flowchart or C4) |
| Describing data flow | Flowchart or Sequence diagram |
| Documenting API interactions | Sequence diagram |
| Showing entity relationships | ER diagram or Class diagram |
| Explaining state transitions | State diagram |
| Documenting deployment | Flowchart with subgraphs |
| Describing event flows | Sequence or Flowchart |
| Showing component dependencies | Flowchart or Class diagram |
| Timeline/Gantt planning | Gantt diagram |
| User journeys | Journey diagram |

### Mermaid Diagram Types Reference

#### 1. Flowchart (Most Versatile)
Use for: System architecture, data flows, decision trees, processes

```mermaid
flowchart TB
    subgraph "Frontend"
        A[React App] --> B[API Gateway]
    end
    subgraph "Backend Services"
        B --> C[User Service]
        B --> D[Order Service]
        B --> E[Payment Service]
    end
    subgraph "Data Layer"
        C --> F[(PostgreSQL)]
        D --> G[(MongoDB)]
        E --> H[(Redis)]
    end
```

#### 2. Sequence Diagram
Use for: API interactions, service communication, user flows

```mermaid
sequenceDiagram
    participant U as User
    participant A as API Gateway
    participant O as Order Service
    participant P as Payment Service
    participant K as Kafka

    U->>A: POST /orders
    A->>O: createOrder()
    O->>P: processPayment()
    P-->>O: PaymentResult
    O->>K: publish(OrderCreated)
    O-->>A: Order
    A-->>U: 201 Created
```

#### 3. Class Diagram
Use for: Domain models, data structures, entity relationships

```mermaid
classDiagram
    class Order {
        +UUID id
        +OrderStatus status
        +Money total
        +submit()
        +cancel()
    }
    class OrderItem {
        +UUID productId
        +int quantity
        +Money price
    }
    class Payment {
        +UUID orderId
        +PaymentStatus status
        +process()
    }
    Order "1" *-- "many" OrderItem
    Order "1" -- "1" Payment
```

#### 4. State Diagram
Use for: Entity lifecycles, workflow states, state machines

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Submitted: submit()
    Submitted --> Paid: payment_success
    Submitted --> Cancelled: cancel()
    Paid --> Shipped: ship()
    Shipped --> Delivered: confirm_delivery()
    Delivered --> [*]
    Cancelled --> [*]
```

#### 5. ER Diagram
Use for: Database schema, entity relationships

```mermaid
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ ORDER_ITEM : contains
    PRODUCT ||--o{ ORDER_ITEM : "ordered in"
    ORDER ||--o| PAYMENT : has

    USER {
        uuid id PK
        string email UK
        string name
    }
    ORDER {
        uuid id PK
        uuid user_id FK
        enum status
        timestamp created_at
    }
```

#### 6. C4 Diagrams (with C4 extension)
Use for: Architecture documentation at different zoom levels

```mermaid
C4Context
    title System Context - E-Commerce Platform

    Person(customer, "Customer", "Shops online")
    System(ecommerce, "E-Commerce Platform", "Main system")
    System_Ext(payment, "Stripe", "Payment processing")
    System_Ext(shipping, "ShipStation", "Shipping")

    Rel(customer, ecommerce, "Uses", "HTTPS")
    Rel(ecommerce, payment, "Processes payments")
    Rel(ecommerce, shipping, "Ships orders")
```

#### 7. Gantt Diagram
Use for: Project timelines, migration plans, release schedules

```mermaid
gantt
    title Migration Plan
    dateFormat YYYY-MM-DD
    section Phase 1
        API Gateway Setup    :a1, 2025-01-01, 14d
        Auth Service         :a2, after a1, 21d
    section Phase 2
        User Service         :b1, after a2, 14d
        Order Service        :b2, after a2, 21d
    section Phase 3
        Decommission Legacy  :c1, after b2, 7d
```

#### 8. Journey Diagram
Use for: User experience flows, customer journeys

```mermaid
journey
    title User Checkout Journey
    section Browse
        View products: 5: Customer
        Add to cart: 4: Customer
    section Checkout
        Enter shipping: 3: Customer
        Enter payment: 2: Customer
        Confirm order: 4: Customer
    section Post-Purchase
        Receive confirmation: 5: Customer
        Track shipment: 4: Customer
```

### Mermaid Best Practices

1. **Always include in documentation**: Every ADR, design doc, and architecture explanation must have at least one Mermaid diagram
2. **Use subgraphs for grouping**: Organize related components visually
3. **Add labels to relationships**: Describe what flows between components
4. **Keep diagrams focused**: One concept per diagram, split if too complex
5. **Use consistent styling**: Same colors/shapes for same component types
6. **Version with code**: Diagrams in markdown are version-controlled

### Diagram Selection Quick Reference

```
Need to show...                    → Use this diagram
─────────────────────────────────────────────────────
System overview                    → Flowchart with subgraphs
API call sequence                  → Sequence diagram
Database schema                    → ER diagram
Domain model                       → Class diagram
Entity lifecycle                   → State diagram
Project timeline                   → Gantt diagram
User flow                          → Journey or Sequence
Component dependencies             → Flowchart
Event-driven flow                  → Sequence diagram
Deployment topology                → Flowchart with subgraphs
Decision tree                      → Flowchart
```

---


## C4 Model Deep Dive

The C4 model provides a hierarchical approach to visualizing software architecture at different zoom levels. Created by Simon Brown.

### C4 Levels Overview

| Level | Name | Audience | Scope | Detail |
|-------|------|----------|-------|--------|
| 1 | System Context | Everyone | System + external entities | Very high |
| 2 | Container | Technical stakeholders | Applications, databases | High |
| 3 | Component | Developers | Internal structure | Medium |
| 4 | Code | Developers | Classes, interfaces | Low |

**Best Practice**: Most teams only need Levels 1 and 2. Use Level 3 for complex components. Level 4 is rarely needed (use IDE).

### Level 1: System Context Diagram

Shows your system as a black box, its users, and external systems.

```mermaid
C4Context
    title System Context Diagram - E-Commerce Platform

    Person(customer, "Customer", "Shops for products online")
    Person(admin, "Admin", "Manages products and orders")

    System(ecommerce, "E-Commerce Platform", "Allows customers to browse and purchase products")

    System_Ext(payment, "Payment Gateway", "Processes credit card payments")
    System_Ext(shipping, "Shipping Provider", "Handles order fulfillment")
    System_Ext(email, "Email Service", "Sends transactional emails")

    Rel(customer, ecommerce, "Browses, purchases")
    Rel(admin, ecommerce, "Manages")
    Rel(ecommerce, payment, "Processes payments via")
    Rel(ecommerce, shipping, "Ships orders via")
    Rel(ecommerce, email, "Sends emails via")
```

### Level 2: Container Diagram

Zooms into the system to show deployable units (applications, databases, message queues).

```mermaid
C4Container
    title Container Diagram - E-Commerce Platform

    Person(customer, "Customer", "")

    Container_Boundary(ecommerce, "E-Commerce Platform") {
        Container(spa, "Web Application", "React, TypeScript", "Single-page application")
        Container(mobile, "Mobile App", "React Native", "iOS and Android app")
        Container(api, "API Gateway", "Kong/NGINX", "Routes and rate-limits requests")
        Container(catalog, "Catalog Service", "Java, Spring Boot", "Product catalog and search")
        Container(orders, "Order Service", "Java, Spring Boot", "Order processing")
        Container(users, "User Service", "Java, Spring Boot", "Authentication and profiles")
        ContainerDb(postgres, "PostgreSQL", "PostgreSQL 16", "User and order data")
        ContainerDb(elastic, "Elasticsearch", "Elasticsearch 8", "Product search index")
        ContainerQueue(kafka, "Kafka", "Apache Kafka", "Event streaming")
        ContainerDb(redis, "Redis", "Redis 7", "Session cache")
    }

    System_Ext(payment, "Payment Gateway", "")

    Rel(customer, spa, "Uses", "HTTPS")
    Rel(customer, mobile, "Uses", "HTTPS")
    Rel(spa, api, "Calls", "HTTPS/JSON")
    Rel(api, catalog, "Routes to", "gRPC")
    Rel(api, orders, "Routes to", "gRPC")
    Rel(api, users, "Routes to", "gRPC")
    Rel(orders, kafka, "Publishes events", "Kafka Protocol")
    Rel(orders, payment, "Processes payment", "HTTPS")
    Rel(catalog, elastic, "Searches", "HTTPS")
    Rel(users, postgres, "Reads/Writes", "TCP")
    Rel(orders, postgres, "Reads/Writes", "TCP")
```

### Level 3: Component Diagram

Zooms into a single container to show its internal components.

```mermaid
C4Component
    title Component Diagram - Order Service

    Container_Boundary(orders, "Order Service") {
        Component(controller, "Order Controller", "Spring MVC", "REST API endpoints")
        Component(service, "Order Service", "Spring Service", "Business logic")
        Component(saga, "Order Saga", "Spring State Machine", "Orchestrates order workflow")
        Component(repo, "Order Repository", "Spring Data JPA", "Data access layer")
        Component(publisher, "Event Publisher", "Kafka Producer", "Publishes domain events")
        Component(validator, "Order Validator", "Java Bean Validation", "Validates order data")
    }

    ContainerDb(postgres, "PostgreSQL", "", "")
    ContainerQueue(kafka, "Kafka", "", "")
    System_Ext(payment, "Payment Gateway", "")

    Rel(controller, service, "Uses")
    Rel(service, saga, "Triggers")
    Rel(service, validator, "Validates with")
    Rel(service, repo, "Persists via")
    Rel(saga, publisher, "Publishes events")
    Rel(repo, postgres, "Reads/Writes")
    Rel(publisher, kafka, "Sends to")
    Rel(saga, payment, "Calls")
```

### Supplementary Diagrams

Beyond the four levels, C4 supports:

| Diagram | Purpose | When to Use |
|---------|---------|-------------|
| **System Landscape** | All systems in enterprise | Enterprise architecture |
| **Dynamic Diagram** | Runtime behavior for a scenario | Complex interactions |
| **Deployment Diagram** | Infrastructure and deployment | DevOps, capacity planning |

### C4 Best Practices

1. **Include descriptions**: Every element needs name, type, technology, and description
2. **Add a key/legend**: Explain colors, shapes, line styles
3. **Keep diagrams focused**: One responsibility per diagram
4. **Update regularly**: Diagrams should match reality
5. **Use tools**: Structurizr DSL, PlantUML, Mermaid for "diagrams as code"

---

## UML Diagrams

UML (Unified Modeling Language) remains valuable for detailed design documentation.

### Structural Diagrams

#### Class Diagram

Shows classes, attributes, methods, and relationships.

```mermaid
classDiagram
    class Order {
        -id: UUID
        -customerId: UUID
        -status: OrderStatus
        -items: List~OrderItem~
        -totalAmount: Money
        +addItem(item: OrderItem)
        +removeItem(itemId: UUID)
        +submit(): void
        +cancel(): void
    }

    class OrderItem {
        -id: UUID
        -productId: UUID
        -quantity: int
        -unitPrice: Money
        +subtotal(): Money
    }

    class OrderStatus {
        <<enumeration>>
        DRAFT
        SUBMITTED
        PAID
        SHIPPED
        DELIVERED
        CANCELLED
    }

    class Money {
        -amount: BigDecimal
        -currency: Currency
        +add(other: Money): Money
        +multiply(factor: int): Money
    }

    Order "1" *-- "many" OrderItem : contains
    Order --> OrderStatus : has
    OrderItem --> Money : unitPrice
    Order --> Money : totalAmount
```

#### Component Diagram

Shows components and their interfaces.

```mermaid
graph TB
    subgraph "Order Module"
        OC[Order Controller]
        OS[Order Service]
        OR[Order Repository]
    end

    subgraph "Payment Module"
        PS[Payment Service]
        PG[Payment Gateway Client]
    end

    subgraph "Notification Module"
        NS[Notification Service]
        ES[Email Sender]
    end

    OC --> OS
    OS --> OR
    OS --> PS
    OS --> NS
    PS --> PG
    NS --> ES
```

### Behavioral Diagrams

#### Sequence Diagram

Shows object interactions over time.

```mermaid
sequenceDiagram
    participant C as Customer
    participant API as API Gateway
    participant OS as Order Service
    participant PS as Payment Service
    participant K as Kafka
    participant NS as Notification Service

    C->>API: POST /orders
    API->>OS: createOrder(orderData)
    OS->>OS: validateOrder()
    OS->>OS: calculateTotal()
    OS-->>API: Order Created (PENDING)
    API-->>C: 201 Created

    C->>API: POST /orders/{id}/pay
    API->>OS: submitPayment(orderId, paymentDetails)
    OS->>PS: processPayment(amount, card)
    PS-->>OS: PaymentResult (SUCCESS)
    OS->>K: publish(OrderPaidEvent)
    OS-->>API: Payment Successful
    API-->>C: 200 OK

    K->>NS: consume(OrderPaidEvent)
    NS->>NS: sendConfirmationEmail()
```

#### State Machine Diagram

Shows states and transitions.

```mermaid
stateDiagram-v2
    [*] --> Draft

    Draft --> Submitted : submit()
    Draft --> Cancelled : cancel()

    Submitted --> PaymentPending : initiatePayment()
    Submitted --> Cancelled : cancel()

    PaymentPending --> Paid : paymentSuccess()
    PaymentPending --> PaymentFailed : paymentFailed()

    PaymentFailed --> PaymentPending : retryPayment()
    PaymentFailed --> Cancelled : cancel()

    Paid --> Shipped : ship()

    Shipped --> Delivered : confirmDelivery()
    Shipped --> Returned : initiateReturn()

    Delivered --> [*]
    Cancelled --> [*]
    Returned --> Refunded : processRefund()
    Refunded --> [*]
```

#### Activity Diagram

Shows workflow and parallel activities.

```mermaid
flowchart TD
    Start([Start]) --> Receive[Receive Order]
    Receive --> Validate{Valid?}

    Validate -->|No| Reject[Reject Order]
    Reject --> End1([End])

    Validate -->|Yes| Fork((Fork))

    Fork --> CheckInventory[Check Inventory]
    Fork --> CalculateShipping[Calculate Shipping]
    Fork --> ApplyDiscounts[Apply Discounts]

    CheckInventory --> Join((Join))
    CalculateShipping --> Join
    ApplyDiscounts --> Join

    Join --> Reserve{Inventory Available?}
    Reserve -->|No| Backorder[Add to Backorder]
    Reserve -->|Yes| CreateOrder[Create Order]

    Backorder --> Notify[Notify Customer]
    CreateOrder --> Notify

    Notify --> End2([End])
```

### UML Diagram Selection Guide

| Diagram | When to Use |
|---------|-------------|
| **Class** | Domain modeling, API contracts, data structures |
| **Sequence** | Complex interactions, API flows, debugging |
| **State Machine** | Entity lifecycles, workflow states |
| **Activity** | Business processes, parallel workflows |
| **Component** | Module dependencies, system structure |
| **Deployment** | Infrastructure, physical architecture |
| **Use Case** | Requirements gathering, stakeholder communication |

---

