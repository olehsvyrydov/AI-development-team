"""MCP tool implementations for multi-LLM consultation.

3 tools:
- consult_model: Send prompt to one external LLM
- list_models: Show available models with costs
- check_config: Verify API key configuration
"""

from openai import AsyncOpenAI

from .clients import check_api_keys, call_model, OPENROUTER_BASE_URL
from .models import list_models as _list_models, estimate_cost
import os


def tool_check_config() -> dict:
    """Check which API keys are configured and system readiness."""
    return check_api_keys()


def tool_list_models() -> dict:
    """List available models with costs and strengths."""
    return {"models": _list_models()}


async def tool_consult_model(
    prompt: str,
    model: str,
    role: str = "general",
) -> dict:
    """Send a prompt to one external LLM via OpenRouter.

    Args:
        prompt: The question or analysis request
        model: OpenRouter model ID (e.g. "openai/gpt-5-2")
        role: Expert role for the model (e.g. "security expert")

    Returns:
        Dict with response text, token counts, and cost.
    """
    keys = check_api_keys()
    if not keys["ready"]:
        return {
            "error": "No API key configured. Set OPENROUTER_API_KEY or OPENAI_API_KEY + GOOGLE_API_KEY.",
            "model": model,
        }

    openrouter_key = os.environ.get("OPENROUTER_API_KEY")
    if openrouter_key:
        client = AsyncOpenAI(api_key=openrouter_key, base_url=OPENROUTER_BASE_URL)
    else:
        openai_key = os.environ.get("OPENAI_API_KEY")
        client = AsyncOpenAI(api_key=openai_key)

    return await call_model(client, model, prompt, role)
