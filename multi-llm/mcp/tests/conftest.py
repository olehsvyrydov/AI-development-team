"""Shared fixtures for multi-llm MCP tests."""

import os

import pytest


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    """Ensure API keys don't leak from real environment into tests."""
    for key in ("OPENROUTER_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "XAI_API_KEY"):
        monkeypatch.delenv(key, raising=False)
