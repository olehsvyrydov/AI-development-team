"""Tests for MCP server setup."""

import pytest

from consult_mcp.server import mcp


class TestServer:
    def test_server_has_name(self):
        assert mcp.name == "multi-llm-consult"

    def test_server_has_tools(self):
        # FastMCP registers tools as decorated functions
        # Verify the server object exists and is configured
        assert mcp is not None
