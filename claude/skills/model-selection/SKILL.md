---
name: model-selection
description: Choose which model tier to spend on a piece of work — the most capable model (Fable 5 / Opus) versus a cheaper, faster one — so quality holds where it matters and cost falls where it does not. Load this before launching subagents or a workflow, before a review or research sweep, when a task is large and repetitive, or whenever you are about to spend a strong model on volume. Applies to your own reasoning effort as much as to delegated agents.
---

# Which model, and why

The wrong question is "how important is this task?" — everything feels important. The right question is about the **shape** of the work.

## The decisive test: is there a cheap verifier downstream?

**If a mistake in this output would be caught mechanically — by a compiler, a test, a schema, a deterministic checker, a later verification pass — a cheaper model is usually correct.** The verifier is the quality control; the generator only has to get close. Wasting a frontier model on work that is checked for free buys nothing.

**If this output IS the last line of defence — nothing downstream can tell whether it is wrong — spend the strong model.** When the model is the verifier, its judgement is the product.

Everything below follows from that one test.

## Spend the most capable model on

- **Novel design with interacting constraints.** Several forces pulling against each other (a transaction boundary against an external store, an authorization model against an inheritance hierarchy), where the failure is a subtle wrong trade-off rather than a broken build.
- **Adversarial verification where a false negative is expensive.** Data-loss paths, authorization, money, migrations. The job is to *refute* a plausible claim — precision work, and nothing catches a wrong "this is fine".
- **Root-causing a defect that survived cheaper attempts.** If two passes have already failed, the problem is not effort, it is depth. Escalate rather than retry.
- **Reasoning about validity.** Experiment design, threats to validity, whether an inference actually follows from the evidence. This is the work most damaged by a confident, shallow answer.
- **Consequences invisible at the edit site.** "What else does this change break?" is exactly the class cheap models miss and the class that costs most.
- **Anything that will be published or acted on without further checking** — an architecture decision, a claim in an article, a security conclusion.

## Use a cheaper, faster model for

- **High-breadth, low-depth sweeps.** Finder passes, inventories, "where is X used", cataloguing call sites. Recall matters, noise is tolerable, and a verification stage follows. Fan out wide and cheap.
- **Mechanical transformation.** Renames, call-site migration, boilerplate, format conversion — the compiler and tests are the verifier.
- **First-pass triage and classification.** Bucketing, labelling, routing, "does this look security-relevant?" — provided a strong pass handles what it flags, and provided the classifier can only escalate, never silently dismiss (see the anti-patterns).
- **Summarising content that is already in hand.** Condensing, extracting, reformatting known text.
- **Anything you will read and check yourself anyway.**

## What this project's own evidence says — and its boundary

The bake-off measured something directly relevant: **on retrieval-bound work, structure beat model scale.** Flat retrieval capped exception retention at 83% for every model from Llama 3.3 70B to Sonnet 4.5; structure lifted all of them to ~98–100%. A near-free model with good structure beat a frontier model with poor structure, at ~13× lower cost.

**Carry the boundary with the result, always.** That finding is about *knowledge-bound* work — the answer exists in the material and the task is near-extractive once the right evidence is in context. It does **not** generalise to *reasoning-bound* work, and the same study found the edge: on one question, structure put the decisive evidence in front of every model and one still refused to use it. Retrieval closed the knowledge gap; using indirect evidence was a capability retrieval could not supply.

**The practical rule that follows:** improve the harness before upgrading the model. Better scoping, a verification stage, the right context — these are usually cheaper and larger wins than a tier upgrade. But once the work is genuinely reasoning-bound, expect to pay, and do not pretend structure will substitute.

## Anti-patterns

- **The strong model on volume.** Thirty agents at frontier rates doing a breadth sweep. Split it: cheap finders, strong verifier.
- **A cheap model as the last line of defence.** If nothing downstream can catch its mistake, the saving is fictitious — you have removed the check and kept the appearance of one.
- **The same model generating and grading.** A grader that shares the generator's blind spot ratifies its errors. Keep verification independent, and prefer a *deterministic* verifier over any model where one is possible.
- **A judgemental classifier that can dismiss.** If a cheap triage step can decide "no review needed", a confident misclassification silently removes the check. Cheap classifiers may escalate; only deterministic rules may skip.
- **Assuming the tier without measuring.** Test the cheap tier against a set whose answers you already know, then decide. On a known-findings set, measure recall; adopt the cheap tier if it holds, and learn something real if it does not.

## Reasoning effort, not just model choice

The same logic governs effort/thinking budget. High effort earns its cost where the answer is a judgement with consequences; on mechanical work it buys latency. When delegating, set `model` and `effort` per agent rather than uniformly — a workflow where every agent runs at the top tier is nearly always mis-tuned.

## State the choice

When you pick a tier for non-obvious work, say which and why in one clause — "cheap finders, strong verifier, because the verify stage is the precision step". It makes the decision reviewable, and it makes a wrong default visible instead of buried.
