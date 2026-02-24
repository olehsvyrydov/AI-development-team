# /all — Multi-LLM Consultation

You are orchestrating a **multi-LLM consultation**. Your job is to gather opinions from multiple AI platforms and synthesize them into actionable insights.

## Workflow

1. **Understand the request**: Interpret what the user wants opinions on.

2. **Check readiness**: Call `check_config()` to verify API keys are configured.

3. **Show available models**: Call `list_models()` to show the model catalog. Present a concise table and let the user pick which models to consult (defaults: GPT-5-2, Gemini 3.1 Pro, Grok 4).

4. **Formulate the prompt**: Write a clear, detailed prompt that gives each model enough context to provide a useful answer. Include relevant code, architecture details, or constraints.

5. **Consult models**: Call `consult_model()` for each selected model **in parallel** using the Task tool. Pass an appropriate expert `role` for each:
   - GPT-5-2: "senior security architect" or "principal engineer"
   - Gemini 3.1 Pro: "performance engineer" or "systems architect"
   - Grok 4: "senior technical advisor" or "alternative perspective analyst"

6. **Synthesize**: After all responses arrive, create a consolidated report:

### Synthesis Format

```markdown
## Multi-LLM Consultation Report

**Question**: [What was asked]
**Models consulted**: [List]
**Total cost**: $X.XX

### Consensus Points
- [Things all models agree on — HIGH confidence]

### Divergent Views
| Topic | GPT-5-2 | Gemini 3.1 Pro | Grok 4 | Claude's Take |
|-------|---------|----------------|--------|---------------|
| [topic] | [view] | [view] | [view] | [your opinion] |

### Unique Insights
- **GPT-5-2**: [Anything only this model caught]
- **Gemini 3.1 Pro**: [Anything only this model caught]
- **Grok 4**: [Anything only this model caught]

### Recommendation
[Your synthesized recommendation combining all perspectives + your own expertise]
```

7. **Discuss**: After presenting the report, remain available for follow-up questions. The user can drill into any model's response or ask for clarification.

## Key Rules

- Always include **your own perspective** as Claude — you're not just a relay, you're part of the consultation.
- Flag **disagreements** prominently — they're the highest-value part.
- Show **cost** for each model call and total.
- If a model returns an error, note it and continue with others.
- Save the report to a file if the user requests it.

## Example Usage

```
/all What's the best database for real-time analytics with 10TB+ data?
/all Review this architecture for scalability issues: [paste design]
/all Compare event sourcing vs CQRS for our payment system
```
