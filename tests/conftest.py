import importlib.util
import sys
from datetime import date
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
VALIDATOR_PATH = REPO_ROOT / "scripts" / "validate-framework.py"
COMPLIANCE_DIR = "claude/skills/compliance/accountant/references"


@pytest.fixture(scope="session")
def validator():
    spec = importlib.util.spec_from_file_location("validate_framework", VALIDATOR_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def report(validator):
    return validator.Report()


@pytest.fixture
def compliance_dir():
    return COMPLIANCE_DIR


@pytest.fixture
def plant(tmp_path):
    def write(relative_path: str, text: str) -> str:
        target = tmp_path / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
        return relative_path

    return write


@pytest.fixture
def run_uk_tax_year_gate(validator, report, plant, tmp_path):
    def run(text: str, today: date, relative_path: str = f"{COMPLIANCE_DIR}/rates.md"):
        plant(relative_path, text)
        validator.gate_uk_tax_year(
            report, root=tmp_path, files=[relative_path], today=today
        )
        return report

    return run
