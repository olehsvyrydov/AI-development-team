def test_each_report_collects_only_its_own_failures(validator):
    first, second = validator.Report(), validator.Report()

    first.fail("G9 example", "broken")

    assert first.failures == ["G9 example: broken"]
    assert second.failures == []


def test_warnings_are_collected_separately_from_failures(validator):
    report = validator.Report()

    report.warn("G9 example", "ageing")

    assert report.warnings == ["G9 example: ageing"]
    assert report.failures == []


def test_credentials_gate_flags_an_injected_key_file(validator, report, tmp_path):
    validator.gate_credentials(report, root=tmp_path, files=["deploy/server.pem"])

    assert len(report.failures) == 1
    assert "deploy/server.pem" in report.failures[0]


def test_credentials_gate_passes_an_injected_clean_file_list(validator, report, tmp_path):
    validator.gate_credentials(report, root=tmp_path, files=["README.md"])

    assert report.failures == []


def test_retired_gate_reads_injected_files_from_the_injected_root(
    validator, report, plant, tmp_path
):
    note = plant("claude/skills/x/notes.md", "see commands/retro.md\n")

    validator.gate_retired(report, root=tmp_path, files=[note])

    assert len(report.failures) == 1
    assert "G6 retired" in report.failures[0]
