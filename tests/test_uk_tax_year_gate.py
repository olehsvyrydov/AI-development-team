from datetime import date

import pytest

TODAY = date(2026, 10, 18)
FIRST_GRACE_DAY = date(2027, 4, 6)
LAST_GRACE_DAY = date(2027, 5, 5)
FIRST_DAY_AFTER_GRACE = date(2027, 5, 6)


def verified_line(day: date = TODAY) -> str:
    return f"> Verified against GOV.UK on {day.isoformat()}.\n"


def table_with(label: str, verified_day: date = TODAY) -> str:
    return f"{verified_line(verified_day)}\n| Band | {label} |\n"


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
    report = run_uk_tax_year_gate(table_with("2025/26 *(current)*"), TODAY)

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
        "2025–26 (current)",
        "2025—26 (current)",
        "2025/2026 (current)",
        "2025-2026 (current)",
        "2025–2026 *(current)*",
        "2025/26 (current tax year)",
        "2025/26 (current year)",
        "2025/26 *(Current Tax Year)*",
        "FY2025/26 (current)",
        "FY 2025/26 (current)",
        "2025/26: (current)",
        "2025/26 – (current)",
        "2025/26 - (current)",
        "2025/26 — *(current)*",
        "2025/26 ( current )",
        "2025/26 (current )",
    ],
)
def test_stale_current_label_is_caught_in_every_spelling(
    run_uk_tax_year_gate, stale_label
):
    report = run_uk_tax_year_gate(table_with(stale_label), TODAY)

    assert len(report.failures) == 1
    assert "'2025/26'" in report.failures[0]


@pytest.mark.parametrize("hyphenated", ["2025-26", "2025–26", "2025/2026"])
def test_stale_label_is_reported_in_slash_form(run_uk_tax_year_gate, hyphenated):
    report = run_uk_tax_year_gate(table_with(f"{hyphenated} (current)"), TODAY)

    assert "'2025/26'" in report.failures[0]
    assert "'2026/27'" in report.failures[0]


def test_failure_names_file_line_found_label_and_expected_label(
    run_uk_tax_year_gate, compliance_dir
):
    report = run_uk_tax_year_gate(table_with("2025/26 *(current)*"), TODAY)

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
        "2026–27 (current)",
        "2026/2027 (current)",
        "2026/27 (current tax year)",
        "2026/27 (current year)",
        "FY2026/27 (current)",
        "2026/27: (current)",
        "2026/27 – (current)",
        "2026/27 ( current )",
    ],
)
def test_correct_current_label_passes_in_every_spelling(
    run_uk_tax_year_gate, current_label
):
    report = run_uk_tax_year_gate(table_with(f"2025/26 | {current_label}"), TODAY)

    assert report.failures == []


@pytest.mark.parametrize("bad_label", ["2025/27", "2025/2027", "2025–28", "2025/24"])
def test_label_whose_end_year_does_not_follow_its_start_year_fails(
    run_uk_tax_year_gate, bad_label
):
    report = run_uk_tax_year_gate(table_with(f"{bad_label} (current)"), TODAY)

    assert len(report.failures) == 1
    assert "not a tax-year label" in report.failures[0]


@pytest.mark.parametrize(
    "not_a_label",
    [
        "Checked 2025-10-18 (current) as of today",
        "Reported 2025-10 (current) in the ledger",
        "Order 12025/26 (current)",
        "Checked 2025-10-18 - (current) as of today",
        "Checked 2025-10-18: (current) as of today",
    ],
)
def test_dates_and_other_digit_runs_are_not_mistaken_for_labels(
    run_uk_tax_year_gate, not_a_label
):
    report = run_uk_tax_year_gate(f"{not_a_label}\n", TODAY)

    assert report.failures == []


def test_historical_and_future_labels_without_current_marker_are_ignored(
    run_uk_tax_year_gate,
):
    report = run_uk_tax_year_gate(
        f"{verified_line()}\n| 2024/25 | 2025/26 | 2027/28 |\n", TODAY
    )

    assert report.failures == []


def test_every_stale_label_on_a_line_is_reported(run_uk_tax_year_gate):
    report = run_uk_tax_year_gate(
        table_with("2025/26 *(current)* | 2024/25 *(current)*"), TODAY
    )

    assert len(report.failures) == 2


def test_label_for_2026_27_passes_on_last_day_of_the_tax_year(run_uk_tax_year_gate):
    report = run_uk_tax_year_gate(
        table_with("2026/27 *(current)*"), date(2027, 4, 5)
    )

    assert report.failures == []
    assert report.warnings == []


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


def test_stale_label_in_prose_is_caught_without_requiring_a_verified_line(
    run_uk_tax_year_gate,
):
    report = run_uk_tax_year_gate("Rates for 2025/26 (current) apply.\n", TODAY)

    assert len(report.failures) == 1
    assert "marks '2025/26'" in report.failures[0]


def test_verified_date_on_the_first_day_of_the_current_tax_year_passes(
    run_uk_tax_year_gate,
):
    report = run_uk_tax_year_gate(verified_line(date(2026, 4, 6)), TODAY)

    assert report.failures == []


def test_verified_date_equal_to_today_passes(run_uk_tax_year_gate):
    report = run_uk_tax_year_gate(verified_line(TODAY), TODAY)

    assert report.failures == []


def test_verified_date_before_the_current_tax_year_fails(
    run_uk_tax_year_gate, compliance_dir
):
    report = run_uk_tax_year_gate(verified_line(date(2026, 4, 5)), TODAY)

    assert len(report.failures) == 1
    assert f"{compliance_dir}/rates.md:1" in report.failures[0]
    assert "2026-04-06" in report.failures[0]


def test_verified_date_after_today_fails(run_uk_tax_year_gate):
    report = run_uk_tax_year_gate(verified_line(date(2026, 10, 19)), TODAY)

    assert len(report.failures) == 1
    assert "future" in report.failures[0]


@pytest.mark.parametrize(
    "line",
    [
        "> Verified against GOV.UK on 2026-10-18.",
        "*Verified against GOV.UK on 2026-10-18.*",
        "_Verified against GOV.UK on 2026-10-18_",
        "**Verified against GOV.UK on 2026-10-18**",
        "| Verified against GOV.UK on 2026-10-18 |",
        "Verified against GOV.UK on 2026-10-18 (income tax page)",
        "Verified against GOV.UK on: 2026-10-18",
        "Verified against GOV.UK on 2026-10-18, rates page.",
    ],
)
def test_verified_date_is_found_through_markdown_wrapping_and_trailing_text(
    run_uk_tax_year_gate, line
):
    report = run_uk_tax_year_gate(f"{line}\n", TODAY)

    assert report.failures == []


@pytest.mark.parametrize(
    "line",
    [
        "> Verified against GOV.UK on 18/10/2026",
        "> Verified against GOV.UK on 2026-13-45",
        "> Verified against GOV.UK on 2026-02-30",
        "> Verified against GOV.UK on October 2026",
        "> Verified against GOV.UK on 20261018",
        "> Verified against GOV.UK on",
        "*Verified against GOV.UK on 18/10/2026.*",
        "| Verified against GOV.UK on 2026-10 |",
    ],
)
def test_verified_line_without_a_valid_iso_date_fails(
    run_uk_tax_year_gate, line, compliance_dir
):
    report = run_uk_tax_year_gate(f"{line}\n", TODAY)

    assert len(report.failures) == 1
    assert f"{compliance_dir}/rates.md:1" in report.failures[0]


def test_stale_label_on_the_first_day_of_the_grace_period_warns_and_passes(
    run_uk_tax_year_gate,
):
    report = run_uk_tax_year_gate(
        table_with("2026/27 *(current)*", date(2027, 4, 6)), FIRST_GRACE_DAY
    )

    assert report.failures == []
    assert len(report.warnings) == 1
    assert "'2026/27'" in report.warnings[0]


def test_stale_label_on_the_last_day_of_the_grace_period_warns_and_passes(
    run_uk_tax_year_gate,
):
    report = run_uk_tax_year_gate(
        table_with("2026/27 *(current)*", LAST_GRACE_DAY), LAST_GRACE_DAY
    )

    assert report.failures == []
    assert len(report.warnings) == 1


def test_stale_label_fails_on_the_first_day_after_the_grace_period(
    run_uk_tax_year_gate,
):
    report = run_uk_tax_year_gate(
        table_with("2026/27 *(current)*", FIRST_DAY_AFTER_GRACE),
        FIRST_DAY_AFTER_GRACE,
    )

    assert len(report.failures) == 1
    assert report.warnings == []


def test_grace_warning_names_the_date_by_which_to_refresh(run_uk_tax_year_gate):
    report = run_uk_tax_year_gate(
        table_with("2026/27 *(current)*", FIRST_GRACE_DAY), FIRST_GRACE_DAY
    )

    assert "refresh before 6 May" in report.warnings[0]
    assert "grace period" in report.warnings[0]


def test_stale_label_outside_the_rollover_fails_with_no_grace(run_uk_tax_year_gate):
    report = run_uk_tax_year_gate(
        table_with("2025/26 *(current)*"), date(2026, 10, 18)
    )

    assert len(report.failures) == 1
    assert report.warnings == []


def test_verified_date_before_the_tax_year_start_warns_during_the_grace_period(
    run_uk_tax_year_gate,
):
    report = run_uk_tax_year_gate(verified_line(date(2027, 4, 5)), FIRST_GRACE_DAY)

    assert report.failures == []
    assert len(report.warnings) == 1


def test_verified_date_before_the_tax_year_start_fails_after_the_grace_period(
    run_uk_tax_year_gate,
):
    report = run_uk_tax_year_gate(
        verified_line(date(2027, 4, 5)), FIRST_DAY_AFTER_GRACE
    )

    assert len(report.failures) == 1


def test_future_verified_date_fails_even_during_the_grace_period(
    run_uk_tax_year_gate,
):
    report = run_uk_tax_year_gate(
        verified_line(date(2027, 4, 7)), FIRST_GRACE_DAY
    )

    assert len(report.failures) == 1
    assert "future" in report.failures[0]


def test_malformed_verified_date_fails_even_during_the_grace_period(
    run_uk_tax_year_gate,
):
    report = run_uk_tax_year_gate(
        "> Verified against GOV.UK on 06/04/2027\n", FIRST_GRACE_DAY
    )

    assert len(report.failures) == 1


def test_labelled_table_without_a_verified_line_fails(
    run_uk_tax_year_gate, compliance_dir
):
    report = run_uk_tax_year_gate("| Band | 2026/27 *(current)* |\n", TODAY)

    assert len(report.failures) == 1
    assert f"{compliance_dir}/rates.md:1" in report.failures[0]
    assert "Verified against GOV.UK on" in report.failures[0]


def test_labelled_table_with_a_verified_line_directly_above_passes(
    run_uk_tax_year_gate,
):
    report = run_uk_tax_year_gate(table_with("2026/27 *(current)*"), TODAY)

    assert report.failures == []


def test_verified_line_above_a_table_counts_across_several_blank_lines(
    run_uk_tax_year_gate,
):
    report = run_uk_tax_year_gate(
        f"{verified_line()}\n\n\n| Band | 2026/27 *(current)* |\n", TODAY
    )

    assert report.failures == []


def test_verified_line_separated_from_the_table_by_a_paragraph_does_not_count(
    run_uk_tax_year_gate,
):
    report = run_uk_tax_year_gate(
        f"{verified_line()}\nSome notes.\n\n| Band | 2026/27 *(current)* |\n", TODAY
    )

    assert len(report.failures) == 1


def test_verified_line_below_the_table_does_not_count(run_uk_tax_year_gate):
    report = run_uk_tax_year_gate(
        f"| Band | 2026/27 *(current)* |\n\n{verified_line()}", TODAY
    )

    assert len(report.failures) == 1


def test_verified_line_of_a_previous_table_does_not_cover_the_next_table(
    run_uk_tax_year_gate,
):
    report = run_uk_tax_year_gate(
        f"{table_with('2026/27 *(current)*')}\nMore text.\n\n| Band | 2026/27 *(current)* |\n",
        TODAY,
    )

    assert len(report.failures) == 1


def test_table_with_several_labelled_rows_is_checked_once(run_uk_tax_year_gate):
    report = run_uk_tax_year_gate(
        "| Band | 2026/27 *(current)* |\n|---|---|\n| Rate | 2026/27 (current) |\n",
        TODAY,
    )

    assert len(report.failures) == 1


def test_table_without_a_current_label_needs_no_verified_line(run_uk_tax_year_gate):
    report = run_uk_tax_year_gate("| Band | 2025/26 | 2026/27 |\n", TODAY)

    assert report.failures == []
