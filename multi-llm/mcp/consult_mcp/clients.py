"""API client management for multi-LLM consultation.

Routes through OpenRouter (preferred) or direct APIs.
Uses OpenAI SDK with custom base_url for OpenRouter compatibility.
"""

import os

from openai import AsyncOpenAI

from .models import estimate_cost

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def check_api_keys() -> dict:
    """Check which API keys are configured."""
    openrouter = bool(os.environ.get("OPENROUTER_API_KEY"))
    openai_direct = bool(os.environ.get("OPENAI_API_KEY"))
    google_direct = bool(os.environ.get("GOOGLE_API_KEY"))
    xai_direct = bool(os.environ.get("XAI_API_KEY"))

    return {
        "openrouter": openrouter,
        "openai_direct": openai_direct,
        "google_direct": google_direct,
        "xai_direct": xai_direct,
        "ready": openrouter or (openai_direct and google_direct),
    }


def create_client() -> AsyncOpenAI:
    """Create an OpenAI-compatible async client.

    Prefers OpenRouter (single key for all models).
    Falls back to direct OpenAI API.
    """
    openrouter_key = os.environ.get("OPENROUTER_API_KEY")
    if openrouter_key:
        return AsyncOpenAI(
            api_key=openrouter_key,
            base_url=OPENROUTER_BASE_URL,
        )

    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key:
        return AsyncOpenAI(api_key=openai_key)

    raise ValueError(
        "No API key configured. Set OPENROUTER_API_KEY (preferred) "
        "or OPENAI_API_KEY + GOOGLE_API_KEY."
    )


async def call_model(
    client: AsyncOpenAI,
    model_id: str,
    prompt: str,
    role: str = "general",
) -> dict:
    """Send a prompt to one external LLM and return the response.

    Args:
        client: AsyncOpenAI client (OpenRouter or direct)
        model_id: OpenRouter model ID (e.g. "openai/gpt-5-2")
        prompt: The prompt to send
        role: System role description (e.g. "security expert")

    Returns:
        Dict with response, model, tokens, cost, or error.
    """
    try:
        response = await client.chat.completions.create(
            model=model_id,
            messages=[
                {"role": "system", "content": f"You are a {role}. Provide expert analysis."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
        )

        input_tokens = response.usage.prompt_tokens
        output_tokens = response.usage.completion_tokens
        cost = estimate_cost(model_id, input_tokens, output_tokens)

        return {
            "response": response.choices[0].message.content,
            "model": model_id,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost": cost,
        }

    except Exception as e:
        return {
            "error": str(e),
            "model": model_id,
        }
