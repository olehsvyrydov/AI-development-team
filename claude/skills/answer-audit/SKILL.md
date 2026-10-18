---
name: answer-audit
description: Adversarially audit a RAG answer against the corpus it claims to cite. Use when asked to review, critique, sanity-check, or "give skeptical feedback on" an answer produced by a retrieval-grounded (RAG) system — especially when the answer looks good. Assumes the answer is wrong until each claim is proven verbatim against a source passage.
---

# Answer Audit — skeptical review of a grounded answer

A RAG answer that is fully citation-grounded can still be materially wrong. Every claim can trace
to a real passage while the *values inside those claims* are silently corrupted in transit. This
skill exists because a confident, well-structured, 100%-grounded answer is the **hardest** kind to
catch — the citations create trust the content has not earned.

**Default posture: the answer is guilty until proven innocent.** Do not grade it on how it reads.
Grade it on whether each atom survives a character-level diff against its source.

## The rule that matters

> **Grounded ≠ accurate.** Citation *presence* is not citation *support*.

Most RAG guardrails ("no sources → no answer", "cite every claim") only prove a passage was
retrieved. They do not prove the passage says what the answer says it says. Audit the gap.

## Method

Never audit from memory or from the model's own citation list. Go to the corpus.

1. **Pull the corpus** the answer was drawn from (see *Collecting the evidence* below). Get the raw chunk
   text, not a summary of it.
2. **Atomise the answer.** Extract every checkable atom: figures, currencies, units, percentages,
   thresholds, dates, proper nouns, and any quoted phrase.
3. **Verify each atom verbatim.** Regex/grep the corpus for the exact token. An atom that does not
   appear *verbatim* is a finding, even if a similar one does. `$300k` and `£300k` are different
   facts.
4. **Diff the source passage against the answer's rendering of it**, sentence by sentence, for the
   passages that carry the answer's most consequential claims. This is where the real damage hides
   — step 3 alone will not catch a dropped caveat.
5. **Hunt for what is missing**, not just what is wrong. Omission is the most under-detected failure
   mode and the most dangerous, because nothing in the output signals it.
6. **Check the telemetry** — which model tier answered, how many attempts, how many passages were
   stuffed into the prompt. Compression pressure predicts distortion: many passages + a weak tier is
   the setup for exactly these errors.
7. **Report defects with the source text quoted beside the answer text.** Never assert a defect you
   have not shown.

## Failure taxonomy — look for each by name

Findings 2–5 are all *grounded* failures. They pass every citation check and still ship a wrong
number to an investor.

| # | Failure | What it looks like |
|---|---|---|
| 1 | **Ungrounded claim** | Fact appears nowhere in the corpus. The only mode most guardrails catch. |
| 2 | **Unit / currency normalisation** | Source mixes `$` ARR with `£` valuations; the model harmonises them into one symbol. Changes the number's meaning while keeping its digits. |
| 3 | **Qualifier drop** | Source attaches a caveat, risk, or precondition to a claim; the answer reports the claim and deletes the caveat. Check especially for text the *author* explicitly labelled ("Honest qualifier:", "Caveat:", "Risk:"). |
| 4 | **Semantic merge** | Two adjacent source sentences fuse and a predicate migrates. "Path to $X ARR. £Y pre-seed." → "Path to £Y pre-seed." |
| 5 | **Selective omission / optimism bias** | Favourable figures retained, constraining ones dropped. Test: does the answer's overall *valence* match the source's? |
| 6 | **Stale-as-current** | Superseded/parked content presented as live guidance. Check the answer flags supersession *and* does not then proceed to recommend the parked thing. |
| 7 | **Citation drift** | `[N]` marker does not point at a passage supporting the claim. Verify the system actually parses `[N]` — many do not, and synthesize the citation list from *every passage shown to the model*, which makes "grounded by N sources" mean "retrieved N", not "used N". |
| 8 | **Descriptive answer to a normative question** | Asked "what *should* we do", the system restates "what the docs *say*" without judgement, and the caveat gets buried under the restatement. |

## Collecting the evidence

Export from the system itself, not from the answer.

1. **The full retrieved corpus** the answer drew on: every passage's text with its document id,
   title and source URL, taken from the vector store or search index. The snippets quoted in the
   answer are not the corpus; a claim can only be proven absent from the full set.
2. **The per-query telemetry** the system records: the model tier that answered, retries or
   attempts, and the number of passages sent to the model.
3. **Flag the risky configuration.** A high passage count sent to a small, cheap model is the
   highest-risk setup for failures 2–5 — say so in the report.

## Output

Lead with the verdict, then the defects, hardest first. For each defect show **source text** and
**answer text** side by side, so the reader can adjudicate without re-running the audit.

State what you verified *and could not fault* — an audit that only lists faults is not an audit, and
the clean results are what make the faults credible. Give the grounded/total count.

Do not soften. Do not pad with praise. If the answer is good, say so in one line and move on; the
value here is the defects, and a reviewer who flatters is worth nothing.
