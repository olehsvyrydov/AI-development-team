"""Model registry for multi-LLM consultation.

Top-tier flagship models only — /all is for complex decisions.
Costs in USD per 1M tokens.
"""

# Default top-tier models used unless user overrides
DEFAULT_MODELS = [
    "openai/gpt-5-2",
    "google/gemini-3-1-pro",
    "x-ai/grok-4",
]

MODELS = {
    # --- Default top-tier ---
    "openai/gpt-5-2": {
        "provider": "OpenAI",
        "context": 400_000,
        "cost_input": 1.75,
        "cost_output": 14.0,
        "strengths": "Deepest reasoning, security analysis, precision",
    },
    "google/gemini-3-1-pro": {
        "provider": "Google",
        "context": 1_000_000,
        "cost_input": 2.0,
        "cost_output": 12.0,
        "strengths": "Performance analysis, huge context, benchmarks leader",
    },
    "x-ai/grok-4": {
        "provider": "xAI",
        "context": 256_000,
        "cost_input": 3.0,
        "cost_output": 15.0,
        "strengths": "4-agent parallel architecture, alternative perspectives",
    },
    # --- Available alternatives ---
    "openai/gpt-5-2-pro": {
        "provider": "OpenAI",
        "context": 400_000,
        "cost_input": 21.0,
        "cost_output": 168.0,
        "strengths": "Maximum reasoning (expensive)",
    },
    "deepseek/deepseek-chat": {
        "provider": "DeepSeek",
        "context": 163_000,
        "cost_input": 0.25,
        "cost_output": 0.38,
        "strengths": "90% GPT-5 quality at 1/50th cost",
    },
    "x-ai/grok-4-fast": {
        "provider": "xAI",
        "context": 2_000_000,
        "cost_input": 0.20,
        "cost_output": 0.50,
        "strengths": "Largest context window, fast",
    },
    "google/gemini-3-flash": {
        "provider": "Google",
        "context": 1_000_000,
        "cost_input": 0.50,
        "cost_output": 3.0,
        "strengths": "Fast, still capable",
    },
    "meta-llama/llama-4-maverick": {
        "provider": "Meta",
        "context": 1_000_000,
        "cost_input": 0.18,
        "cost_output": 0.59,
        "strengths": "Open-source, multimodal",
    },
    "meta-llama/llama-4-scout": {
        "provider": "Meta",
        "context": 10_000_000,
        "cost_input": 0.10,
        "cost_output": 0.30,
        "strengths": "Open-source, 10M context",
    },
}


def get_model(model_id: str) -> dict | None:
    """Get model info by ID. Returns None if not found."""
    return MODELS.get(model_id)


def list_models() -> list[dict]:
    """List all available models with their info."""
    result = []
    for model_id, info in MODELS.items():
        result.append({
            "model_id": model_id,
            "is_default": model_id in DEFAULT_MODELS,
            **info,
        })
    return result


def estimate_cost(model_id: str, input_tokens: int, output_tokens: int) -> float:
    """Estimate cost in USD for a given model and token counts."""
    model = get_model(model_id)
    if not model:
        return 0.0
    return (
        (input_tokens / 1_000_000) * model["cost_input"]
        + (output_tokens / 1_000_000) * model["cost_output"]
    )
