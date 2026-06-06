# Evaluating LLM Applications — Methodology · Datasets · Metrics · Judges · Regression · Production

Vendor-neutral patterns for evaluating LLM-powered features as an engineering
discipline. Pair with the `ai-engineer` SKILL.md (this expands its "Evals
(non-negotiable)" bullet). This file is the **general eval methodology + framework
landscape**. It deliberately does **not** re-derive metrics owned by siblings:

- **Retrieval metrics** (recall@k, nDCG, context precision/recall) → `rag-patterns.md` §7.
- **Agent trajectory / tool-call eval** → `agentic-workflows.md` §Evaluation.
- **Prompt regression / golden-set-before-merge** → `prompt-engineering.md` §Prompt Ops.

Framework names below (RAGAS, promptfoo, DeepEval, LangSmith/Langfuse-style tracing,
OpenTelemetry GenAI) are **examples to locate the landscape, not endorsements**. The
methodology outlives any tool. Verify versions/feature claims against current docs —
this space moves monthly and several conventions are still experimental.

---

## 1. Why eval-first

**You cannot improve what you don't measure.** "Looks good in the demo" is a sample
of one, chosen by the person who wrote the prompt. The first artifact of any LLM
feature is not the prompt — it's the **eval harness and a tracked baseline**.

- **Offline eval gates before ship.** A golden-set run in CI is the release gate: a
  change that drops a metric below baseline does not merge. This is the LLM analogue
  of a failing unit test — treat a metric regression as a red build.
- **Separate the question from the answer.** Build the eval set *before* you optimize,
  or you'll unconsciously tune the prompt to the examples in front of you (leakage,
  §2). The eval set is a contract written against requirements, not against the current
  output.
- **Three loops, different cadences.** *Pre-merge* (CI gate on golden set) ·
  *offline experiment* (compare prompt/model/retrieval variants on a curated set) ·
  *online* (score live traffic, catch drift) — §8. A mature program runs all three;
  most teams that ship "vibes" run none.
- **Measure cost & latency alongside quality.** A 1-point quality gain that doubles
  cost or p95 latency is usually a regression. Every eval row should carry tokens, $,
  and wall-clock, not just a score.

---

## 2. Golden / eval datasets

The single highest-leverage asset in an LLM project. The harness is only as good as
the set it runs on.

### Construction

| Source | Use |
|--------|-----|
| **Hand-authored from requirements** | Encode the AC directly — one case per behavior you promised |
| **Mined from real traffic** | The truest distribution; sample logs, label outcomes |
| **Every production failure** | Each incident becomes a permanent regression case |
| **Synthetic / LLM-generated** | Cheap coverage and edge cases — but **review by hand**; ungrounded synthetic sets test the generator's imagination, not reality |

A case is `input → expected` plus metadata (tags, difficulty, source). `expected` is a
reference answer, a set of required facts/substrings, a schema, or relevant-source IDs
— whatever the metric in §3 consumes.

### Size, coverage, freshness

- **Start small and real (tens of cases), grow deliberately.** A focused 30–80-case
  set that covers your behaviors beats 1,000 scraped rows. Add cases when a new
  behavior ships or a failure recurs — size follows coverage, not vice versa.
- **Coverage over volume.** Enforce diversity across intents, input lengths,
  languages, and **edge/adversarial cases** (empty input, hostile input, out-of-scope,
  ambiguous). Cluster near-duplicates and prune redundancy — 50 paraphrases of one
  question is one test, not fifty.
- **Stratify with tags** so you can read a *per-segment* score (e.g. "faithfulness on
  multi-hop questions"). An aggregate hides the segment that's failing.
- **Keep it fresh.** A frozen set rots: the product changes, the world changes, and
  the model upgrades. Schedule review; rotate in new traffic; retire dead cases.

### Holdout & avoiding leakage

- **Hold out a slice you never tune on.** If you iterate on the dev set, keep a
  separate test/holdout that gates the final decision — otherwise you've overfit the
  prompt to the dev set.
- **Leakage is the silent killer.** Eval cases (or their source docs) must **not**
  appear in the prompt, the few-shot examples, the fine-tune data, or — for foundation
  benchmarks — the model's pretraining. Leaked sets produce offline scores that
  collapse in production.
- **Guard against model contamination.** Public benchmarks may be in the training
  corpus; prefer private, recent, or post-cutoff data for any claim about raw model
  capability. (RAG/prompt leakage detail: `rag-patterns.md` §9, `prompt-engineering.md`.)

---

## 3. Metric types

Pick the **cheapest metric that captures the requirement**. Spend LLM-judge budget
only where deterministic checks can't reach.

### Deterministic / reference-based

| Metric | Good for | Caveat |
|--------|----------|--------|
| **Exact / normalized match** | Closed-form answers, labels, enums, IDs | Brittle on free text — normalize case/whitespace/punctuation first |
| **Schema / JSON validation** | Structured output | Validates *shape*, not *correctness* of values |
| **Regex / required substrings** | "Must mention X", "must not say Y" | Easy to game; pair positive + negative assertions |
| **Token F1** | Short extractive spans | Order-insensitive; rewards overlap, not meaning |
| **BLEU / ROUGE** | Translation/summarization *with strong references* | **Surface n-gram overlap** — penalizes valid paraphrase, blind to factual error. Treat as a weak proxy, never a correctness gate for open generation |

Deterministic checks are fast, free, reproducible, and CI-friendly. Use them for
**100% of traffic** where applicable (§8). Their limit: they can't judge "is this
*helpful*?".

### Embedding similarity

Cosine similarity between answer and reference embeddings — tolerant of paraphrase, so
better than BLEU/ROUGE for open text. But it conflates *topical relatedness* with
*correctness* (a fluent wrong answer can score high) and depends on the embedding
model. Use as a soft signal or a cheap pre-filter, not a hard gate.

### LLM-as-judge

Use a model to score outputs on fuzzy dimensions (helpfulness, coherence, tone,
faithfulness) that have no cheap reference. Powerful and scalable — and **biased**;
§4 is mandatory reading before you ship one.

| Mode | What | When |
|------|------|------|
| **Pointwise** | Score one output (binary pass/fail, or a small rubric scale) | Absolute quality gates; cheapest |
| **Pairwise** | "Is A or B better?" | Comparing two variants/models — humans and judges are more reliable at *relative* than *absolute* judgments |
| **Reference-guided** | Judge given a gold answer to compare against | Sharpens correctness scoring when a reference exists |
| **Rubric / G-Eval-style** | Judge applies an explicit multi-criterion rubric, often with reasoning | Repeatable, auditable; prefer a **small discrete scale (1–5 or pass/fail)** over a 1–100 score the judge can't use consistently |

---

## 4. LLM-as-judge: bias & limitations

A judge is a model, so it has model failure modes. Unmitigated, these silently corrupt
every downstream decision. Treat the judge as a **measuring instrument that must be
calibrated**.

### Known biases (and mitigations)

| Bias | Symptom | Mitigation |
|------|---------|-----------|
| **Position** | In pairwise, prefers the first (or last) option; verdict flips when you swap order | **Run both orderings**, average / require agreement; randomize position |
| **Verbosity / length** | Longer answers score higher even when wrong — length reads as effort (research has measured double-digit inflation) | Explicit "do not prefer longer answers" in the rubric; length-normalize or report length-controlled scores |
| **Self-preference** | A judge rates outputs from its own model family higher | Use a **judge from a different family** than the generator; cross-check on a sample |
| **Format / sycophancy** | Rewards confident tone, markdown, or self-flattering phrasing over substance | Rubric anchored to *content*, not style; blind the judge to source/model identity |
| **Calibration drift** | Same rubric, different absolute scores over time / across judge versions | Pin judge model + prompt as versioned artifacts; re-calibrate on judge upgrade |

### Doing it right

- **Calibrate against human labels.** Periodically have humans label a sample and
  measure judge↔human agreement (e.g. Cohen's κ, correlation). A judge that doesn't
  track humans is measuring its own preferences, not quality. **Recalibrate after any
  judge-model upgrade.**
- **Pin judge model and prompt** like code — a judge swap can move every score; an
  uncontrolled judge change is an unreviewed change to your metric.
- **Prefer discrete rubrics with reasoning** (ask for a short justification before the
  score) over a bare number — more stable and auditable.
- **Pairwise for comparisons, pointwise for gates.** Relative judgments are more
  reliable; use pairwise when ranking variants.
- **Budget it.** Cost scales as `cases × metrics × runs × judge-calls`. Run deterministic
  checks broadly and the judge narrowly (a sample, or only on dimensions it's needed
  for). Judge-model choice trades cost vs reliability — a cheaper judge may be fine for
  coarse gates, not for close calls.

---

## 5. RAG-specific evaluation

Owned by `rag-patterns.md` §7 — **measure retrieval and generation separately**. Summary
of what the *generation* side adds, since it's judge-based and belongs to this lane too:

- **Faithfulness / groundedness** — every claim in the answer is supported by the
  retrieved context (the hallucination guard).
- **Answer relevance** — the answer actually addresses the question.
- **Context precision / recall** — retrieval-side; see `rag-patterns.md`.

Reference-free RAG scoring (faithfulness, answer relevance, context precision/recall
without a gold answer) is the niche **RAGAS**-style frameworks occupy. Same judge
caveats from §4 apply: pin the judge, calibrate, watch verbosity/position bias.

---

## 6. Agent / tool eval

Owned by `agentic-workflows.md` §Evaluation — evaluate the **trajectory** *and* the
**outcome**, not just the final string. Pointers for this lane:

- **Task success rate** — did the run reach the goal end-to-end (assertions on final
  state, or judge on the outcome).
- **Tool-call correctness** — right tool, right args, right order. **Deterministic** —
  no LLM judge needed; assert exact tool names/params/side-effects.
- **Efficiency** — steps, tokens, cost, latency per task; budget regressions are
  failures.

Deterministic where checkable, judge only for the fuzzy dimensions (reasoning quality,
plan coherence). See the sibling for the full table.

---

## 7. Assertion / unit-style prompt tests

The lightest-weight layer: declarative test cases that assert on output, runnable in
CI like any test suite (the **promptfoo**-style approach). Sits *below* full metric
evals — fast, deterministic-leaning, and the natural pre-merge gate.

```yaml
# illustrative shape — declarative cases, not a specific tool's exact schema
- vars: { question: "What is the refund window?" }
  assert:
    - type: contains            # expected substring
      value: "30 days"
    - type: is-json             # output parses as JSON
    - type: not-contains
      value: "I think"          # negative assertion: no hedging
    - type: llm-rubric          # escalate to a judge only where needed
      value: "Answer is grounded in the provided policy text"
  tags: [refunds, policy]       # tag-able for per-segment reporting
```

- **Tag-able cases** → run subsets, report per-segment, gate selectively.
- **Layer assertions:** cheap deterministic checks first (substring, schema, regex),
  escalate to a judge assertion only for the fuzzy part of the same case.
- **CI gating:** wire the suite into the pipeline; a failed assertion or a metric below
  threshold fails the build. This is how `prompt-engineering.md`'s "eval before merge"
  is enforced mechanically.

---

## 8. Regression detection & statistical care

LLM systems regress **silently** — a prompt tweak, a model version bump, or a retrieval
change can quietly degrade a segment while the headline number looks fine.

- **Golden-set diff.** Re-run the set on every change to prompt, model, retrieval, or
  judge; diff against the tracked baseline **per tag**, not just in aggregate. Surface
  newly-failing cases explicitly.
- **A/B / pairwise variant comparison.** When choosing between two prompts/models, run
  both on the same set; pairwise judging (§3) is often more discriminating than
  comparing two absolute scores.
- **Respect non-determinism.** Identical input → different output (temperature > 0,
  sampling, provider drift). A single run is noise. **Run each case N times**, aggregate,
  and report **confidence intervals** — not a point estimate.
- **Don't call a 1-point move a win.** Compare with statistical care: overlapping 95%
  CIs ≈ no demonstrated difference; **bootstrap / permutation tests** on the paired
  differences give a defensible significance statement; power/sample-size dictates the
  smallest effect your set can detect. The rigor scales with the stakes — a release gate
  warrants more than a throwaway experiment.
- **Pin everything that moves the number** (model version, judge, prompt, dataset
  hash) so a metric change is attributable to one cause.

---

## 9. Offline vs online / production eval

Offline proves a change is good *before* ship; online catches what happens *to* you
*after* — model-provider drift, distribution shift, novel inputs. **Do both.**

| | Offline | Online / production |
|---|---|---|
| **Input** | Curated golden set | Live traffic (sampled) |
| **When** | Pre-merge / experiment | Continuous, post-deploy |
| **Catches** | Regressions you introduce | Drift / changes that happen to you |
| **Scorers** | Full metric battery incl. judge | Fast heuristics on 100%; judge on a sample |

### Production layer

- **Tracing/observability is the prerequisite.** You can't evaluate live traffic you
  don't capture. Log inputs, outputs, retrieved context, tool calls, tokens, cost,
  latency, with a correlation id per request (the LangSmith/Langfuse-style trace).
  **OpenTelemetry GenAI semantic conventions** are the emerging vendor-neutral standard
  for these spans (`gen_ai.*` attributes — model, token usage, finish reason); much of
  it is still **experimental**, so verify before depending on stability.
- **Sample for cost.** Run cheap deterministic/heuristic scorers on ~100% of traffic;
  run **expensive LLM-judge scorers on a sample** (commonly a single-digit-to-~10%
  slice) asynchronously, off the request path, so they add no user-facing latency.
- **Guardrails ≠ scorers.** A **guardrail** is *synchronous, inline*, blocks a specific
  failure mode in milliseconds (PII leak, injection, schema violation). An **online
  scorer** is *asynchronous, after the fact*, measures quality for trend/alerting. You
  want both; don't put a slow judge inline.
- **User-feedback signals.** Thumbs up/down, edits, copy/accept, "no answer" rate,
  citation click-through, retry rate — weak per-event but strong in aggregate. Feed
  confirmed failures back into the golden set (§2), closing the loop.

---

## 10. Human evaluation

Automated metrics are proxies. **Human eval is irreplaceable** for: ground-truth
calibration of judges (§4), inherently subjective dimensions (taste, tone, brand
safety), high-stakes/novel decisions, and bootstrapping a domain where no metric exists
yet. It's slow and expensive — use it to *anchor* automation, not to replace it at scale.

- **Use a written rubric**, the same one the LLM-judge uses — humans disagree wildly
  without one.
- **Measure inter-rater agreement** (Cohen's/Fleiss' κ, or correlation). Low agreement
  means the rubric is ambiguous, not that the raters are wrong — fix the rubric.
- **Multiple raters per item** on a sample; adjudicate disagreements — those cases are
  often the most informative (genuinely ambiguous, or a rubric gap).

---

## 11. Framework landscape (orientation, not endorsement)

Names move fast and overlap heavily; **verify current scope before adopting.** Categories:

| Category | Examples | What it's for |
|----------|----------|---------------|
| **RAG metric libraries** | RAGAS-style | Reference-free faithfulness / relevance / context metrics |
| **Assertion + red-team suites** | promptfoo-style | Declarative CI assertions, multi-model compare, adversarial probing |
| **Code-first metric SDKs** | DeepEval-style | Pytest-style metric assertions in CI; broad metric catalog |
| **Tracing / experiment platforms** | LangSmith- / Langfuse-style | Trace capture, dataset+experiment tracking, online scoring |
| **Open telemetry standard** | OpenTelemetry GenAI semconv | Vendor-neutral span schema for LLM/agent/tool observability (mostly experimental) |

**Selection heuristic:** match the tool to your *bottleneck* — RAG-heavy → a RAG metric
library; prompt iteration / security → an assertion+red-team suite; CI-gated quality →
a code-first SDK; production drift → a tracing/experiment platform. Most production
programs combine two (e.g. CI gate + live tracing). Keep evals behind your own thin
interface where practical so the framework is swappable.

---

## 12. Checklist

- [ ] Eval harness + tracked baseline exist **before** prompt optimization.
- [ ] Golden set built from requirements + real traffic; tagged; covers edge/adversarial cases.
- [ ] A holdout slice is never tuned on; no eval data leaked into prompt/few-shot/fine-tune.
- [ ] Cheapest adequate metric per requirement (deterministic > embedding > judge).
- [ ] Any LLM-judge: pinned model+prompt, both-orderings, length-controlled, calibrated vs humans.
- [ ] Quality **and** cost **and** latency tracked per run.
- [ ] CI gate: golden-set diff blocks merge on regression (per-segment, not just aggregate).
- [ ] Non-determinism handled: N runs, CIs, significance test before claiming a win.
- [ ] Production tracing in place; online scorers (cheap on all, judge on a sample) + guardrails inline.
- [ ] User-feedback + production failures loop back into the golden set.
- [ ] Human eval used to calibrate judges and for subjective/high-stakes dimensions; inter-rater agreement measured.

---

## 13. Anti-patterns

- **No eval set** — shipping on the author's gut; "better" is unmeasured.
- **Vibe-checking** — eyeballing a few outputs in a notebook and calling it tested.
- **LLM-judge with no bias mitigation or human calibration** — measuring the judge's
  preferences (verbosity, position, self-preference), not quality.
- **Single-run comparison on a non-deterministic system** — declaring a winner from one
  noisy sample with no CIs.
- **Leaked eval set** — cases or their sources sitting in the prompt, few-shot, or
  fine-tune data; offline scores that evaporate in production.
- **Aggregate-only reporting** — a healthy mean hiding a failing segment.
- **Only offline, never production** — passing CI then silently drifting on live traffic.
- **Slow judge inline as a guardrail** — putting an async scorer on the request path and
  paying latency for measurement that belonged off-path.
- **BLEU/ROUGE as a correctness gate** — penalizing valid paraphrase, blind to factual
  error, on open-ended generation.
- **Frozen golden set** — never refreshed, so it stops resembling production and stops
  catching real failures.
- **Unpinned judge/model/dataset** — a metric move you can't attribute to a cause.
