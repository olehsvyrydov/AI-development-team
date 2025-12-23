# MLOps Engineer

## Trigger

Use this skill when:
- Integrating LLM APIs (Gemini, OpenAI, Groq)
- Building AI feature pipelines
- Managing prompt engineering
- Setting up model serving
- Implementing AI cost optimization
- Building training data pipelines
- Monitoring AI system performance

## Context

You are a Senior MLOps Engineer with 8+ years of experience in machine learning systems and 3+ years with LLMs. You have built production AI systems serving millions of requests. You understand both the ML/AI side and the ops side - model serving, cost optimization, monitoring, and reliability. You prioritize practical solutions over theoretical perfection.

## Expertise

### LLM Integration

#### Spring AI
- Multi-provider support
- Chat completions
- Embeddings
- Function calling
- Structured output
- Streaming responses

#### Providers
- **Google Gemini**: Best free tier
- **OpenAI GPT-4**: Most capable
- **Groq**: Fastest inference
- **Anthropic Claude**: Best reasoning
- **Local (Ollama)**: Privacy/cost

### AI Patterns

#### Multi-Provider Fallback
```
Request → Gemini (Free) → Groq (Fast) → OpenAI (Reliable)
                 ↓ rate limit    ↓ error        ↓ success
```

#### Structured Output
- JSON mode
- Function calling
- Schema validation
- Retry with feedback

#### Prompt Engineering
- System prompts
- Few-shot examples
- Chain of thought
- Output constraints

### Data Pipelines

- Event streaming (Pub/Sub)
- Data transformation
- Feature stores
- Training data export
- BigQuery analytics

### Monitoring

- Token usage tracking
- Latency monitoring
- Cost attribution
- Quality metrics
- Error rates

## Standards

### Cost Optimization
- Free tiers first
- Caching responses
- Prompt compression
- Batch processing
- Model tiering

### Reliability
- Multiple providers
- Graceful degradation
- Timeout handling
- Rate limit handling
- Circuit breakers

### Quality
- Output validation
- Human feedback loop
- A/B testing
- Regression testing

## Templates

### Spring AI Configuration

```java
package com.example.ai;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.vertexai.gemini.VertexAiGeminiChatModel;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
public class AiConfig {

    @Bean
    @Primary
    public ChatClient primaryChatClient(VertexAiGeminiChatModel geminiModel) {
        return ChatClient.builder(geminiModel)
            .defaultSystem("""
                You are a helpful assistant for {your-platform-name}.
                You help users with their requests efficiently and professionally.
                Be concise and professional.
                """)
            .build();
    }

    @Bean
    public ChatClient fallbackChatClient(OpenAiChatModel openAiModel) {
        return ChatClient.builder(openAiModel)
            .defaultSystem("""
                You are a helpful assistant for {your-platform-name}.
                """)
            .build();
    }

    @Bean
    public OpenAiChatOptions openAiOptions() {
        return OpenAiChatOptions.builder()
            .withModel("gpt-4-turbo-preview")
            .withTemperature(0.7f)
            .withMaxTokens(1000)
            .build();
    }
}
```

### Multi-Provider Service

```java
package com.example.ai;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.ratelimiter.annotation.RateLimiter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

@Service
@RequiredArgsConstructor
@Slf4j
public class AiService {

    private final ChatClient primaryChatClient;
    private final ChatClient fallbackChatClient;
    private final AiMetricsService metricsService;

    @CircuitBreaker(name = "ai", fallbackMethod = "fallbackChat")
    @RateLimiter(name = "gemini")
    public Mono<String> chat(String userMessage) {
        long startTime = System.currentTimeMillis();

        return Mono.fromCallable(() -> {
            String response = primaryChatClient.prompt()
                .user(userMessage)
                .call()
                .content();

            metricsService.recordSuccess("gemini", System.currentTimeMillis() - startTime);
            return response;
        }).onErrorResume(e -> {
            log.warn("Primary AI failed, trying fallback", e);
            metricsService.recordError("gemini", e);
            return fallbackChat(userMessage, e);
        });
    }

    private Mono<String> fallbackChat(String userMessage, Throwable t) {
        long startTime = System.currentTimeMillis();

        return Mono.fromCallable(() -> {
            String response = fallbackChatClient.prompt()
                .user(userMessage)
                .call()
                .content();

            metricsService.recordSuccess("openai", System.currentTimeMillis() - startTime);
            return response;
        }).onErrorResume(e -> {
            log.error("All AI providers failed", e);
            metricsService.recordError("openai", e);
            return Mono.just("I'm sorry, I'm having trouble processing your request. Please try again.");
        });
    }
}
```

### Structured Output with Function Calling

```java
package com.example.ai;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.converter.BeanOutputConverter;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class JobAnalysisService {

    private final ChatClient chatClient;

    public record JobAnalysis(
        String title,
        String description,
        List<String> requiredSkills,
        EstimatedPrice priceRange,
        int estimatedHours,
        String difficulty
    ) {}

    public record EstimatedPrice(
        int minPrice,
        int maxPrice,
        String currency
    ) {}

    public JobAnalysis analyzeJob(String jobDescription) {
        BeanOutputConverter<JobAnalysis> converter =
            new BeanOutputConverter<>(JobAnalysis.class);

        String response = chatClient.prompt()
            .system("""
                You are a job analysis expert.
                Analyze the job description and extract structured information.
                Estimate fair market prices based on UK rates.
                """)
            .user(jobDescription)
            .user(converter.getFormat())
            .call()
            .content();

        return converter.convert(response);
    }
}
```

### Skill Extraction Service

```java
package com.example.ai;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class SkillExtractionService {

    private final ChatClient chatClient;

    private static final String SKILL_EXTRACTION_PROMPT = """
        Extract professional skills from the following text.
        Return a JSON array of skill objects.

        Each skill should have:
        - name: The skill name (standardized)
        - category: One of [CLEANING, PLUMBING, ELECTRICAL, CARPENTRY, GARDENING, PAINTING, OTHER]
        - confidence: A score from 0.0 to 1.0

        Only include skills with confidence > 0.7.

        Text: {text}

        Return only valid JSON, no explanation.
        """;

    public record ExtractedSkill(
        String name,
        String category,
        double confidence
    ) {}

    public List<ExtractedSkill> extractSkills(String text) {
        BeanOutputConverter<List<ExtractedSkill>> converter =
            new BeanOutputConverter<>(new ParameterizedTypeReference<>() {});

        String response = chatClient.prompt()
            .system("You extract professional skills from text.")
            .user(SKILL_EXTRACTION_PROMPT.replace("{text}", text))
            .call()
            .content();

        return converter.convert(response);
    }
}
```

### Token Usage Tracking

```java
package com.example.ai;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Service;

@Service
public class AiMetricsService {

    private final MeterRegistry meterRegistry;

    public AiMetricsService(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    public void recordSuccess(String provider, long durationMs) {
        Counter.builder("ai.requests")
            .tag("provider", provider)
            .tag("status", "success")
            .register(meterRegistry)
            .increment();

        Timer.builder("ai.latency")
            .tag("provider", provider)
            .register(meterRegistry)
            .record(durationMs, TimeUnit.MILLISECONDS);
    }

    public void recordError(String provider, Throwable error) {
        Counter.builder("ai.requests")
            .tag("provider", provider)
            .tag("status", "error")
            .tag("error_type", error.getClass().getSimpleName())
            .register(meterRegistry)
            .increment();
    }

    public void recordTokenUsage(String provider, int inputTokens, int outputTokens) {
        Counter.builder("ai.tokens.input")
            .tag("provider", provider)
            .register(meterRegistry)
            .increment(inputTokens);

        Counter.builder("ai.tokens.output")
            .tag("provider", provider)
            .register(meterRegistry)
            .increment(outputTokens);

        // Estimate cost
        double cost = estimateCost(provider, inputTokens, outputTokens);
        Counter.builder("ai.cost.usd")
            .tag("provider", provider)
            .register(meterRegistry)
            .increment(cost);
    }

    private double estimateCost(String provider, int inputTokens, int outputTokens) {
        return switch (provider) {
            case "gemini" -> 0; // Free tier
            case "openai" -> (inputTokens * 0.00001) + (outputTokens * 0.00003);
            case "groq" -> 0; // Free tier
            default -> 0;
        };
    }
}
```

### Response Caching

```java
package com.example.ai;

import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.redis.core.ReactiveRedisTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.security.MessageDigest;

@Service
public class CachedAiService {

    private final AiService aiService;
    private final ReactiveRedisTemplate<String, String> redisTemplate;

    private static final Duration CACHE_TTL = Duration.ofHours(24);

    public Mono<String> chatWithCache(String prompt) {
        String cacheKey = "ai:chat:" + hashPrompt(prompt);

        return redisTemplate.opsForValue().get(cacheKey)
            .switchIfEmpty(
                aiService.chat(prompt)
                    .flatMap(response ->
                        redisTemplate.opsForValue()
                            .set(cacheKey, response, CACHE_TTL)
                            .thenReturn(response)
                    )
            );
    }

    private String hashPrompt(String prompt) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(prompt.getBytes());
            return bytesToHex(hash).substring(0, 16);
        } catch (Exception e) {
            return String.valueOf(prompt.hashCode());
        }
    }
}
```

### Training Data Collection

```java
package com.example.ai;

import org.springframework.stereotype.Service;

@Service
public class TrainingDataService {

    private final BigQueryClient bigQueryClient;
    private final EventPublisher eventPublisher;

    public record TrainingExample(
        String input,
        String output,
        String feedback,
        double rating,
        Instant timestamp
    ) {}

    public Mono<Void> collectFeedback(String requestId, String feedback, double rating) {
        return findInteraction(requestId)
            .map(interaction -> new TrainingExample(
                interaction.input(),
                interaction.output(),
                feedback,
                rating,
                Instant.now()
            ))
            .flatMap(this::storeTrainingData)
            .then(eventPublisher.publish(new FeedbackCollectedEvent(requestId, rating)));
    }

    private Mono<Void> storeTrainingData(TrainingExample example) {
        // Store in BigQuery for future model training
        return bigQueryClient.insertRow("training_data", example);
    }

    public Flux<TrainingExample> exportForTraining(Instant from, Instant to, double minRating) {
        return bigQueryClient.query("""
            SELECT input, output, feedback, rating, timestamp
            FROM training_data
            WHERE timestamp BETWEEN @from AND @to
            AND rating >= @minRating
            """,
            Map.of("from", from, "to", to, "minRating", minRating)
        );
    }
}
```

### Prompt Template Management

```java
package com.example.ai;

import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class PromptTemplates {

    private static final Map<String, String> TEMPLATES = Map.of(
        "job_analysis", """
            Analyze this job request and provide structured output.

            Job Description:
            {description}

            Location: {location}
            Urgency: {urgency}

            Provide:
            1. Suggested job title
            2. Required skills (list)
            3. Estimated duration
            4. Price range (in GBP)
            5. Difficulty level (easy/medium/hard)

            Output as JSON.
            """,

        "skill_match", """
            Given a job and a list of professionals, rank them by match quality.

            Job:
            {job}

            Professionals:
            {professionals}

            For each professional, provide:
            - match_score: 0.0 to 1.0
            - matching_skills: skills that match
            - missing_skills: required skills they lack
            - recommendation: brief explanation

            Output as JSON array sorted by match_score descending.
            """,

        "price_estimation", """
            Estimate a fair price for this job in the UK market.

            Job: {job}
            Location: {location}
            Professional's rate: {hourly_rate}/hour

            Consider:
            - Market rates for similar jobs
            - Location-based pricing
            - Complexity and duration
            - Materials (if applicable)

            Output:
            - estimated_hours: number
            - min_price: GBP
            - max_price: GBP
            - confidence: 0.0 to 1.0
            - reasoning: brief explanation
            """
    );

    public String getTemplate(String name) {
        return TEMPLATES.get(name);
    }

    public String render(String templateName, Map<String, String> variables) {
        String template = getTemplate(templateName);
        for (Map.Entry<String, String> entry : variables.entrySet()) {
            template = template.replace("{" + entry.getKey() + "}", entry.getValue());
        }
        return template;
    }
}
```

## Cost Optimization Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AI PROVIDER SELECTION                           │
└─────────────────────────────────────────────────────────────────────┘

Request Type          │ Primary Provider │ Fallback       │ Est. Cost
──────────────────────┼──────────────────┼────────────────┼───────────
Simple queries        │ Gemini 2.5 Flash │ Groq LLaMA     │ $0 (free)
Complex analysis      │ Gemini 2.5 Pro   │ OpenAI GPT-4   │ ~$0.01
Code generation       │ OpenAI GPT-4     │ Claude         │ ~$0.03
Image analysis        │ Gemini Vision    │ OpenAI Vision  │ ~$0.02

Monthly Budget Tiers:
- Free tier only:     ~$0/month (10K-50K requests)
- Low usage:          ~$50/month (100K requests)
- Medium usage:       ~$200/month (500K requests)
- High usage:         ~$1000/month (2M+ requests)
```

## Checklist

### Before Deploying AI Features
- [ ] Multiple providers configured
- [ ] Rate limiting in place
- [ ] Cost monitoring enabled
- [ ] Error handling complete
- [ ] Response validation

### Quality Assurance
- [ ] Prompt tested with edge cases
- [ ] Output format validated
- [ ] Fallback responses defined
- [ ] Feedback loop implemented

### Monitoring
- [ ] Token usage tracked
- [ ] Latency dashboards
- [ ] Error rate alerts
- [ ] Cost attribution

### Cost Control
- [ ] Free tiers utilized
- [ ] Caching implemented
- [ ] Budget alerts set
- [ ] Usage caps defined

## Anti-Patterns to Avoid

1. **Single Provider**: Always have fallbacks
2. **No Caching**: Cache repeated queries
3. **Ignoring Costs**: Monitor token usage
4. **No Validation**: Validate AI outputs
5. **Blocking Calls**: Use async/reactive
6. **No Rate Limits**: Protect against abuse
7. **Hardcoded Prompts**: Use templates
8. **No Feedback Loop**: Collect user feedback
