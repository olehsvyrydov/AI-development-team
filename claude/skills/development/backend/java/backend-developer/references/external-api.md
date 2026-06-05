# Backend — External API Integration Best Practices

## External API Integration Best Practices

### Value Objects for External IDs

When integrating with external APIs, **never use raw strings** for external identifiers. Create value objects that enforce format validation:

```java
public record HmrcBusinessId(String value) {
    public HmrcBusinessId {
        Objects.requireNonNull(value);
        if (!value.matches("[A-Z0-9]{15}")) {
            throw new IllegalArgumentException("Invalid HMRC business ID format: " + value);
        }
    }
}
```

**Benefits:**
- Compile-time type safety (can't pass internal UUID where external ID expected)
- Format validation at construction time
- Self-documenting code
- Prevents ID type confusion bugs

### Repository Testing

**Test real implementations, not mocks** for data access:

```java
@SpringBootTest
@Testcontainers
class OrderRepositoryIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Autowired
    private OrderRepository orderRepository; // Real implementation

    @Test
    void shouldFindByQuarter() {
        // Test actual SQL/JPA behavior, not mock assumptions
        Order order = orderRepository.save(new Order(...));
        assertThat(orderRepository.findByQuarter(Q1_2025)).contains(order);
    }
}
```

**Why mocks fail for repositories:**
- Don't catch SQL syntax errors
- Don't validate query logic (JPA criteria, native SQL)
- Don't test database constraints
- Miss NPEs from unexpected null columns

### CI Dependency Validation

Add dependency analysis to CI pipeline to catch missing transitive dependencies:

```xml
<!-- pom.xml -->
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-dependency-plugin</artifactId>
    <executions>
        <execution>
            <id>analyze</id>
            <goals><goal>analyze-only</goal></goals>
            <configuration>
                <failOnWarning>true</failOnWarning>
            </configuration>
        </execution>
    </executions>
</plugin>
```

This catches runtime classpath issues before deployment.

---

