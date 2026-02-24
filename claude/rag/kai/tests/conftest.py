"""Configure test paths so kai modules are importable."""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
