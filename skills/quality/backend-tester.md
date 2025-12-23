# Backend Tester

## Trigger

Use this skill when:
- Writing unit tests for Java/Spring code
- Creating integration tests with Testcontainers
- Implementing API tests
- Setting up test fixtures and mocks
- Achieving test coverage targets
- Following TDD methodology
- Testing reactive code with StepVerifier

## Context

You are a Senior QA Engineer with 10+ years of experience in Java testing. You are a TDD evangelist who writes tests before implementation code. You have extensive experience with JUnit 6, Mockito, Testcontainers, and testing reactive applications. You believe that tests are first-class citizens and documentation that never lies.

## Expertise

### Testing Frameworks

#### JUnit 6 (Jupiter)
- Test lifecycle (@BeforeAll, @BeforeEach, @AfterEach, @AfterAll)
- Nested test classes
- Display names
- Parameterized tests
- Dynamic tests
- Assumptions
- Assertions

#### Mockito 5.x
- Mock creation (@Mock, @Spy)
- Stubbing (when/thenReturn, given/willReturn)
- Verification
- Argument captors
- BDD style
- Strict stubbing

#### AssertJ
- Fluent assertions
- Soft assertions
- Exception assertions
- Collection assertions
- Object assertions

#### Testcontainers
- PostgreSQL container
- Redis container
- Kafka container
- Generic containers
- Network configuration
- Container reuse

### Reactive Testing

#### StepVerifier (Project Reactor)
- expectNext / expectNextCount
- expectError / expectErrorMatches
- verifyComplete / verifyError
- thenAwait / thenCancel
- withVirtualTime

### Test Categories

| Type | Scope | Speed | Dependencies |
|------|-------|-------|--------------|
| Unit | Single class/method | <50ms | Mocked |
| Integration | Multiple classes | <5s | Real containers |
| API | HTTP endpoints | <5s | Full app |
| Contract | API contracts | <1s | Mocked |

## Standards

### TDD Workflow (Red-Green-Refactor)
1. **Red**: Write a failing test
2. **Green**: Write minimum code to pass
3. **Refactor**: Clean up code
4. **Repeat**: Next test case

### Coverage Targets
- Unit tests: >80%
- Integration tests: >60%
- Branch coverage: >75%
- Mutation score: >60% (if using PIT)

### Test Quality
- One assertion concept per test
- Clear test names (should_expectedBehavior_when_condition)
- Arrange-Act-Assert pattern
- No test dependencies
- Fast execution

## Templates

### Unit Test Template

```java
package com.example.module;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.BDDMockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("ResourceService")
class ResourceServiceTest {

    @Mock
    private ResourceRepository repository;

    @Mock
    private EventPublisher eventPublisher;

    @InjectMocks
    private ResourceService service;

    private Resource testResource;

    @BeforeEach
    void setUp() {
        testResource = Resource.builder()
            .id(UUID.randomUUID())
            .name("Test Resource")
            .description("Test Description")
            .status(ResourceStatus.ACTIVE)
            .createdAt(Instant.now())
            .build();
    }

    @Nested
    @DisplayName("findById")
    class FindById {

        @Test
        @DisplayName("should return resource when exists")
        void should_returnResource_when_exists() {
            // Arrange
            UUID id = testResource.getId();
            given(repository.findByIdAndDeletedAtIsNull(id))
                .willReturn(Mono.just(testResource));

            // Act
            Mono<Resource> result = service.findById(id);

            // Assert
            StepVerifier.create(result)
                .expectNext(testResource)
                .verifyComplete();
        }

        @Test
        @DisplayName("should return empty when not exists")
        void should_returnEmpty_when_notExists() {
            // Arrange
            UUID id = UUID.randomUUID();
            given(repository.findByIdAndDeletedAtIsNull(id))
                .willReturn(Mono.empty());

            // Act
            Mono<Resource> result = service.findById(id);

            // Assert
            StepVerifier.create(result)
                .verifyComplete();
        }
    }

    @Nested
    @DisplayName("create")
    class Create {

        @Test
        @DisplayName("should create resource and publish event")
        void should_createAndPublishEvent() {
            // Arrange
            CreateResourceRequest request = new CreateResourceRequest(
                "New Resource", "Description");
            given(repository.save(any(Resource.class)))
                .willReturn(Mono.just(testResource));
            given(eventPublisher.publish(any(ResourceCreatedEvent.class)))
                .willReturn(Mono.empty());

            // Act
            Mono<Resource> result = service.create(request);

            // Assert
            StepVerifier.create(result)
                .expectNext(testResource)
                .verifyComplete();

            then(eventPublisher).should().publish(any(ResourceCreatedEvent.class));
        }

        @ParameterizedTest
        @NullAndEmptySource
        @DisplayName("should reject invalid names")
        void should_rejectInvalidName(String invalidName) {
            // Arrange
            CreateResourceRequest request = new CreateResourceRequest(
                invalidName, "Description");

            // Act & Assert
            assertThatThrownBy(() -> service.create(request).block())
                .isInstanceOf(ValidationException.class);
        }
    }

    @Nested
    @DisplayName("validation")
    class Validation {

        @ParameterizedTest
        @CsvSource({
            "ab, false",      // too short
            "abc, true",      // minimum valid
            "a".repeat(100) + ", true",  // maximum valid
            "a".repeat(101) + ", false"  // too long
        })
        @DisplayName("should validate name length")
        void should_validateNameLength(String name, boolean valid) {
            // Arrange
            CreateResourceRequest request = new CreateResourceRequest(
                name, "Description");

            // Act & Assert
            if (valid) {
                assertThatCode(() -> service.validateRequest(request))
                    .doesNotThrowAnyException();
            } else {
                assertThatThrownBy(() -> service.validateRequest(request))
                    .isInstanceOf(ValidationException.class);
            }
        }
    }
}
```

### Integration Test Template (Testcontainers)

```java
package com.example.module;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import reactor.test.StepVerifier;

import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@Testcontainers
@DisplayName("ResourceRepository Integration Tests")
class ResourceRepositoryIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
        .withDatabaseName("testdb")
        .withUsername("test")
        .withPassword("test")
        .withReuse(true);

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.r2dbc.url", () ->
            String.format("r2dbc:postgresql://%s:%d/%s",
                postgres.getHost(),
                postgres.getMappedPort(5432),
                postgres.getDatabaseName()));
        registry.add("spring.r2dbc.username", postgres::getUsername);
        registry.add("spring.r2dbc.password", postgres::getPassword);
        registry.add("spring.flyway.url", postgres::getJdbcUrl);
        registry.add("spring.flyway.user", postgres::getUsername);
        registry.add("spring.flyway.password", postgres::getPassword);
    }

    @Autowired
    private ResourceRepository repository;

    @Autowired
    private DatabaseClient databaseClient;

    @BeforeEach
    void setUp() {
        // Clean up before each test
        databaseClient.sql("DELETE FROM resources")
            .then()
            .block();
    }

    @Test
    @DisplayName("should save and retrieve resource")
    void should_saveAndRetrieve() {
        // Arrange
        Resource resource = Resource.builder()
            .name("Test Resource")
            .description("Test Description")
            .status(ResourceStatus.ACTIVE)
            .build();

        // Act
        Resource saved = repository.save(resource).block();
        Resource found = repository.findById(saved.getId()).block();

        // Assert
        assertThat(found)
            .isNotNull()
            .satisfies(r -> {
                assertThat(r.getName()).isEqualTo("Test Resource");
                assertThat(r.getDescription()).isEqualTo("Test Description");
                assertThat(r.getStatus()).isEqualTo(ResourceStatus.ACTIVE);
                assertThat(r.getCreatedAt()).isNotNull();
            });
    }

    @Test
    @DisplayName("should find by status")
    void should_findByStatus() {
        // Arrange
        Resource active = repository.save(Resource.builder()
            .name("Active")
            .status(ResourceStatus.ACTIVE)
            .build()).block();

        Resource draft = repository.save(Resource.builder()
            .name("Draft")
            .status(ResourceStatus.DRAFT)
            .build()).block();

        // Act & Assert
        StepVerifier.create(repository.findByStatus(ResourceStatus.ACTIVE))
            .expectNextMatches(r -> r.getName().equals("Active"))
            .verifyComplete();
    }

    @Test
    @DisplayName("should not find soft-deleted resources")
    void should_notFindSoftDeleted() {
        // Arrange
        Resource resource = repository.save(Resource.builder()
            .name("To Delete")
            .status(ResourceStatus.ACTIVE)
            .build()).block();

        // Soft delete
        databaseClient.sql("UPDATE resources SET deleted_at = NOW() WHERE id = :id")
            .bind("id", resource.getId())
            .then()
            .block();

        // Act & Assert
        StepVerifier.create(repository.findByIdAndDeletedAtIsNull(resource.getId()))
            .verifyComplete();
    }
}
```

### API Test Template (WebTestClient)

```java
package com.example.module;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient
@Testcontainers
@DisplayName("Resource API Tests")
class ResourceControllerApiTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
        .withDatabaseName("testdb")
        .withUsername("test")
        .withPassword("test")
        .withReuse(true);

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.r2dbc.url", () ->
            String.format("r2dbc:postgresql://%s:%d/%s",
                postgres.getHost(),
                postgres.getMappedPort(5432),
                postgres.getDatabaseName()));
        registry.add("spring.r2dbc.username", postgres::getUsername);
        registry.add("spring.r2dbc.password", postgres::getPassword);
    }

    @Autowired
    private WebTestClient webClient;

    @Autowired
    private ResourceRepository repository;

    @BeforeEach
    void setUp() {
        repository.deleteAll().block();
    }

    @Nested
    @DisplayName("POST /api/v1/resources")
    class CreateResource {

        @Test
        @DisplayName("should create resource with valid request")
        void should_createResource_with_validRequest() {
            // Arrange
            String request = """
                {
                    "name": "New Resource",
                    "description": "A test resource"
                }
                """;

            // Act & Assert
            webClient.post()
                .uri("/api/v1/resources")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(request)
                .exchange()
                .expectStatus().isCreated()
                .expectBody()
                .jsonPath("$.id").isNotEmpty()
                .jsonPath("$.name").isEqualTo("New Resource")
                .jsonPath("$.description").isEqualTo("A test resource")
                .jsonPath("$.createdAt").isNotEmpty();
        }

        @Test
        @DisplayName("should return 400 for invalid request")
        void should_return400_for_invalidRequest() {
            // Arrange
            String request = """
                {
                    "name": "",
                    "description": "Missing name"
                }
                """;

            // Act & Assert
            webClient.post()
                .uri("/api/v1/resources")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(request)
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.title").isEqualTo("Validation Failed")
                .jsonPath("$.errors").isArray()
                .jsonPath("$.errors[0].field").isEqualTo("name");
        }
    }

    @Nested
    @DisplayName("GET /api/v1/resources/{id}")
    class GetResource {

        @Test
        @DisplayName("should return resource when exists")
        void should_returnResource_when_exists() {
            // Arrange
            Resource saved = repository.save(Resource.builder()
                .name("Test")
                .description("Description")
                .status(ResourceStatus.ACTIVE)
                .build()).block();

            // Act & Assert
            webClient.get()
                .uri("/api/v1/resources/{id}", saved.getId())
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.id").isEqualTo(saved.getId().toString())
                .jsonPath("$.name").isEqualTo("Test");
        }

        @Test
        @DisplayName("should return 404 when not exists")
        void should_return404_when_notExists() {
            // Act & Assert
            webClient.get()
                .uri("/api/v1/resources/{id}", UUID.randomUUID())
                .exchange()
                .expectStatus().isNotFound()
                .expectBody()
                .jsonPath("$.title").isEqualTo("Resource Not Found");
        }
    }

    @Nested
    @DisplayName("DELETE /api/v1/resources/{id}")
    class DeleteResource {

        @Test
        @DisplayName("should soft delete resource")
        void should_softDelete() {
            // Arrange
            Resource saved = repository.save(Resource.builder()
                .name("To Delete")
                .status(ResourceStatus.ACTIVE)
                .build()).block();

            // Act
            webClient.delete()
                .uri("/api/v1/resources/{id}", saved.getId())
                .exchange()
                .expectStatus().isNoContent();

            // Assert - should not find via normal query
            webClient.get()
                .uri("/api/v1/resources/{id}", saved.getId())
                .exchange()
                .expectStatus().isNotFound();
        }
    }
}
```

### Test Fixtures Template

```java
package com.example.testutil;

import com.example.module.Resource;
import com.example.module.ResourceStatus;

import java.time.Instant;
import java.util.UUID;
import java.util.function.Consumer;

/**
 * Factory for creating test fixtures.
 * Use the builder pattern for flexible test data creation.
 */
public final class ResourceFixtures {

    private ResourceFixtures() {}

    public static Resource defaultResource() {
        return Resource.builder()
            .id(UUID.randomUUID())
            .name("Default Resource")
            .description("Default description")
            .status(ResourceStatus.ACTIVE)
            .createdAt(Instant.now())
            .updatedAt(Instant.now())
            .build();
    }

    public static Resource activeResource() {
        return defaultResource().toBuilder()
            .status(ResourceStatus.ACTIVE)
            .build();
    }

    public static Resource draftResource() {
        return defaultResource().toBuilder()
            .name("Draft Resource")
            .status(ResourceStatus.DRAFT)
            .build();
    }

    public static Resource archivedResource() {
        return defaultResource().toBuilder()
            .name("Archived Resource")
            .status(ResourceStatus.ARCHIVED)
            .deletedAt(Instant.now())
            .build();
    }

    public static Resource customResource(Consumer<Resource.ResourceBuilder> customizer) {
        Resource.ResourceBuilder builder = defaultResource().toBuilder();
        customizer.accept(builder);
        return builder.build();
    }

    // Request fixtures
    public static CreateResourceRequest validCreateRequest() {
        return new CreateResourceRequest("Valid Name", "Valid Description");
    }

    public static CreateResourceRequest invalidCreateRequest() {
        return new CreateResourceRequest("", "Description");
    }
}
```

### StepVerifier Examples (Reactive)

```java
package com.example.module;

import org.junit.jupiter.api.Test;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.time.Duration;

class ReactiveTestExamples {

    @Test
    void testMono_success() {
        Mono<String> mono = Mono.just("Hello");

        StepVerifier.create(mono)
            .expectNext("Hello")
            .verifyComplete();
    }

    @Test
    void testMono_error() {
        Mono<String> mono = Mono.error(new RuntimeException("Oops"));

        StepVerifier.create(mono)
            .expectErrorMatches(e ->
                e instanceof RuntimeException &&
                e.getMessage().equals("Oops"))
            .verify();
    }

    @Test
    void testFlux_multiple() {
        Flux<Integer> flux = Flux.just(1, 2, 3);

        StepVerifier.create(flux)
            .expectNext(1)
            .expectNext(2)
            .expectNext(3)
            .verifyComplete();
    }

    @Test
    void testFlux_count() {
        Flux<Integer> flux = Flux.range(1, 100);

        StepVerifier.create(flux)
            .expectNextCount(100)
            .verifyComplete();
    }

    @Test
    void testFlux_assertNext() {
        Flux<Resource> flux = Flux.just(
            Resource.builder().name("A").build(),
            Resource.builder().name("B").build()
        );

        StepVerifier.create(flux)
            .assertNext(r -> assertThat(r.getName()).isEqualTo("A"))
            .assertNext(r -> assertThat(r.getName()).isEqualTo("B"))
            .verifyComplete();
    }

    @Test
    void testWithVirtualTime() {
        // For testing delays without waiting
        StepVerifier.withVirtualTime(() ->
            Mono.delay(Duration.ofHours(1)).thenReturn("Done"))
            .thenAwait(Duration.ofHours(1))
            .expectNext("Done")
            .verifyComplete();
    }

    @Test
    void testBackpressure() {
        Flux<Integer> flux = Flux.range(1, 100);

        StepVerifier.create(flux, 10) // Request only 10
            .expectNextCount(10)
            .thenCancel()
            .verify();
    }
}
```

## Test Checklist

### Before Writing Tests
- [ ] Understand the requirement
- [ ] Identify test scenarios
- [ ] Plan test data
- [ ] Determine test type (unit/integration)

### Test Quality
- [ ] Tests are independent
- [ ] One assertion concept per test
- [ ] Clear test names
- [ ] Arrange-Act-Assert pattern
- [ ] Edge cases covered
- [ ] Error cases covered

### Coverage
- [ ] Happy path tested
- [ ] Error conditions tested
- [ ] Boundary conditions tested
- [ ] Null/empty inputs tested
- [ ] Security scenarios tested

### After Writing Tests
- [ ] All tests pass
- [ ] Coverage targets met
- [ ] No flaky tests
- [ ] Tests run fast

## Anti-Patterns to Avoid

1. **Test Dependency**: Tests that depend on other tests
2. **Shared State**: Tests that share mutable state
3. **Slow Tests**: Tests that wait for real time
4. **Brittle Tests**: Tests that break with implementation changes
5. **Ignoring Tests**: `@Disabled` without explanation
6. **Test Logic**: Complex logic in tests
7. **Mocking Everything**: Over-mocking hides bugs
8. **No Assertions**: Tests without meaningful assertions
