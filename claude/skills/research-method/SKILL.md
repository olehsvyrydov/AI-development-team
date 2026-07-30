---
name: research-method
description: Run an investigation so its result is trustworthy, and write it up so it survives a hostile reader. Load this when a question needs measuring rather than deciding, when designing an experiment or benchmark, when a result looks good enough to publish, and when drafting an article or pre-registration for a technical community. Covers experiment design, deterministic verification, kill conditions, claims discipline, and the boundary between what the data supports and what it does not.
---

# Investigating honestly, and writing it up

An investigation that could only have produced the answer you wanted is not evidence. This skill is about designing work that can come out against you, and reporting it so that a skeptical reader can check.

## Design

**State the question so it has a wrong answer.** "Does structure improve retrieval?" cannot fail. "Does structure-aware retrieval raise exception retention above the 83% ceiling that flat retrieval imposes on every model tier?" can.

**Pre-register when the result will be used to decide something.** Write hypotheses, effect-size thresholds, and the analysis plan *before* collecting data, and freeze them. After the freeze, a protocol change is a logged deviation and a deviated run cannot satisfy a gate. This converts the weakness of grading your own homework into a commitment — and publishing the protocol before the run is the single most credibility-earning move available to a solo researcher.

**Write kill conditions, and mean them.** Every investigation should name what result would make it stop. The best outcome this project has produced was a FID **cancelled by its own kill condition** — the bake-off showed structure, not model tier, was the lever, so the learned router was never built. A document written so it *can* be cancelled is worth more than one written to be justified.

**Isolate one variable through one pipeline.** Every arm should run the same path with only the thing under test swapped, so a difference is attributable. If arms differ in prompt *and* representation, the result means nothing.

**Prefer deterministic verification over model judgement.** Symbolic checkers — normalised quantity comparison, verbatim span matching, AST checks — remove judge bias, judge cost, and judge variance, and make every number reproducible from recorded responses. The crude-looking check is often exactly right: where the correct answer is near-extractive, identity-up-to-whitespace *is* fidelity. When the task stops being extractive (code generation), say so and replace the metric rather than stretching it.

Note the class of defect a model judge structurally cannot catch: an answer that omits a required qualifier is still *entailed* by its sources, so a grounding judge passes it. Detecting omission needs to know which qualifier was required — which is the knowledge the judge lacks.

**Record responses content-addressed, so re-scoring is free.** Key each call by a hash of its inputs. The paid run happens once; every later analysis is deterministic and costs nothing. This is what makes a result re-checkable rather than a story about a run.

**Cost accounting from the provider's own usage, never price-sheet arithmetic.**

## Interpretation

**Look for the result that would embarrass you.** In the bake-off the striking regularity was that flat retrieval produced *exactly* 10/12 for every model — which located the failure in retrieval rather than in model quality, and meant a bigger model could not fix it. That was more informative than any headline.

**Report the boundary in the same sentence as the claim.** "On retrieval-bound document QA — near-extractive once evidence is in context — retrieval structure, not model scale, determines reliability." Without the clause it becomes a slogan the data does not support.

**Name the measured case that contradicts the thesis.** One model refused with the decisive evidence in front of it. Publishing that is what makes the rest believable, and it identified the knowledge-gap/capability-gap boundary that shaped the next study.

**Limitations belong in full, untrimmed.** Small n, one corpus, a lexical rather than dense embedder, an arm that did not bite on this data. Report proportions and exact counts; do not dress an engineering go/no-go instrument as a significance claim.

## Writing for a technical community

**Lead with method, not economics.** The audience that matters checks *how* you measured. Deterministic verification, arm isolation, content-addressed replay, exact provider-reported costs — these earn the reading; a cost headline invites dismissal.

**Claims discipline — decide in advance what you will never lead with.** Typically: any framing that drops the task-class boundary, any unqualified multiplier, anything implying a general capability claim from a task-specific result. Write the forbidden headlines down; they are easy to slip into under enthusiasm.

**Publish a protocol before its results.** A pre-registration and a results post reinforce each other: one shows the method is committed, the other shows the discipline held. Report against the frozen gates whichever way they fall — a clean negative honestly reported buys more long-term credibility than a soft positive, and it is the thing almost nobody does.

**Make the reproducibility claim exercisable on the day of publication.** Corpus, questions, gold labels, per-call data and harness code released, or the claim will be tested and found aspirational.

**Match the venue.** A methods-first audience wants the harness and the limitations; an engineering-narrative audience wants the failure modes and the numbers in full; a "show" audience wants working artifacts. Adapt the emphasis, never the claim.

## When the work is a contribution worth recording

Where research is intended as evidence of professional contribution — for a grant, a talent visa, a standards body — the same discipline serves it, and shortcuts destroy it:

- **Contribution is demonstrated by artifacts others can use**: released code and data, a protocol someone else could run, a negative result that saves other people the same experiment.
- **Provenance matters.** Keep the record of what was decided when, and why — pre-registrations, dated decisions, kill conditions that fired. An audit trail is the difference between a claim and a demonstrated contribution.
- **Never overstate.** The strongest position in front of an assessor is a precise claim with its boundary and its limitations attached, plus the honest negative results. An inflated claim that unravels under scrutiny costs more than a modest one that holds.
- **Keep commercial and strategic material out of public artifacts.** Positioning, pricing and monetisation belong in private notes, not in a repository, a paper, or a public page.
