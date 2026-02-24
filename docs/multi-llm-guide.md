# Multi-LLM Consultation — `/all` Command

The Multi-LLM Consultation system lets you query multiple AI platforms (GPT-5-2, Gemini 3.1 Pro, Grok 4, and more) from within Claude Code, then synthesize their responses into a unified analysis. Useful for architecture decisions, security reviews, and any question where diverse perspectives add value.

## How It Works

```
User: /all Should we use event sourcing for our payment system?
         ↓
Claude: Formulates a detailed prompt with context
         ↓
    ┌────┼────────────┐
    ↓    ↓            ↓
GPT-5-2  Gemini    Grok 4    (parallel via MCP tools)
    ↓    ↓            ↓
    └────┼────────────┘
         ↓
Claude: Synthesizes consensus, divergent views, unique insights
         ↓
User: Reads consolidated report, asks follow-ups
```

## Prerequisites

- **API key**: Either an [OpenRouter](https://openrouter.ai/) key (recommended — one key for all models) or individual API keys for each provider
- **Python venv**: The MCP server has its own venv at `multi-llm/mcp/.venv/`

## Setup

### 1. Install the MCP Server

```bash
cd multi-llm/mcp
python3 -m venv .venv
.venv/bin/pip install -e .
```

### 2. Get an API Key

**Option A: OpenRouter (recommended)**

Sign up at [openrouter.ai](https://openrouter.ai/) and get an API key. This gives you access to all models through a single key.

**Option B: Direct API keys**

Get individual keys from each provider:
- OpenAI: [platform.openai.com](https://platform.openai.com/)
- Google: [aistudio.google.com](https://aistudio.google.com/)
- xAI: [console.x.ai](https://console.x.ai/)

### 3. Register with Claude Code

```bash
# With OpenRouter (recommended)
claude mcp add multi-llm \
  -e OPENROUTER_API_KEY=your-openrouter-key \
  -- /absolute/path/to/multi-llm/mcp/.venv/bin/python3 -m consult_mcp

# With direct API keys
claude mcp add multi-llm \
  -e OPENAI_API_KEY=your-openai-key \
  -e GOOGLE_API_KEY=your-google-key \
  -e XAI_API_KEY=your-xai-key \
  -- /absolute/path/to/multi-llm/mcp/.venv/bin/python3 -m consult_mcp
```

### 4. Verify

```bash
claude mcp list
# Should show: multi-llm (stdio)
```

Then in Claude Code:

```
/all What is the best caching strategy for a REST API?
```

## Usage

### Basic Consultation

```
/all What's the best database for real-time analytics with 10TB+ data?
```

Claude will:
1. Check API configuration (`check_config`)
2. Show available models (`list_models`)
3. Let you pick which models to consult (defaults: GPT-5-2, Gemini 3.1 Pro, Grok 4)
4. Send the prompt to each model in parallel (`consult_model`)
5. Synthesize responses into a consolidated report

### Architecture Review

```
/all Review this architecture for scalability issues:
- React frontend → API Gateway → 3 microservices → PostgreSQL
- 10K concurrent users, growing to 100K
- Real-time notifications via WebSocket
```

### Security Analysis

```
/all Analyze this authentication flow for security vulnerabilities:
[paste your auth code or design]
```

### Technology Comparison

```
/all Compare event sourcing vs CQRS for our payment system
```

## Available Models

### Default Models (consulted by default)

| Model | Provider | Context | Cost (input/output per 1M tokens) | Strengths |
|-------|----------|---------|-------------------------------------|-----------|
| `openai/gpt-5-2` | OpenAI | 400K | $1.75 / $14.00 | Deepest reasoning, precision |
| `google/gemini-3-1-pro` | Google | 1M | $2.00 / $12.00 | Performance analysis, huge context |
| `x-ai/grok-4` | xAI | 256K | $3.00 / $15.00 | Parallel architecture, alternative views |

### Alternative Models

| Model | Provider | Context | Cost (input/output per 1M tokens) | Strengths |
|-------|----------|---------|-------------------------------------|-----------|
| `openai/gpt-5-2-pro` | OpenAI | 400K | $21.00 / $168.00 | Maximum reasoning (expensive) |
| `deepseek/deepseek-chat` | DeepSeek | 163K | $0.25 / $0.38 | 90% quality at 1/50th cost |
| `x-ai/grok-4-fast` | xAI | 2M | $0.20 / $0.50 | Largest context, fast |
| `google/gemini-3-flash` | Google | 1M | $0.50 / $3.00 | Fast, capable |
| `meta-llama/llama-4-maverick` | Meta | 1M | $0.18 / $0.59 | Open-source, multimodal |
| `meta-llama/llama-4-scout` | Meta | 10M | $0.10 / $0.30 | Open-source, 10M context |

## MCP Tools

The Multi-LLM MCP server provides 3 tools:

| Tool | Description |
|------|-------------|
| `check_config()` | Verify which API keys are configured and if the system is ready |
| `list_models()` | Show all available models with costs, context sizes, and strengths |
| `consult_model(prompt, model, role)` | Send a prompt to one external LLM and get a response |

### `consult_model` Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `prompt` | Yes | The question or analysis request |
| `model` | Yes | OpenRouter model ID (e.g., `openai/gpt-5-2`) |
| `role` | No | Expert role for the model (e.g., `security expert`) |

### Response Format

```json
{
  "response": "The model's analysis...",
  "model": "openai/gpt-5-2",
  "input_tokens": 1250,
  "output_tokens": 890,
  "cost": 0.01467
}
```

## Report Format

After consulting all models, Claude synthesizes a report:

```markdown
## Multi-LLM Consultation Report

**Question**: [What was asked]
**Models consulted**: GPT-5-2, Gemini 3.1 Pro, Grok 4
**Total cost**: $0.05

### Consensus Points
- [Things all models agree on — HIGH confidence]

### Divergent Views
| Topic | GPT-5-2 | Gemini 3.1 Pro | Grok 4 | Claude's Take |
|-------|---------|----------------|--------|---------------|

### Unique Insights
- **GPT-5-2**: [Only this model caught this]
- **Gemini 3.1 Pro**: [Only this model caught this]
- **Grok 4**: [Only this model caught this]

### Recommendation
[Synthesized recommendation combining all perspectives]
```

## API Routing

```
OpenRouter API key available?
    ├── Yes → All models routed through OpenRouter (single endpoint)
    └── No → Direct API keys used (OpenAI SDK with custom base_url)
```

OpenRouter is recommended because:
- **One key** for all providers (OpenAI, Google, xAI, Meta, DeepSeek)
- **Unified billing** — single dashboard for all model costs
- **Automatic fallback** — if one provider is down, OpenRouter routes to alternatives

## Architecture

```
multi-llm/mcp/
├── consult_mcp/
│   ├── __init__.py
│   ├── __main__.py      # Entry point for `python3 -m consult_mcp`
│   ├── server.py        # FastMCP server registration
│   ├── tools.py         # 3 MCP tool implementations
│   ├── clients.py       # API client management, OpenRouter routing
│   └── models.py        # Model registry (9 models, costs, strengths)
├── tests/               # 26 tests
├── pyproject.toml
└── .venv/               # Dedicated virtual environment
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | Yes (preferred) | OpenRouter API key — access all models |
| `OPENAI_API_KEY` | Alternative | Direct OpenAI API key |
| `GOOGLE_API_KEY` | Alternative | Direct Google AI API key |
| `XAI_API_KEY` | Alternative | Direct xAI API key |

System is "ready" when either `OPENROUTER_API_KEY` is set OR both `OPENAI_API_KEY` and `GOOGLE_API_KEY` are set.

## Running Tests

```bash
cd multi-llm/mcp
.venv/bin/python3 -m pytest tests/ -v
# 26 tests
```

## Cost Estimation

A typical 3-model consultation with ~1000 input tokens and ~500 output tokens per model:

```
GPT-5-2:        $0.0018 + $0.0070 = $0.0088
Gemini 3.1 Pro: $0.0020 + $0.0060 = $0.0080
Grok 4:         $0.0030 + $0.0075 = $0.0105
                               Total: ~$0.03
```

For budget-conscious use, swap defaults for cheaper models:

```
DeepSeek + Gemini Flash + Llama Scout ≈ $0.001 per consultation
```

## Removing the MCP Server

```bash
claude mcp remove multi-llm
```
