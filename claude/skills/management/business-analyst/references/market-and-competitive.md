# BA — Market Research & Competitive Intelligence

## Market Research Deep Dive

### Research Methods Comparison

| Method | Type | Best For | Sample Size | Time |
|--------|------|----------|-------------|------|
| **Surveys** | Quantitative | Validation, sizing | 100-1000+ | Days-weeks |
| **Interviews** | Qualitative | Discovery, depth | 5-30 | Days-weeks |
| **Focus Groups** | Qualitative | Concept testing | 6-10 per group | Hours |
| **Observation** | Qualitative | Behavior understanding | Varies | Hours-days |
| **A/B Testing** | Quantitative | Optimization | 1000+ | Days-weeks |
| **Secondary Research** | Both | Context, benchmarks | N/A | Hours-days |

### Primary vs Secondary Research

```mermaid
flowchart TB
    subgraph "Primary Research (Original Data)"
        A[Surveys] --> E[Your Own Data]
        B[Interviews] --> E
        C[Focus Groups] --> E
        D[Observation] --> E
    end

    subgraph "Secondary Research (Existing Data)"
        F[Industry Reports] --> J[External Data]
        G[Government Statistics] --> J
        H[Academic Papers] --> J
        I[Competitor Data] --> J
    end

    E --> K{Data Triangulation}
    J --> K
    K --> L[Validated Insights]
```

### Survey Design Best Practices

| Element | Best Practice |
|---------|---------------|
| **Length** | < 10 minutes, 15-20 questions max |
| **Question types** | Mix of closed (70%) and open (30%) |
| **Scale** | 5-point Likert scale (strongly disagree → strongly agree) |
| **Order** | Easy → complex → sensitive → demographic |
| **Bias avoidance** | Neutral wording, randomize options |
| **Mobile-friendly** | 60%+ take surveys on mobile |

### Interview Guide Template

```markdown
## Interview Guide: {Topic}

### Metadata
- Duration: 45-60 minutes
- Format: Semi-structured
- Recording: Yes/No (with consent)

### Warm-up (5 min)
- Thank participant
- Explain purpose and confidentiality
- Get consent for recording

### Context Questions (10 min)
1. Tell me about your role and responsibilities
2. How long have you been doing {activity}?

### Core Questions (30 min)
1. Walk me through how you currently {process}
   - Probes: What works well? What's frustrating?
2. What are your biggest challenges with {topic}?
3. How do you currently solve {problem}?

### Concept Testing (10 min)
- Show prototype/concept
- What's your first reaction?
- What would make this useful for you?

### Wrap-up (5 min)
- Is there anything else you'd like to share?
- Can we follow up if needed?
- Thank participant
```

### Market Sizing (TAM/SAM/SOM)

```mermaid
flowchart TB
    TAM[TAM: Total Addressable Market<br/>Everyone who could theoretically buy] --> SAM
    SAM[SAM: Serviceable Addressable Market<br/>Segment you can reach with your model] --> SOM
    SOM[SOM: Serviceable Obtainable Market<br/>Realistic share you can capture]

    style TAM fill:#e1f5fe
    style SAM fill:#b3e5fc
    style SOM fill:#4fc3f7
```

**Calculation Methods:**

| Approach | Method | Best For |
|----------|--------|----------|
| **Top-down** | TAM × Market share % × Segment % | Quick estimates, investor pitches |
| **Bottom-up** | Units × Price × Customers | Operational planning, accuracy |
| **Value theory** | # of customers × Value per customer | New markets, disruptive products |

**Example (B2B SaaS):**
```
TAM: All businesses globally = $50B
SAM: SMBs in English-speaking markets = $8B
SOM: 2% market share Year 3 = $160M
```

---

## Competitive Intelligence

### Competitor Analysis Framework

```mermaid
flowchart LR
    A[Identify Competitors] --> B[Gather Data]
    B --> C[Analyze]
    C --> D[Position]
    D --> E[Monitor]
    E --> B

    subgraph "Data Sources"
        B1[Websites]
        B2[Reviews G2, Capterra]
        B3[Social media]
        B4[Job postings]
        B5[SEC filings]
        B6[Patents]
    end

    B --> B1
    B --> B2
    B --> B3
    B --> B4
    B --> B5
    B --> B6
```

### Competitive Intelligence Sources

| Source | Insights Available | Reliability |
|--------|-------------------|-------------|
| **Company website** | Positioning, features, pricing | High |
| **G2/Capterra reviews** | Strengths, weaknesses, use cases | Medium-High |
| **LinkedIn** | Team size, hiring trends, culture | High |
| **Job postings** | Technology stack, priorities | High |
| **Crunchbase** | Funding, investors, growth | High |
| **SEC filings (10-K)** | Revenue, strategy, risks | Very High |
| **Press releases** | Partnerships, launches | Medium |
| **Social media** | Sentiment, engagement | Medium |
| **Patent filings** | Innovation direction | High |

### Battlecard Template

```markdown
## Competitive Battlecard: {Competitor Name}

### Quick Facts
| Attribute | Details |
|-----------|---------|
| Founded | {year} |
| HQ | {location} |
| Employees | {count} |
| Funding | {total raised} |
| Revenue (est.) | ${X}M ARR |

### Positioning
**Their tagline:** "{tagline}"
**Target customer:** {ICP}
**Primary use case:** {use case}

### Strengths (Why they win)
1. {strength 1} - Counter: {our response}
2. {strength 2} - Counter: {our response}

### Weaknesses (Why they lose)
1. {weakness 1} - Exploit: {our advantage}
2. {weakness 2} - Exploit: {our advantage}

### Feature Comparison
| Feature | Us | Them | Notes |
|---------|-----|------|-------|
| {feature} | Yes/No/Partial | Yes/No/Partial | {context} |

### Pricing Comparison
| Tier | Us | Them |
|------|-----|------|
| Entry | ${X}/mo | ${Y}/mo |
| Pro | ${X}/mo | ${Y}/mo |
| Enterprise | Custom | Custom |

### Win/Loss Patterns
**We win when:**
- {pattern 1}
- {pattern 2}

**We lose when:**
- {pattern 1}
- {pattern 2}

### Objection Handling
**"Competitor has feature X"**
→ Response: {talking point}

**"Competitor is cheaper"**
→ Response: {talking point}
```

### Win/Loss Analysis Framework

| Data Point | Source | Questions |
|------------|--------|-----------|
| **Deal outcome** | CRM | Won/Lost/No decision |
| **Competitor** | Sales notes | Who did we compete against? |
| **Decision criteria** | Exit interview | What mattered most? |
| **Strengths cited** | Exit interview | What did they like about us? |
| **Weaknesses cited** | Exit interview | What concerns did they have? |
| **Pricing feedback** | Exit interview | Was price a factor? |
| **Timeline** | CRM | How long was the sales cycle? |

---

