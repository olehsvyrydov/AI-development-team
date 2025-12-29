# Enhancement Proposal for ai-dev-team

## Overview

Based on integration with the zengrab-suite-java project, here are recommended enhancements to make ai-dev-team more comprehensive for enterprise Java microservices development.

---

## 1. Add Spring Kafka Integration to Backend Developer

**Location:** `/skills/development/backend-developer.md`

**Why:** Kafka is essential for event-driven microservices. Currently missing from backend-developer.

**Add to Expertise section:**

```markdown
### Event-Driven Architecture

#### Spring Kafka 3.x
- KafkaTemplate for publishing events
- @KafkaListener for consuming
- Dead Letter Topics (DLT) for error handling
- Retry with exponential backoff
- Transactional outbox pattern
- Idempotent producers

#### Reactor Kafka (Reactive)
- ReactiveKafkaProducerTemplate
- ReactiveKafkaConsumerTemplate
- Backpressure with limitRate()
- Hot streams with publish().autoConnect()

#### Event Patterns
- Event sourcing basics
- CQRS (Command Query Responsibility Segregation)
- Saga pattern for distributed transactions
- Exactly-once semantics
```

**Add Template section:**

```java
// Kafka Producer Template
@Component
@RequiredArgsConstructor
@Slf4j
public class EventPublisher {
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public CompletableFuture<SendResult<String, Object>> publish(
            String topic, String key, Object event) {
        return kafkaTemplate.send(topic, key, event)
            .whenComplete((result, ex) -> {
                if (ex == null) {
                    log.info("Published to {} partition {}",
                        topic, result.getRecordMetadata().partition());
                } else {
                    log.error("Failed to publish to {}", topic, ex);
                }
            });
    }
}

// Kafka Consumer Template
@Component
@RequiredArgsConstructor
@Slf4j
public class EventConsumer {

    @KafkaListener(topics = "${app.kafka.topics.events}")
    public void handle(
            @Payload Event event,
            @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
            Acknowledgment ack) {
        try {
            processEvent(event);
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Processing failed", e);
            throw e; // Triggers retry/DLT
        }
    }
}

// Error Handling Configuration
@Bean
public DefaultErrorHandler errorHandler(KafkaTemplate<String, Object> template) {
    var recoverer = new DeadLetterPublishingRecoverer(template);
    var backOff = new ExponentialBackOffWithMaxRetries(3);
    backOff.setInitialInterval(1000L);
    backOff.setMultiplier(2.0);
    return new DefaultErrorHandler(recoverer, backOff);
}
```

---

## 2. Add Maven Support (Alternative to Gradle)

**Location:** `/skills/development/backend-developer.md`

**Why:** Many enterprise projects use Maven. Currently only Gradle is mentioned.

**Add to Expertise section:**

```markdown
### Build Tools

#### Maven 3.9+
- Multi-module projects with parent POM
- BOM (Bill of Materials) for version management
- Profiles for environment-specific builds
- Maven wrapper (mvnw)
- Plugin management

#### Gradle 8.x (Existing)
- Kotlin DSL
- Build caching
- Composite builds
```

**Add Template:**

```xml
<!-- Parent POM Template -->
<project>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.5.0</version>
    </parent>

    <groupId>com.company</groupId>
    <artifactId>service-parent</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <packaging>pom</packaging>

    <properties>
        <java.version>21</java.version>
        <mapstruct.version>1.6.0</mapstruct.version>
    </properties>

    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>com.company</groupId>
                <artifactId>service-bom</artifactId>
                <version>${project.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>
</project>
```

---

## 3. Add SOAP/Web Services Integration

**Location:** `/skills/development/backend-developer.md` or new skill

**Why:** Enterprise integration often requires SOAP for legacy systems (e.g., PMIS).

**Add section:**

```markdown
### Legacy Integration

#### SOAP Web Services
- Spring Web Services (spring-ws)
- JAXB for XML binding
- WSDL-first development
- Custom interceptors for logging
- SOAP fault handling

#### Integration Patterns
- Adapter pattern for multiple vendor systems
- Factory pattern for dynamic client selection
- Circuit breaker for resilience
- WireMock for testing SOAP endpoints
```

**Add Template:**

```java
// SOAP Client Template
@Component
@RequiredArgsConstructor
public class SoapClientAdapter extends WebServiceGatewaySupport {

    public SubmitResponse submitTicket(SubmitRequest request) {
        return (SubmitResponse) getWebServiceTemplate()
            .marshalSendAndReceive(
                getDefaultUri(),
                request,
                new SoapActionCallback("http://example.com/submitTicket")
            );
    }
}

// SOAP Configuration
@Configuration
public class SoapConfig {
    @Bean
    public Jaxb2Marshaller marshaller() {
        var marshaller = new Jaxb2Marshaller();
        marshaller.setContextPath("com.company.generated.soap");
        return marshaller;
    }
}
```

---

## 4. Create New Skill: Kafka Integration Specialist

**Location:** `/skills/development/kafka-integration.md` (NEW FILE)

**Content:**

```markdown
# Kafka Integration Specialist

## Trigger
- Implementing event-driven architecture
- Setting up Kafka producers/consumers
- Configuring dead letter topics
- Implementing transactional outbox
- Reactive Kafka streaming

## Context
You are a Kafka Integration Specialist with deep expertise in Apache Kafka and Spring Kafka. You design and implement reliable, scalable event-driven systems.

## Expertise

### Core Technologies
- Apache Kafka 3.6+
- Spring Kafka 3.x
- Reactor Kafka 1.3.x
- Confluent Schema Registry

### Patterns
- Event sourcing
- CQRS
- Saga pattern
- Transactional outbox
- Dead Letter Topics (DLT)
- Exactly-once semantics

### Testing
- EmbeddedKafka
- Testcontainers with KafkaContainer
- Consumer/Producer mocking

## Standards
- Always use idempotent producers
- Configure proper retry with backoff
- Implement DLT for all consumers
- Use schema registry for complex events
- Document event contracts

## Anti-Patterns to Avoid
- ❌ Fire-and-forget without error handling
- ❌ Unbounded retry without DLT
- ❌ Missing consumer group coordination
- ❌ Synchronous processing in high-throughput consumers
```

---

## 5. Update DevOps Engineer for Generic Kubernetes

**Location:** `/skills/operations/devops-engineer.md`

**Current:** GCP-focused with Terraform

**Enhance with:**

```markdown
### Generic Kubernetes (Cloud-Agnostic)

#### Helm 3.x
- Chart development and templating
- Values override hierarchy
- Helm hooks for migrations
- Chart dependencies

#### Kustomize
- Base and overlay structure
- Patches and strategic merge
- ConfigMap/Secret generators

#### Multi-Cloud Support
- GKE Autopilot (GCP)
- EKS (AWS)
- AKS (Azure)
- Vanilla Kubernetes

#### Local Development
- Kind (Kubernetes in Docker)
- Minikube
- Docker Desktop Kubernetes
```

---

## 6. Add Architecture Decision Records (ADR) to Solution Architect

**Already exists** but could add more examples relevant to microservices:

```markdown
### Microservice ADR Examples

1. **ADR-001: Service Communication** - REST vs gRPC vs Kafka
2. **ADR-002: Database per Service** - Shared vs dedicated databases
3. **ADR-003: Event Schema Evolution** - Avro vs Protobuf vs JSON
4. **ADR-004: Secret Management** - Vault vs Sealed Secrets vs ESO
5. **ADR-005: API Gateway** - Kong vs Istio vs Spring Cloud Gateway
```

---

## Implementation Priority

| Enhancement | Priority | Effort | Impact |
|-------------|----------|--------|--------|
| Spring Kafka Integration | High | Medium | High |
| Maven Support | Medium | Low | Medium |
| SOAP Integration | Medium | Medium | Medium |
| Kafka Specialist Skill | High | High | High |
| Generic K8s in DevOps | Medium | Low | Medium |
| ADR Examples | Low | Low | Low |

---

## Files to Create/Modify

1. **Modify:** `/skills/development/backend-developer.md` - Add Kafka, Maven, SOAP sections
2. **Create:** `/skills/development/kafka-integration.md` - New specialized skill
3. **Modify:** `/skills/operations/devops-engineer.md` - Add generic K8s patterns
4. **Modify:** `/skills/architecture/solution-architect.md` - Add microservice ADR examples

---

## Notes

These enhancements are based on real-world requirements from the zengrab-suite-java project which includes:
- Multi-tenant microservices architecture
- Event-driven communication with Kafka
- SOAP integration with legacy PMIS systems
- Kubernetes deployment with Helm
- Maven multi-module builds with BOM
