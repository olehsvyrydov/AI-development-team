from datetime import date

import pytest

TODAY = date(2026, 10, 18)


@pytest.mark.parametrize(
    ("day", "expected"),
    [
        (date(2026, 4, 5), "2025/26"),
        (date(2026, 4, 6), "2026/27"),
        (date(2026, 10, 18), "2026/27"),
        (date(2027, 4, 5), "2026/27"),
        (date(2027, 4, 6), "2027/28"),
        (date(2027, 1, 1), "2026/27"),
        (date(2099, 4, 6), "2099/00"),
    ],
)
def test_uk_tax_year_starts_on_6_april(validator, day, expected):
    assert validator.uk_tax_year(day) == expected


@pytest.mark.parametrize(
    ("day", "expected"),
    [
        (date(2026, 4, 5), date(2025, 4, 6)),
        (date(2026, 4, 6), date(2026, 4, 6)),
        (date(2026, 10, 18), date(2026, 4, 6)),
        (date(2027, 4, 5), date(2026, 4, 6)),
        (date(2027, 4, 6), date(2027, 4, 6)),
    ],
)
def test_uk_tax_year_start_is_the_6_april_on_or_before_the_day(
    validator, day, expected
):
    assert validator.uk_tax_year_start(day) == expected


def test_stale_current_label_fails_in_tax_year_2026_27(run_uk_tax_year_gate):
    report = run_uk_tax_year_gate("| Band | 2025/26 *(current)* |\n", TODAY)

    assert len(report.failures) == 1
    assert "2025/26" in report.failures[0]
    assert "2026/27" in report.failures[0]


@pytest.mark.parametrize(
    "stale_label",
    [
        "2025/26 (current)",
        "**2025/26** *(current)*",
        "2025/26* (current)",
        "2025/26 _(current)_",
        "2025/26 (Current)",
        "2025-26 (current)",
    ],
)
def test_stale_current_label_is_caught_in_every_markdown_spelling(
    run_uk_tax_year_gate, stale_label
):
    report = run_uk_tax_year_gate(f"| Band | {stale_label} |\n", TODAY)

    assert len(report.failures) == 1
    assert "'2025/26'" in report.failures[0]


def test_hyphenated_stale_label_is_reported_in_slash_form(run_uk_tax_year_gate):
    report = run_uk_tax_year_gate("| 2025-26 (current) |\n", TODAY)

    assert "'2025/26'" in report.failures[0]
    assert "'2026/27'" in report.failures[0]


def test_failure_names_file_line_found_label_and_expected_label(
    run_uk_tax_year_gate, compliance_dir
):
    report = run_uk_tax_year_gate("intro\n\n| Band | 2025/26 *(current)* |\n", TODAY)

    assert f"{compliance_dir}/rates.md:3" in report.failures[0]
    assert "'2025/26'" in report.failures[0]
    assert "'2026/27'" in report.failures[0]


@pytest.mark.parametrize(
    "current_label",
    [
        "2026/27 *(current)*",
        "2026/27 (current)",
        "**2026/27** *(current)*",
        "2026-27 (Current)",
    ],
)
def test_correct_current_label_passes_in_every_markdown_spelling(
    run_uk_tax_year_gate, current_label
):
    report = run_uk_tax_year_gate(f"| 2025/26 | {current_label} |\n", TODAY)

    assert report.failures == []


def test_historical_and_future_labels_without_current_marker_are_ignored(
    run_uk_tax_year_gate,
):
    report = run_uk_tax_year_gate("| 2024/25 | 2025/26 | 2027/28 |\n", TODAY)

    assert report.failures == []


def test_iso_dates_followed_by_current_are_not_mistaken_for_labels(
    run_uk_tax_year_gate,
):
    report = run_uk_tax_year_gate("Checked 2025-10-18 (current) as of today\n", TODAY)

    assert report.failures == []


def test_every_stale_label_on_a_line_is_reported(run_uk_tax_year_gate):
    report = run_uk_tax_year_gate(
        "| 2024/25 *(current)* | 2025/26 *(current)* |\n", TODAY
    )

    assert len(report.failures) == 2


def test_label_for_2026_27_passes_on_last_day_of_the_tax_year(run_uk_tax_year_gate):
    report = run_uk_tax_year_gate("| 2026/27 *(current)* |\n", date(2027, 4, 5))

    assert report.failures == []


def test_label_for_2026_27_goes_stale_on_2027_04_06(run_uk_tax_year_gate):
    report = run_uk_tax_year_gate("| 2026/27 *(current)* |\n", date(2027, 4, 6))

    assert len(report.failures) == 1
    assert "'2027/28'" in report.failures[0]


def test_stale_label_outside_the_compliance_skills_is_ignored(
    validator, report, plant, tmp_path
):
    outside = plant("claude/skills/development/backend/notes.md", "2025/26 *(current)*\n")

    validator.gate_uk_tax_year(report, root=tmp_path, files=[outside], today=TODAY)

    assert report.failures == []


def test_stale_label_in_a_non_markdown_compliance_file_is_ignored(
    validator, report, plant, tmp_path, compliance_dir
):
    outside = plant(f"{compliance_dir}/rates.txt", "2025/26 *(current)*\n")

    validator.gate_uk_tax_year(report, root=tmp_path, files=[outside], today=TODAY)

    assert report.failures == []


def test_verified_date_on_the_first_day_of_the_current_tax_year_passes(
    run_uk_tax_year_gate,
):
    report = run_uk_tax_year_gate("> Verified against GOV.UK on 2026-04-06.\n", TODAY)

    assert report.failures == []


def test_verified_date_equal_to_today_passes(run_uk_tax_year_gate):
    report = run_uk_tax_year_gate("> Verified against GOV.UK on 2026-10-18.\n", TODAY)

    assert report.failures == []


def test_verified_date_before_the_current_tax_year_fails(
    run_uk_tax_year_gate, compliance_dir
):
    report = run_uk_tax_year_gate("> Verified against GOV.UK on 2026-04-05.\n", TODAY)

    assert len(report.failures) == 1
    assert f"{compliance_dir}/rates.md:1" in report.failures[0]
    assert "2026-04-06" in report.failures[0]


def test_verified_date_goes_stale_when_the_tax_year_rolls_over(run_uk_tax_year_gate):
    report = run_uk_tax_year_gate(
        "> Verified against GOV.UK on 2027-04-05.\n", date(2027, 4, 6)
    )

    assert len(report.failures) == 1


def test_verified_date_after_today_fails(run_uk_tax_year_gate):
    report = run_uk_tax_year_gate("> Verified against GOV.UK on 2026-10-19.\n", TODAY)

    assert len(report.failures) == 1
    assert "future" in report.failures[0]


@pytest.mark.parametrize(
    "malformed",
    ["18/10/2026", "2026-13-45", "2026-02-30", "October 2026", "20261018", ""],
)
def test_malformed_verified_date_fails(run_uk_tax_year_gate, malformed, compliance_dir):
    report = run_uk_tax_year_gate(
        f"> Verified against GOV.UK on {malformed}\n", TODAY
    )

    assert len(report.failures) == 1
    assert f"{compliance_dir}/rates.md:1" in report.failures[0]
