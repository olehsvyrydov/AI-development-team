"""Tests for MCP tool implementations."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from consult_mcp.tools import (
    tool_consult_model,
    tool_list_models,
    tool_check_config,
)


class TestToolCheckConfig:
    def test_returns_status(self):
        result = tool_check_config()
        assert "openrouter" in result
        assert "ready" in result

    def test_ready_with_openrouter(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
        result = tool_check_config()
        assert result["ready"] is True


class TestToolListModels:
    def test_returns_model_list(self):
        result = tool_list_models()
        assert "models" in result
        assert len(result["models"]) > 0

    def test_each_model_has_info(self):
        result = tool_list_models()
        for model in result["models"]:
            assert "model_id" in model
            assert "provider" in model
            assert "cost_input" in model
            assert "strengths" in model


class TestToolConsultModel:
    @pytest.mark.asyncio
    async def test_returns_response(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Model says: use PostgreSQL"
        mock_response.usage = MagicMock(prompt_tokens=100, completion_tokens=50)

        with patch("consult_mcp.tools.AsyncOpenAI") as MockClient:
            mock_client = AsyncMock()
            mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
            MockClient.return_value = mock_client

            result = await tool_consult_model(
                prompt="What database should I use?",
                model="openai/gpt-5-2",
                role="database expert",
            )

        assert result["response"] == "Model says: use PostgreSQL"
        assert result["model"] == "openai/gpt-5-2"
        assert "cost" in result

    @pytest.mark.asyncio
    async def test_error_without_api_key(self):
        result = await tool_consult_model(
            prompt="test",
            model="openai/gpt-5-2",
            role="general",
        )
        assert "error" in result

    @pytest.mark.asyncio
    async def test_uses_specified_model(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")

        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Response"
        mock_response.usage = MagicMock(prompt_tokens=50, completion_tokens=25)

        with patch("consult_mcp.tools.AsyncOpenAI") as MockClient:
            mock_client = AsyncMock()
            mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
            MockClient.return_value = mock_client

            await tool_consult_model(
                prompt="test",
                model="google/gemini-3-1-pro",
                role="general",
            )

            call_kwargs = mock_client.chat.completions.create.call_args.kwargs
            assert call_kwargs["model"] == "google/gemini-3-1-pro"
