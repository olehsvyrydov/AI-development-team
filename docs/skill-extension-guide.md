# Skill Extension Guide

This guide explains how to extend, customize, and add new skills to the AI Development Team.

## Table of Contents

1. [Understanding Skill Structure](#understanding-skill-structure)
2. [Extending Existing Skills](#extending-existing-skills)
3. [Adding New Technology Support](#adding-new-technology-support)
4. [Creating New Agents](#creating-new-agents)
5. [Best Practices](#best-practices)
6. [Examples](#examples)

---

## Understanding Skill Structure

Each skill file follows this structure:

```markdown
# Agent Name

## Trigger
When to activate this skill (conditions and keywords).

## Context
Persona definition with experience level and domain expertise.

## Expertise
Technical knowledge organized by category:
- Frameworks and versions
- Patterns and practices
- Tools and technologies

## Standards
Quality requirements:
- Code style guides
- Testing requirements
- Documentation standards

## Templates
Ready-to-use code or document templates.

## Checklist
Pre-completion verification items.

## Anti-Patterns to Avoid
Common mistakes to prevent.
```

---

## Extending Existing Skills

### Method 1: Direct Extension (Recommended)

Edit the existing skill file to add new technologies within the appropriate sections.

**Example: Adding Angular to Frontend Developer**

Open `skills/development/frontend-developer.md` and add Angular expertise:

```markdown
## Expertise

### Web Development

#### React Ecosystem (existing)
...

#### Angular Ecosystem (NEW)
- **Angular 18+**: Standalone components, signals, zoneless
- **Angular Material**: Component library
- **NgRx**: State management (signals-based)
- **RxJS**: Reactive programming
- **Angular CLI**: Project scaffolding
- **Angular Universal**: Server-side rendering

### Angular Standards (NEW)
- Strict TypeScript mode
- OnPush change detection
- Lazy loading modules
- Reactive forms over template-driven
- Smart/Dumb component pattern
```

### Method 2: Override in Project

Create a project-specific skill that extends the base:

```
your-project/
└── .claude/
    └── skills/
        └── frontend-developer-extended.md  # Your customizations
```

In your skill file:

```markdown
# Frontend Developer (Extended)

This extends the base frontend-developer skill with Angular expertise.

## Additional Expertise

### Angular Ecosystem
- Angular 18+ with signals
- NgRx Signal Store
- Angular Material
...
```

---

## Adding New Technology Support

### Backend Developer: Adding Quarkus

Add this section to `skills/development/backend-developer.md`:

```markdown
### Quarkus Framework (Alternative to Spring Boot)

#### Core Concepts
- **Quarkus 3.x**: Supersonic Subatomic Java
- **GraalVM Native**: Native compilation support
- **Dev Mode**: Live reload with continuous testing
- **Extensions**: Modular architecture

#### Key Extensions
- quarkus-resteasy-reactive: RESTful services
- quarkus-hibernate-reactive-panache: Reactive ORM
- quarkus-smallrye-reactive-messaging-kafka: Kafka integration
- quarkus-oidc: OAuth2/OIDC support
- quarkus-scheduler: Scheduled tasks

#### Quarkus Patterns
```java
@Path("/api/users")
@Produces(MediaType.APPLICATION_JSON)
public class UserResource {

    @Inject
    UserService userService;

    @GET
    public Uni<List<User>> getAll() {
        return userService.findAll();
    }

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    public Uni<Response> create(CreateUserRequest request) {
        return userService.create(request)
            .map(user -> Response.created(URI.create("/api/users/" + user.id)).build());
    }
}
```

#### Quarkus Testing
```java
@QuarkusTest
class UserResourceTest {

    @Test
    void shouldCreateUser() {
        given()
            .contentType(ContentType.JSON)
            .body(new CreateUserRequest("test@example.com"))
        .when()
            .post("/api/users")
        .then()
            .statusCode(201)
            .header("Location", containsString("/api/users/"));
    }
}
```

#### Quarkus Standards
- Use Uni/Multi for reactive operations
- Prefer Panache for data access
- Use @ConfigMapping for configuration
- Enable native compilation in CI
- Test with @QuarkusTest
```

### Frontend Developer: Adding Vue.js

Add this section to `skills/development/frontend-developer.md`:

```markdown
### Vue.js Ecosystem (Alternative to React)

#### Core Technologies
- **Vue 3.x**: Composition API, script setup
- **Nuxt 3**: Full-stack framework (SSR/SSG)
- **Pinia**: State management
- **Vue Router**: Routing
- **VueUse**: Composition utilities
- **Vite**: Build tool

#### Vue Patterns
```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const searchQuery = ref('')

const filteredUsers = computed(() =>
  userStore.users.filter(u =>
    u.name.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
)

onMounted(() => {
  userStore.fetchUsers()
})
</script>

<template>
  <div class="user-list">
    <input v-model="searchQuery" placeholder="Search users..." />
    <ul>
      <li v-for="user in filteredUsers" :key="user.id">
        {{ user.name }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.user-list {
  @apply flex flex-col gap-4;
}
</style>
```

#### Vue Standards
- Use Composition API with script setup
- Prefer Pinia over Vuex
- Use TypeScript strict mode
- Implement proper prop validation
- Follow Vue Style Guide (Priority A rules)
```

---

## Creating New Agents

### Step 1: Identify the Gap

Ask yourself:
- What expertise is missing from the current team?
- Which role would handle this in a real development team?
- Is this a new role or an extension of existing ones?

### Step 2: Choose the Category

```
skills/
├── management/      # Leadership and process roles
├── architecture/    # Design and technical strategy
├── development/     # Implementation roles
├── quality/         # Testing and review roles
├── operations/      # Infrastructure and DevOps
├── specialized/     # Domain-specific expertise
└── documentation/   # Documentation roles
```

### Step 3: Create the Skill File

**Template for New Agent:**

```markdown
# {Agent Name}

## Trigger

Use this skill when:
- {Condition 1}
- {Condition 2}
- {Condition 3}

## Context

You are a Senior {Role} with {X}+ years of experience in {domain}.
You have {specific achievements or expertise}.
You prioritize {key principles}.

## Expertise

### {Category 1}

#### {Technology/Framework}
- **{Tool} {version}**: {brief description}
- **{Pattern}**: {when to use}

### {Category 2}
...

## Standards

### {Standard Category}
- {Requirement 1}
- {Requirement 2}

## Templates

### {Template Name}

```{language}
{Template code or structure}
```

## Checklist

### Before Completing Any Task
- [ ] {Verification item 1}
- [ ] {Verification item 2}
- [ ] {Verification item 3}

## Anti-Patterns to Avoid

1. **{Anti-pattern name}**: {Why it's bad and what to do instead}
2. **{Anti-pattern name}**: {Why it's bad and what to do instead}
```

### Step 4: Research Current Best Practices

Always include latest best practices:

```markdown
<!-- In your skill file, add sources section -->

## Sources (for maintenance)

- Official documentation: {URL}
- Style guide: {URL}
- Best practices: {URL}
- Last updated: {YYYY-MM-DD}
```

### Step 5: Update Documentation

1. Add to README.md agent table
2. Update CLAUDE.md if needed
3. Add to team-workflow.md diagram

---

## Best Practices

### 1. Keep Skills Focused

Each skill should have a clear purpose. Avoid creating "Swiss Army knife" skills.

```markdown
# Good: Specific role
Backend Developer - Spring Boot/Java specialist

# Bad: Too broad
Full Stack Everything Developer
```

### 2. Version Technology References

Always include version numbers:

```markdown
# Good
- Spring Boot 4.0+
- Java 25+
- React 19

# Bad
- Spring Boot
- Java
- React
```

### 3. Include Practical Templates

Templates should be copy-paste ready:

```markdown
# Good: Complete, working template
```java
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {
    private final UserService userService;

    @GetMapping
    public Mono<List<UserResponse>> getAll() {
        return userService.findAll();
    }
}
```

# Bad: Incomplete skeleton
```java
// TODO: Add implementation
public class UserController {
}
```
```

### 4. Define Clear Standards

Be specific about requirements:

```markdown
# Good: Measurable standards
- Unit test coverage: >80%
- Method length: <20 lines
- Cyclomatic complexity: <10

# Bad: Vague standards
- Write good tests
- Keep methods short
- Don't make code complex
```

### 5. Update Regularly

Technology evolves. Schedule regular reviews:

```markdown
## Maintenance Schedule

| Component | Review Frequency | Last Review |
|-----------|-----------------|-------------|
| Framework versions | Monthly | 2025-01-15 |
| Best practices | Quarterly | 2025-01-01 |
| Templates | Per major release | 2025-01-10 |
```

---

## Examples

### Example 1: Adding Database Expertise to Backend Developer

```markdown
### Database Expertise (Add to backend-developer.md)

#### PostgreSQL Advanced
- **Partitioning**: Range, list, hash partitioning
- **Full-Text Search**: tsvector, GIN indexes
- **PostGIS**: Spatial queries for location-based features
- **JSON/JSONB**: Document storage within relational DB
- **Connection Pooling**: PgBouncer, HikariCP configuration

#### MongoDB (NoSQL Alternative)
- **Spring Data MongoDB**: Reactive repository support
- **Aggregation Framework**: Pipeline operations
- **Indexes**: Compound, text, geospatial
- **Change Streams**: Real-time data changes
- **Sharding**: Horizontal scaling strategy
```

### Example 2: Creating a Data Engineer Agent

Create `skills/specialized/data-engineer.md`:

```markdown
# Data Engineer

## Trigger

Use this skill when:
- Designing data pipelines
- Working with data warehouses (BigQuery, Snowflake)
- Building ETL/ELT processes
- Implementing data quality checks
- Setting up data lake architecture

## Context

You are a Senior Data Engineer with 8+ years of experience in data
infrastructure and analytics. You have built petabyte-scale data
platforms and understand both batch and real-time processing patterns.

## Expertise

### Data Processing
- **Apache Spark**: Batch and streaming
- **Apache Kafka**: Event streaming
- **Apache Airflow**: Workflow orchestration
- **dbt**: Data transformation

### Cloud Data Services
- **BigQuery**: Serverless analytics
- **Cloud Dataflow**: Beam pipelines
- **Cloud Composer**: Managed Airflow
- **Pub/Sub**: Message streaming

### Data Quality
- **Great Expectations**: Data validation
- **dbt tests**: Schema and data tests
- **Data contracts**: API-like data agreements

## Standards

### Data Pipeline Standards
- Idempotent operations
- Exactly-once semantics where required
- Data lineage tracking
- Schema evolution handling
- Cost optimization (partition pruning, clustering)

## Templates

### dbt Model Template

```sql
-- models/staging/stg_users.sql
{{
    config(
        materialized='incremental',
        unique_key='user_id',
        partition_by={
            "field": "created_at",
            "data_type": "timestamp",
            "granularity": "day"
        }
    )
}}

SELECT
    id AS user_id,
    email,
    created_at,
    updated_at,
    _fivetran_synced AS synced_at
FROM {{ source('app_db', 'users') }}

{% if is_incremental() %}
WHERE updated_at > (SELECT MAX(updated_at) FROM {{ this }})
{% endif %}
```

## Checklist

- [ ] Data quality tests defined
- [ ] Backfill strategy documented
- [ ] Monitoring and alerting configured
- [ ] Cost estimates calculated
- [ ] Schema changes versioned
```

### Example 3: Adding Mobile-Specific Testing to E2E Tester

Add to `skills/quality/e2e-tester.md`:

```markdown
### Mobile E2E Testing (Extended)

#### Detox (React Native)
- **Configuration**: iOS Simulator, Android Emulator
- **Synchronization**: Wait for animations, network
- **Actions**: Tap, swipe, scroll, type
- **Matchers**: By ID, text, label, traits

#### Detox Test Pattern
```javascript
describe('User Authentication', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it('should login with valid credentials', async () => {
    await element(by.id('email-input')).typeText('test@example.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();

    await waitFor(element(by.id('home-screen')))
      .toBeVisible()
      .withTimeout(5000);
  });

  it('should show error for invalid credentials', async () => {
    await element(by.id('email-input')).typeText('wrong@example.com');
    await element(by.id('password-input')).typeText('wrongpass');
    await element(by.id('login-button')).tap();

    await expect(element(by.text('Invalid credentials'))).toBeVisible();
  });
});
```

#### Maestro (Cross-Platform Alternative)
```yaml
# flows/login.yaml
appId: com.yourapp
---
- launchApp
- tapOn: "Email"
- inputText: "test@example.com"
- tapOn: "Password"
- inputText: "password123"
- tapOn: "Login"
- assertVisible: "Welcome"
```
```

---

## Multi-File Skill Structure

For complex agents, use a folder structure:

```
skills/quality/backend-reviewer/
├── main.md                 # Primary skill definition
├── checkstyle-config.xml   # Checkstyle rules
├── spotbugs-exclude.xml    # SpotBugs configuration
├── sonar-profile.json      # SonarQube quality profile
└── checklist.md            # Detailed review checklist
```

Reference additional files in main.md:

```markdown
## Configuration Files

This skill uses the following configuration files:
- `checkstyle-config.xml`: Google Java Style enforcement
- `spotbugs-exclude.xml`: Bug pattern exclusions
- `sonar-profile.json`: SonarQube quality gates

Apply these configurations to your project for consistent enforcement.
```

---

## Contribution Guidelines

When contributing new skills or extensions:

1. **Research first**: Check latest best practices via official docs
2. **Test templates**: Ensure all code templates compile/run
3. **Be specific**: Include versions, specific settings, measurable standards
4. **Document sources**: Link to authoritative references
5. **Update README**: Add new agents to the team table
6. **Consider interactions**: How does this skill work with others?

---

*Last updated: 2025-12-23*
