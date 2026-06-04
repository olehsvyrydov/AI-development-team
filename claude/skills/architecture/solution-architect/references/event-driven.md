# Architecture — Event-Driven (Saga, CQRS, Event Sourcing, Kafka)

## Event-Driven Architecture Deep Dive

### Saga Pattern

Manages distributed transactions across microservices.

#### Choreography (Event-driven)

```
┌─────────────┐    OrderCreated     ┌─────────────┐
│   Order     │────────────────────►│  Inventory  │
│   Service   │                     │   Service   │
└─────────────┘                     └──────┬──────┘
       ▲                                   │
       │                          InventoryReserved
       │                                   │
       │                            ┌──────▼──────┐
       │                            │   Payment   │
       │                            │   Service   │
       │                            └──────┬──────┘
       │                                   │
       │                          PaymentProcessed
       │                                   │
       │                            ┌──────▼──────┐
       │◄───────OrderCompleted──────│  Shipping   │
       │                            │   Service   │
       │                            └─────────────┘

Compensation (on failure):
PaymentFailed ──► InventoryService: ReleaseInventory
                  OrderService: CancelOrder
```

#### Orchestration (Central coordinator)

```
┌─────────────────────────────────────────────────────────────┐
│                    Order Saga Orchestrator                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  State Machine                                      │   │
│  │  PENDING → INVENTORY_RESERVED → PAYMENT_PROCESSED   │   │
│  │          → SHIPPED → COMPLETED                      │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   Inventory     │ │    Payment      │ │    Shipping     │
│   Service       │ │    Service      │ │    Service      │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

| Approach | Pros | Cons | Best For |
|----------|------|------|----------|
| **Choreography** | Loose coupling, simple services | Hard to track, cyclic deps | Simple sagas, few steps |
| **Orchestration** | Centralized logic, easier debugging | Single point of failure | Complex sagas, many steps |

### CQRS Implementation

```
┌─────────────────────────────────────────────────────────────┐
│                      CQRS Architecture                      │
│                                                             │
│  Commands (Write)              Queries (Read)               │
│  ┌─────────────┐              ┌─────────────┐              │
│  │ Command API │              │  Query API  │              │
│  └──────┬──────┘              └──────┬──────┘              │
│         │                            │                      │
│  ┌──────▼──────┐              ┌──────▼──────┐              │
│  │  Command    │              │   Query     │              │
│  │  Handlers   │              │  Handlers   │              │
│  └──────┬──────┘              └──────┬──────┘              │
│         │                            │                      │
│  ┌──────▼──────┐   Events    ┌──────▼──────┐              │
│  │   Write     │─────────────►│   Read      │              │
│  │   Model     │  (Async)    │   Model     │              │
│  │ (Normalized)│             │(Denormalized)│              │
│  └─────────────┘             └─────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

**When to Use CQRS:**
- Read and write patterns differ significantly
- Need to scale reads independently from writes
- Complex domain with multiple read models
- Event sourcing is used

**When NOT to Use:**
- Simple CRUD applications
- Team unfamiliar with pattern
- Single database sufficient

### Event Sourcing

Store events as the source of truth, derive state by replaying.

```
Traditional (State Storage):
┌────────────────────────────────────────┐
│  Order #123                            │
│  Status: SHIPPED                       │
│  Total: $150                           │
│  Items: [{productId: 1, qty: 2}]       │
└────────────────────────────────────────┘

Event Sourcing:
┌────────────────────────────────────────┐
│  Event Stream: Order-123               │
│  ┌────────────────────────────────┐   │
│  │ 1. OrderCreated {items: [...]} │   │
│  │ 2. ItemAdded {productId: 2}    │   │
│  │ 3. ItemRemoved {productId: 2}  │   │
│  │ 4. PaymentReceived {amount}    │   │
│  │ 5. OrderShipped {trackingId}   │   │
│  └────────────────────────────────┘   │
│                                        │
│  Current State = fold(events)          │
└────────────────────────────────────────┘
```

**Benefits:**
- Complete audit trail
- Time-travel debugging
- Replay for new projections
- No update anomalies

**Challenges:**
- Event schema evolution
- Eventual consistency
- Snapshot for performance
- Increased complexity

### Transactional Outbox Pattern

Ensures reliable event publishing with database transactions.

```
┌─────────────────────────────────────────────────────────────┐
│                     Order Service                           │
│                                                             │
│  ┌─────────────┐                                           │
│  │ Transaction │                                           │
│  │ BEGIN       │                                           │
│  │   INSERT INTO orders (...)                              │
│  │   INSERT INTO outbox (aggregate_id, event_type, payload)│
│  │ COMMIT      │                                           │
│  └─────────────┘                                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Outbox Processor (CDC or Polling)                  │   │
│  │  - Read unpublished events from outbox table        │   │
│  │  - Publish to Kafka                                 │   │
│  │  - Mark as published (or delete)                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Implementation Options:**
- **Polling**: Simple, but adds latency
- **CDC (Debezium)**: Real-time, no polling overhead

### Exactly-Once Semantics

| Level | Guarantee | Implementation |
|-------|-----------|----------------|
| **At-most-once** | May lose messages | Fire and forget |
| **At-least-once** | May duplicate | Acks + retries |
| **Exactly-once** | No loss, no duplicates | Idempotency + transactions |

**Achieving Exactly-Once:**
1. **Idempotent consumers**: Use idempotency keys, deduplication
2. **Transactional producers**: Kafka transactions
3. **Idempotent writes**: Upserts, conditional updates

### Kafka Patterns

```java
// Idempotent Producer
Properties props = new Properties();
props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
props.put(ProducerConfig.ACKS_CONFIG, "all");
props.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);

// Transactional Producer
props.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, "order-service-1");

KafkaProducer<String, String> producer = new KafkaProducer<>(props);
producer.initTransactions();

try {
    producer.beginTransaction();
    producer.send(new ProducerRecord<>("orders", key, value));
    producer.send(new ProducerRecord<>("audit", key, auditValue));
    producer.commitTransaction();
} catch (Exception e) {
    producer.abortTransaction();
}
```

---

