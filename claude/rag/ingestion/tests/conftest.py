"""Configure test paths so ingestion modules are importable."""

import sys
import os

# Add the ingestion directory to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
