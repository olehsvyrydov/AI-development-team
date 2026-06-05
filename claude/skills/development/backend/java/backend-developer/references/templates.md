# Backend — Templates (service · controller · entity · test)

## Templates

### Controller Template

```java
@RestController
@RequestMapping("/api/v1/resources")
@RequiredArgsConstructor
@Validated
public class ResourceController {

    private final ResourceService resourceService;

    @GetMapping
    public Flux<ResourceResponse> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return resourceService.findAll(page, size)
                .map(ResourceResponse::from);
    }

    @GetMapping("/{id}")
    public Mono<ResourceResponse> get(@PathVariable UUID id) {
        return resourceService.findById(id)
                .map(ResourceResponse::from)
                .switchIfEmpty(Mono.error(new ResourceNotFoundException(id)));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<ResourceResponse> create(
            @Valid @RequestBody CreateResourceRequest request) {
        return resourceService.create(request)
                .map(ResourceResponse::from);
    }
}
```

### Hexagonal Architecture Template

```
src/main/java/com/example/
├── domain/                    # Core business logic (NO framework imports)
│   ├── model/                 # Entities, Value Objects, Aggregates
│   │   └── Order.java
│   ├── port/                  # Interfaces (driven + driving)
│   │   ├── in/               # Use cases (driving/primary)
│   │   │   └── CreateOrderUseCase.java
│   │   └── out/              # Repositories, external services (driven/secondary)
│   │       └── OrderRepository.java
│   └── service/              # Domain services implementing use cases
│       └── OrderService.java
│
├── adapter/                   # Framework-dependent implementations
│   ├── in/                   # Driving adapters
│   │   ├── web/              # REST controllers
│   │   │   └── OrderController.java
│   │   └── messaging/        # Kafka consumers
│   │       └── OrderEventConsumer.java
│   └── out/                  # Driven adapters
│       ├── persistence/      # JPA/R2DBC repositories
│       │   └── OrderJpaRepository.java
│       └── client/           # External API clients
│           └── PaymentClient.java
│
└── config/                    # Spring configuration
    └── BeanConfig.java
```

### Saga Orchestrator Template

```java
@Component
@RequiredArgsConstructor
@Slf4j
public class OrderSagaOrchestrator {

    private final PaymentService paymentService;
    private final InventoryService inventoryService;
    private final ShippingService shippingService;

    @Transactional
    public Mono<OrderResult> executeOrderSaga(Order order) {
        return paymentService.charge(order.payment())
            .flatMap(payment -> inventoryService.reserve(order.items())
                .onErrorResume(e -> paymentService.refund(payment)
                    .then(Mono.error(new SagaException("Inventory failed", e)))))
            .flatMap(inventory -> shippingService.schedule(order.shipping())
                .onErrorResume(e -> inventoryService.release(inventory)
                    .then(paymentService.refund(inventory.paymentRef()))
                    .then(Mono.error(new SagaException("Shipping failed", e)))))
            .map(shipping -> OrderResult.completed(order.id(), shipping.trackingId()));
    }
}
```

### Test Template

```java
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@Testcontainers
class OrderServiceIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private WebTestClient webTestClient;

    @Test
    @DisplayName("should create order and return 201 with location header")
    void should_createOrder_when_validRequest() {
        var request = new CreateOrderRequest("item-1", 2, BigDecimal.valueOf(29.99));

        webTestClient.post().uri("/api/v1/orders")
            .contentType(MediaType.APPLICATION_JSON)
            .bodyValue(request)
            .exchange()
            .expectStatus().isCreated()
            .expectHeader().exists("Location")
            .expectBody()
            .jsonPath("$.id").isNotEmpty()
            .jsonPath("$.status").isEqualTo("CREATED");
    }
}
```

---

