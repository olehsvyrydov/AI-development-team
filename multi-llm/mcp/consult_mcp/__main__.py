"""Entry point: python -m consult_mcp"""

from .server import mcp

mcp.run(transport="stdio")
