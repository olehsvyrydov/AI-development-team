"""Kai data models — enums, dataclasses for learnings, patterns, proposals."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum


class ProposalStatus(Enum):
    PENDING = "pending"
    APPROVED = "approved"
    APPLIED = "applied"
    REJECTED = "rejected"


class SectionSafety(Enum):
    SAFE = "safe"
    CAUTIOUS = "cautious"
    UNSAFE = "unsafe"


@dataclass
class Learning:
    point_id: str
    content: str
    agent_name: str | None = None
    learning_type: str | None = None
    stored_at: str | None = None
    score: float = 0.0


@dataclass
class Pattern:
    pattern_id: str
    summary: str
    learnings: list[Learning] = field(default_factory=list)
    agent_name: str = ""
    frequency: int = 0
    confidence: float = 0.0
    recency_days: int = 0


@dataclass
class SkillSection:
    heading: str
    level: int
    content: str
    line_start: int
    line_end: int
    safety: SectionSafety


@dataclass
class Proposal:
    proposal_id: str
    agent_name: str
    skill_file: str
    target_section: str
    section_safety: SectionSafety
    action: str
    content: str
    rationale: str
    source_patterns: list[str] = field(default_factory=list)
    source_learnings: list[str] = field(default_factory=list)
    status: ProposalStatus = ProposalStatus.PENDING
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    quality_checks: dict = field(default_factory=dict)
