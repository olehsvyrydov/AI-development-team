"""Tests for API clients."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from consult_mcp.clients import (
    create_client,
    call_model,
    check_api_keys,
)


class TestCheckApiKeys:
    def test_no_keys_set(self):
        result = check_api_keys()
        assert result["openrouter"] is False
        assert result["ready"] is False

    def test_openrouter_key_set(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
        result = check_api_keys()
        assert result["openrouter"] is True
        assert result["ready"] is True

    def test_direct_keys_set(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "test-key")
        monkeypatch.setenv("GOOGLE_API_KEY", "test-key")
        result = check_api_keys()
        assert result["openai_direct"] is True
        assert result["google_direct"] is True
        assert result["ready"] is True


class TestCreateClient:
    def test_creates_openrouter_client(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
        client = create_client()
        assert client is not None

    def test_raises_without_keys(self):
        with pytest.raises(ValueError, match="No API key"):
            create_client()


class TestCallModel:
    @pytest.mark.asyncio
    async def test_returns_response_dict(self):
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Test response from GPT"
        mock_response.usage = MagicMock()
        mock_response.usage.prompt_tokens = 100
        mock_response.usage.completion_tokens = 50

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        result = await call_model(
            client=mock_client,
            model_id="openai/gpt-5-2",
            prompt="Test prompt",
            role="general",
        )
        assert result["response"] == "Test response from GPT"
        assert result["model"] == "openai/gpt-5-2"
        assert result["input_tokens"] == 100
        assert result["output_tokens"] == 50
        assert "cost" in result

    @pytest.mark.asyncio
    async def test_handles_api_error(self):
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(side_effect=Exception("API Error"))

        result = await call_model(
            client=mock_client,
            model_id="openai/gpt-5-2",
            prompt="Test prompt",
            role="general",
        )
        assert "error" in result
        assert result["model"] == "openai/gpt-5-2"

    @pytest.mark.asyncio
    async def test_includes_system_role(self):
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Response"
        mock_response.usage = MagicMock(prompt_tokens=50, completion_tokens=25)

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        await call_model(
            client=mock_client,
            model_id="openai/gpt-5-2",
            prompt="Review this code",
            role="security expert",
        )

        call_args = mock_client.chat.completions.create.call_args
        messages = call_args.kwargs["messages"]
        assert messages[0]["role"] == "system"
        assert "security expert" in messages[0]["content"]
