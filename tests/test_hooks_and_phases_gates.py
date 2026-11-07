import json

import pytest

from conftest import REPO_ROOT

HOOKS_FILE = "claude/hooks/hooks.json"
WORKFLOW_FILES = (
    "claude/workflow/workflow.yaml",
    "examples/demo/.aidevteam/workflow.yaml",
)


def hooks_manifest(command_args):
    return {
        "hooks": {
            "PreToolUse": [
                {
                    "matcher": "Bash",
                    "hooks": [
                        {"type": "command", "command": "python3", "args": command_args}
                    ],
                }
            ]
        }
    }


def test_hooks_gate_passes_when_every_plugin_path_exists(validator, report, plant, tmp_path):
    plant("claude/hooks/commit_gate.py", "")
    plant(HOOKS_FILE, json.dumps(hooks_manifest(["${CLAUDE_PLUGIN_ROOT}/hooks/commit_gate.py"])))

    validator.gate_hooks(report, root=tmp_path)

    assert report.failures == []


def test_hooks_gate_fails_when_a_plugin_path_does_not_exist(validator, report, plant, tmp_path):
    plant(HOOKS_FILE, json.dumps(hooks_manifest(["${CLAUDE_PLUGIN_ROOT}/hooks/gone.py"])))

    validator.gate_hooks(report, root=tmp_path)

    assert len(report.failures) == 1
    assert "G9 hooks" in report.failures[0]
    assert "hooks/gone.py" in report.failures[0]


def test_hooks_gate_fails_when_a_plugin_path_escapes_the_plugin_directory(
    validator, report, plant, tmp_path
):
    plant("outside.py", "")
    plant(HOOKS_FILE, json.dumps(hooks_manifest(["${CLAUDE_PLUGIN_ROOT}/../outside.py"])))

    validator.gate_hooks(report, root=tmp_path)

    assert len(report.failures) == 1


def test_hooks_gate_fails_when_the_file_is_missing(validator, report, tmp_path):
    validator.gate_hooks(report, root=tmp_path)

    assert len(report.failures) == 1
    assert HOOKS_FILE in report.failures[0]


def test_hooks_gate_fails_on_invalid_json(validator, report, plant, tmp_path):
    plant(HOOKS_FILE, "{not json")

    validator.gate_hooks(report, root=tmp_path)

    assert len(report.failures) == 1
    assert "invalid JSON" in report.failures[0]


@pytest.mark.parametrize("content", ["[]", "{}", '{"hooks": []}', '{"hooks": "none"}'])
def test_hooks_gate_fails_without_a_top_level_hooks_object(
    validator, report, plant, tmp_path, content
):
    plant(HOOKS_FILE, content)

    validator.gate_hooks(report, root=tmp_path)

    assert len(report.failures) == 1
    assert "hooks" in report.failures[0]


def test_hooks_gate_checks_paths_in_the_command_string_as_well(
    validator, report, plant, tmp_path
):
    manifest = hooks_manifest([])
    manifest["hooks"]["PreToolUse"][0]["hooks"][0]["command"] = (
        "python3 ${CLAUDE_PLUGIN_ROOT}/hooks/gone.py"
    )
    plant(HOOKS_FILE, json.dumps(manifest))

    validator.gate_hooks(report, root=tmp_path)

    assert len(report.failures) == 1


def test_the_shipped_hooks_manifest_passes_the_hooks_gate(validator, report):
    validator.gate_hooks(report, root=REPO_ROOT)

    assert report.failures == []


def test_the_shipped_hooks_manifest_runs_one_handler_on_every_bash_call():
    entries = json.loads((REPO_ROOT / HOOKS_FILE).read_text(encoding="utf-8"))["hooks"]["PreToolUse"]

    assert len(entries) == 1
    assert entries[0]["matcher"] == "Bash"
    assert entries[0]["hooks"] == [
        {
            "type": "command",
            "command": "python3",
            "args": ["${CLAUDE_PLUGIN_ROOT}/hooks/commit_gate.py"],
            "timeout": 5,
        }
    ]


def test_hooks_gate_passes_with_a_note_only_on_success(validator, report, plant, tmp_path):
    plant("claude/hooks/commit_gate.py", "")
    plant(HOOKS_FILE, json.dumps(hooks_manifest(["${CLAUDE_PLUGIN_ROOT}/hooks/commit_gate.py"])))

    validator.gate_hooks(report, root=tmp_path)

    assert report.notes == ["G9 hooks: manifest parses, 1 plugin path(s) exist"]


def test_hooks_gate_fails_without_any_plugin_path_and_adds_no_success_note(
    validator, report, plant, tmp_path
):
    plant(HOOKS_FILE, json.dumps(hooks_manifest(["--version"])))

    validator.gate_hooks(report, root=tmp_path)

    assert len(report.failures) == 1
    assert "CLAUDE_PLUGIN_ROOT" in report.failures[0]
    assert report.notes == []


def test_hooks_gate_adds_no_success_note_when_a_path_is_missing(validator, report, plant, tmp_path):
    plant(HOOKS_FILE, json.dumps(hooks_manifest(["${CLAUDE_PLUGIN_ROOT}/hooks/gone.py"])))

    validator.gate_hooks(report, root=tmp_path)

    assert report.notes == []


@pytest.mark.parametrize("matcher", ["Write", "bash", None])
def test_hooks_gate_requires_a_pre_tool_use_entry_for_bash(
    validator, report, plant, tmp_path, matcher
):
    plant("claude/hooks/commit_gate.py", "")
    manifest = hooks_manifest(["${CLAUDE_PLUGIN_ROOT}/hooks/commit_gate.py"])
    manifest["hooks"]["PreToolUse"][0]["matcher"] = matcher
    plant(HOOKS_FILE, json.dumps(manifest))

    validator.gate_hooks(report, root=tmp_path)

    assert len(report.failures) == 1
    assert "PreToolUse" in report.failures[0]
    assert report.notes == []


def test_hooks_gate_requires_the_bash_entry_under_pre_tool_use_not_another_event(
    validator, report, plant, tmp_path
):
    plant("claude/hooks/commit_gate.py", "")
    manifest = hooks_manifest(["${CLAUDE_PLUGIN_ROOT}/hooks/commit_gate.py"])
    manifest["hooks"] = {"PostToolUse": manifest["hooks"]["PreToolUse"]}
    plant(HOOKS_FILE, json.dumps(manifest))

    validator.gate_hooks(report, root=tmp_path)

    assert len(report.failures) == 1
    assert "PreToolUse" in report.failures[0]


def valid_gate(**overrides):
    return {"owner": "/arch", "refusal": "hard", "phase": "pre_implementation", **overrides}


def schema_with_phase():
    return {
        "properties": {
            "gates": {
                "additionalProperties": {
                    "required": ["owner", "refusal", "phase"],
                    "properties": {
                        "phase": {"type": "string", "enum": ["pre_implementation", "pre_done"]}
                    },
                }
            }
        }
    }


def plant_workflow(plant, gates, schema=None):
    import yaml

    for path in WORKFLOW_FILES:
        plant(path, yaml.safe_dump({"gates": gates}))
    plant("claude/workflow/workflow.schema.json", json.dumps(schema or schema_with_phase()))


def test_phases_gate_passes_when_every_gate_has_a_valid_phase(validator, report, plant, tmp_path):
    plant_workflow(plant, {"ARCH_APPROVED": valid_gate(), "CODE_REVIEWED": valid_gate(phase="pre_done")})

    validator.gate_workflow_phases(report, root=tmp_path)

    assert report.failures == []


@pytest.mark.parametrize("phase", ["pre_review", "PRE_DONE", None, 1])
def test_phases_gate_fails_on_an_invalid_phase_in_each_workflow_file(
    validator, report, plant, tmp_path, phase
):
    plant_workflow(plant, {"ARCH_APPROVED": valid_gate(phase=phase)})

    validator.gate_workflow_phases(report, root=tmp_path)

    assert len(report.failures) == len(WORKFLOW_FILES)
    assert all("ARCH_APPROVED" in failure for failure in report.failures)


def test_phases_gate_fails_on_a_gate_without_a_phase(validator, report, plant, tmp_path):
    gate = valid_gate()
    del gate["phase"]
    plant_workflow(plant, {"ARCH_APPROVED": gate})

    validator.gate_workflow_phases(report, root=tmp_path)

    assert len(report.failures) == len(WORKFLOW_FILES)


@pytest.mark.parametrize("gates", [None, [], "ARCH_APPROVED", 3, ["ARCH_APPROVED"]])
def test_phases_gate_reports_gates_that_are_not_a_mapping_without_crashing(
    validator, report, plant, tmp_path, gates
):
    plant_workflow(plant, gates)

    validator.gate_workflow_phases(report, root=tmp_path)

    assert len(report.failures) == len(WORKFLOW_FILES)
    assert all("G10 phases" in failure and "gates" in failure for failure in report.failures)


def test_phases_gate_reports_a_gate_that_is_not_a_mapping_without_crashing(
    validator, report, plant, tmp_path
):
    plant_workflow(plant, {"ARCH_APPROVED": "hard"})

    validator.gate_workflow_phases(report, root=tmp_path)

    assert len(report.failures) == len(WORKFLOW_FILES)


def test_phases_gate_fails_when_the_schema_does_not_require_a_phase(
    validator, report, plant, tmp_path
):
    schema = schema_with_phase()
    schema["properties"]["gates"]["additionalProperties"]["required"] = ["owner", "refusal"]
    plant_workflow(plant, {"ARCH_APPROVED": valid_gate()}, schema)

    validator.gate_workflow_phases(report, root=tmp_path)

    assert len(report.failures) == 1
    assert "workflow.schema.json" in report.failures[0]


def test_phases_gate_fails_when_the_schema_phase_enum_differs(validator, report, plant, tmp_path):
    schema = schema_with_phase()
    schema["properties"]["gates"]["additionalProperties"]["properties"]["phase"]["enum"] = ["any"]
    plant_workflow(plant, {"ARCH_APPROVED": valid_gate()}, schema)

    validator.gate_workflow_phases(report, root=tmp_path)

    assert len(report.failures) == 1


def test_shipped_workflow_files_pass_the_phases_gate(validator, report):
    validator.gate_workflow_phases(report, root=REPO_ROOT)

    assert report.failures == []


EXPECTED_PHASES = {
    "ARCH_APPROVED": ("hard", "pre_implementation"),
    "SECOPS_APPROVED": ("hard", "pre_implementation"),
    "DESIGN_APPROVED": ("soft", "pre_implementation"),
    "APPROVAL_GATE": ("hard", "pre_implementation"),
    "CODE_REVIEWED": ("hard", "pre_done"),
    "PERF_OK": ("soft", "pre_done"),
    "VERIFIED": ("hard", "pre_done"),
    "RELIABILITY_OK": ("soft", "pre_done"),
}


@pytest.mark.parametrize("path", WORKFLOW_FILES)
def test_each_shipped_gate_has_the_documented_refusal_and_phase(path):
    import yaml

    gates = yaml.safe_load((REPO_ROOT / path).read_text(encoding="utf-8"))["gates"]

    assert {name: (gate["refusal"], gate["phase"]) for name, gate in gates.items()} == EXPECTED_PHASES
