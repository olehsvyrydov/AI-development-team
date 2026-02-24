"""FastMCP server for multi-LLM consultation."""

from mcp.server.fastmcp import FastMCP

from .tools import tool_check_config, tool_list_models, tool_consult_model

mcp = FastMCP(name="multi-llm-consult")


@mcp.tool()
def check_config() -> str:
    """Check which API keys are configured and system readiness.

    Returns JSON with status of each API key and overall readiness.
    """
    import json
    return json.dumps(tool_check_config(), indent=2)


@mcp.tool()
def list_models() -> str:
    """List available LLM models with costs and strengths.

    Returns a table of models from OpenAI, Google, xAI, Meta, DeepSeek
    with context window sizes, pricing, and recommended use cases.
    """
    import json
    return json.dumps(tool_list_models(), indent=2)


@mcp.tool()
async def consult_model(prompt: str, model: str, role: str = "general") -> str:
    """Send a prompt to one external LLM and get its response.

    Args:
        prompt: The question or analysis request to send
        model: OpenRouter model ID (e.g. "openai/gpt-5-2", "google/gemini-3-1-pro")
        role: Expert role context (e.g. "security expert", "database architect")

    Returns JSON with response text, token usage, and cost estimate.
    """
    import json
    result = await tool_consult_model(prompt, model, role)
    return json.dumps(result, indent=2)
