# Structured Output — Reliable, Typed Responses from LLMs

How to make an LLM emit data your code can consume *without parsing prose* — and how
to engineer that to be reliable, not lucky. This is the deeper how-it-works and
reliability layer; the **prompting-for-format** tips (what to say in the prompt,
output contract design) live in `prompt-engineering.md` (§Structured Output), which
points here. For asserting on output shape in tests see `eval-frameworks.md`. For
multi-step tool loops see `agentic-workflows.md`.

Vendor-neutral. Provider and engine features appear as **capability classes**
(structured outputs, JSON mode, grammar-constrained decoding, tool calling), not API
field names — the names move faster than the ideas, and several below shipped or
changed in late 2025. Verify exact field names against current provider docs before
coding; treat any specific name here as illustrative.

The governing rule: **the model proposes, your code disposes.** No matter how strong
the mechanism, the boundary between "LLM-shaped" and "trusted typed value" is a
validation step you own — never a `JSON.parse()` you hope succeeds.

---

## The Spectrum — least → most reliable

Five mechanisms, weakest guarantee first. Reliability climbs left→right; flexibility
and portability generally fall.

| # | Approach | What it guarantees | How it works |
|---|---|---|---|
| 1 | **Prompt-ask-for-JSON** | *Nothing* — best effort | You ask "reply as JSON"; model usually complies, sometimes wraps in prose or emits invalid JSON. |
| 2 | **JSON mode** | *Syntactically valid* JSON — no schema | Provider flag forces well-formed JSON. Says nothing about *which* fields/types. |
| 3 | **Schema-constrained / structured outputs** | Output *conforms to your JSON Schema* | Provider compiles your schema into a decoding constraint and masks invalid tokens during generation. |
| 4 | **Grammar-constrained decoding** | *Conforms to any formal grammar* (JSON Schema, regex, CFG) | OSS inference engine masks token logits each step so only grammar-valid continuations can be sampled. The general form of #3. |
| 5 | **Tool / function call as output** | Args *validated against the tool's schema* | Declare a "tool" whose parameters are your schema; force a call to it. The tool channel is a typed return path even with no real side effect. |

### Trade-offs

| Approach | Reliability | Flexibility | Latency impact | Availability (2026) |
|---|---|---|---|---|
| Prompt-ask | Low | Highest | None | Universal |
| JSON mode | Syntax only | High | ~None | Most hosted providers (often now "legacy") |
| Structured outputs | High (schema-valid) | Schema-bound | Neutral→faster* | Major hosted providers; subset of JSON Schema |
| Grammar decoding | High (grammar-valid) | Highest (any CFG) | Neutral→faster* | OSS engines (self-host / open models) |
| Tool-call-as-output | High (schema-valid) | Schema-bound | Adds a tool round-trip in agent loops | Broad — tool calling is near-universal |

\* Constrained/grammar decoding is frequently **as fast or faster** than free
generation: masking the logits prunes the sampling space, and it removes the
validate-fail-retry round trips that dominate the slow path. The win is reliability
*and* fewer retries, not a latency tax.

**Default heuristic:** hosted model → use its **structured-outputs** feature (or
tool-call-as-output if structured outputs isn't offered for your model). Self-hosted /
open weights → **grammar-constrained decoding** in your inference engine. Reserve bare
prompt-ask + validate for prototypes and providers with no better option. Never stop
at JSON mode if you actually have a schema — see Anti-patterns.

---

## How the strong mechanisms actually work

Both schema-constrained outputs (#3) and grammar-constrained decoding (#4) work by
**logit masking at each decoding step**. The schema/grammar is compiled into a state
machine; at every token the engine computes which next tokens keep the output on a
path to a valid completion, sets the logits of all others to `-inf`, and samples only
from the survivors. So the model *cannot* emit a structurally invalid token — validity
is by construction, not by post-hoc checking.

The practical cost is the **compile + per-token mask** overhead. Modern engines have
driven this down hard (recent OSS work precomputes the context-independent portion of
the vocabulary mask — the large majority of tokens — into bitmask tables, leaving only
a small context-dependent set to compute live), so per-token overhead is typically in
the tens of microseconds. As of early 2026 a single high-performance grammar backend
has become the default structured-generation engine across several major OSS inference
servers; capability-wise, expect `guided_json` / `guided_regex` / `guided_grammar`-style
request parameters from a self-hosted serving stack. *(Engine landscape moves fast —
confirm which backend your server ships before relying on a specific one.)*

Key limitation that follows from the mechanism: it guarantees the output **matches the
grammar**, not that the *values are correct*. A schema-valid object can still carry a
hallucinated field value, a wrong enum choice that happens to be in-set, or a number
that violates a business rule the schema doesn't encode. **Constrained decoding
replaces parse-error retries, not semantic validation.**

---

## Schema design — JSON Schema 2020-12 in practice

Most structured-output features speak a **subset** of JSON Schema (commonly draft
2020-12). What's broadly supported vs. commonly restricted, at the capability level:

**Broadly supported:** `type`, `properties`, `required`, `enum`, `items` (arrays),
nested objects, `anyOf`/union types (often *except* at the schema root), basic string
constraints. Enums are the cheapest way to pin a field to a closed set — prefer them
over free-string-then-validate.

**Commonly restricted or special-cased** (varies by provider — verify):

- **`additionalProperties`** — strict modes commonly require it set to `false` (no
  keys beyond those declared).
- **Required vs optional** — several strict implementations require *every* property to
  be listed in `required`; you express "optional" by making the field a **nullable
  union** (`type: ["string", "null"]`) rather than omitting it from `required`.
- **Root type** — a union (`anyOf`) at the very root is often disallowed; wrap it in an
  object.
- **Depth / breadth caps** — providers impose limits on total property count and
  nesting depth (single-digit nesting levels, low-hundreds of properties are typical
  ceilings). Deeply recursive schemas are the most fragile.
- **Format/validation keywords** — `pattern`, `format`, numeric `minimum`/`maximum`,
  `minItems`, etc. are unevenly honored *during decoding*; treat them as **hints you
  must still re-validate**, not guarantees.
- **Property ordering** — some providers honor (or require) an explicit ordering field;
  order can also affect quality, since the model fills fields in emission order.

### Typed models → JSON Schema

Don't hand-author JSON Schema. Define the shape as a **typed model** in your language
(Pydantic / dataclasses in Python, Zod / TypeScript types, a struct + tags elsewhere)
and emit its JSON Schema. Benefits: one source of truth, the same model **parses and
validates** the response (catching the semantic errors decoding can't), and editor
types flow through your code. This is the dominant 2026 pattern and what the popular
structured-output libraries are built around.

```python
class Invoice(BaseModel):          # typed model = schema + validator in one
    vendor: str
    total_cents: int
    currency: Literal["USD", "EUR", "GBP"]   # enum → closed set
    line_items: list[LineItem]
    notes: str | None              # optional → nullable union in emitted schema

schema = Invoice.model_json_schema()        # feed to the provider
result = Invoice.model_validate_json(raw)   # parse + validate the response
```

Keep schemas **flat and shallow**. If you're reaching past a few nesting levels or
into recursion, decompose into multiple calls (extract, then enrich) — both for
provider limits and for model accuracy.

---

## Reliability engineering

Even with a strong mechanism, build the loop that turns "usually right" into
"checked". The pattern: **validate → retry-with-error-feedback → bounded cap →
deterministic fallback.**

### 1. Validate against the real schema

Parse into the typed model *and* check business rules decoding can't express (ranges,
cross-field invariants, referential checks, enum *appropriateness*). Syntactic
validity ≠ semantic correctness.

### 2. Retry with the error fed back (not a blind re-roll)

When validation fails, **show the model exactly what was wrong** and ask it to fix
*that*. A blind retry re-rolls the same dice; an error-feedback retry converges.

```python
out = call(prompt, schema=schema)
for attempt in range(MAX_RETRIES):           # bounded — never `while True`
    err = validate(out, schema)              # parse + business rules
    if err is None:
        return out
    out = call(
        prompt
        + f"\nYour previous reply failed validation:\n{out}\n"
        + f"Error: {err}\nReturn corrected output matching the schema only.",
        schema=schema,
    )
raise StructuredOutputError(err)             # surface; do not loop forever
```

- **Bound the retries** (2–3 is typical). Each retry is a *full* model call with the
  growing history — unbounded retries are an unbounded bill and a latency cliff. Cap,
  then fail loud.
- Feed back the **specific** validation message, not a generic "that was wrong".

### 3. Repair / coercion before you retry

Many failures are cheap to fix in code without another call: strip prose/markdown
fences around the JSON, coerce obvious near-miss types (`"true"` → `true`, `"42"` →
`42`, single→double quotes), trim a trailing comma, close one unclosed bracket. Try
deterministic repair first; only retry the model when repair can't recover it. (Repair
is a fallback for weak mechanisms — with true constrained decoding most of these never
occur.)

### 4. Deterministic fallback path

When retries are exhausted, do **not** silently pass through garbage. Have a
non-LLM path: return a typed "could not extract" result, drop to a default/sentinel,
route to human review, or fail the request with a clear error. The caller must always
get a value that satisfies the type — failure included.

### Composition with low temperature

Set **temperature near 0** for extraction/structuring tasks: you want the single most
likely valid completion, reproducibly, not creative variation. Low temperature plus
constrained decoding minimizes both invalid-output retries *and* run-to-run drift,
which is what makes the validate-retry loop terminate quickly. (Constraint masks
*structure*; temperature controls *which valid value* gets chosen — they're
orthogonal, use both.)

---

## Streaming structured output

The core tension: **JSON is only valid when complete, but streaming delivers it a
token at a time.** A half-emitted object won't parse with a standard parser, so you
can't run strict validation mid-stream. Options:

- **Stream prose, structure at the end** — simplest. Show the user streaming text;
  collect the structured payload and validate once it's whole. Default unless the UI
  genuinely needs live fields.
- **Incremental / partial-JSON parser** — a tolerant parser that accepts truncated
  input and yields the best-effort partial object as tokens arrive (closing open
  strings/brackets provisionally). Lets a UI fill fields live. Several such libraries
  exist across languages (most are recent — check maintenance). Treat every partial as
  **provisional**; run the *real* typed validation on the final, complete object.
- **Constrained decoding + streaming** — grammar masking still applies token-by-token
  while streaming, so each emitted token is grammar-valid; you still need an
  incremental parser to *consume* the stream, and final validation for semantics.

Rule of thumb: **stream for UX, validate on completion.** Never treat a partial parse
as the trusted value.

---

## Failure modes

| Failure | What it looks like | Mitigation |
|---|---|---|
| **Truncation at token limit** | Output cut mid-object → unparseable | Set a generous `max_tokens`; detect a non-`stop` finish reason and treat as failure (don't validate a stump); shrink the schema. |
| **Near-miss types** | `"true"`/`"false"` strings for bools, `"42"` for ints | Coerce in repair; tighten the typed model; prefer constrained decoding which won't emit them. |
| **Enum drift** | A value *near* an allowed one but not in the set | Use real `enum` constraints (decoding-enforced) rather than describing options in prose. |
| **Extra prose around JSON** | "Sure! Here's the JSON: ```json …```" | JSON-mode/structured-outputs eliminates it; otherwise strip fences/preamble in repair, and instruct "JSON only, no prose". |
| **Deep / recursive schema breakage** | 400 from the provider, or degraded accuracy | Stay within depth/breadth caps; flatten; split into multiple calls. |
| **Schema-valid but wrong** | Hallucinated value, in-set-but-incorrect enum | Semantic/business-rule validation beyond the schema; constrained decoding does *not* catch this. |
| **Silent JSON-mode misuse** | Valid JSON, wrong shape, no error | Always validate against the actual schema even under JSON mode — JSON mode never saw your schema. |

---

## Testing structured output

Make the schema part of the test, not an afterthought (details in
`eval-frameworks.md`):

- Assert every fixture response **parses into the typed model** and passes business
  rules — schema conformance is an assertion, not a hope.
- Keep a **golden set** of representative + adversarial inputs (empty fields, ambiguous
  values, near-miss enums, deliberately truncatable length) and check extraction
  accuracy, not just validity.
- Track the **retry rate** and **fallback rate** as metrics — a creeping retry rate
  signals schema drift, a model change, or prompt rot before users feel it.

---

## Checklist

- [ ] Use the **strongest mechanism your stack supports** (structured outputs / grammar
      decoding / tool-call-as-output), not bare prompt-ask.
- [ ] Schema authored as a **typed model**; one source of truth for shape, parsing, and
      validation.
- [ ] Schema kept **flat and within provider caps**; closed sets expressed as `enum`.
- [ ] Optional fields handled per the provider's rule (usually **nullable union**, not
      omitted-from-`required`).
- [ ] **Validate** every response against the typed model *and* business rules — even
      under constrained decoding.
- [ ] **Retry with the specific error fed back**, **bounded** (2–3), with a
      **deterministic fallback** when exhausted.
- [ ] **Temperature ≈ 0** for structuring tasks.
- [ ] Detect **truncation** via finish reason before validating.
- [ ] Streaming: partial parse is **provisional**; validate the complete object.
- [ ] Schema conformance + accuracy covered by tests; retry/fallback rates tracked.

## Anti-patterns

| Anti-pattern | Why it bites | Do instead |
|---|---|---|
| **Regex-scraping JSON out of prose** | Brittle to any phrasing change; fails silently on the edge cases | Use JSON mode / structured outputs; parse with a real parser |
| **No validation** (`trust JSON.parse`) | Syntactic validity ≠ your schema; a wrong-shape object slips through | Parse into the typed model + check business rules |
| **Unbounded retries** | Unbounded cost and latency; can loop forever on a persistent failure | Cap at 2–3, then deterministic fallback |
| **Trusting JSON mode to honor a schema** | JSON mode only guarantees *valid* JSON; it never saw your schema | Use schema-constrained / structured outputs and still validate |
| **Over-deep / recursive schemas** | Hit provider caps; degrade accuracy; fragile | Flatten; decompose into multiple calls |
| **Ignoring truncation** | Validating a token-limited stump produces confusing errors | Check finish reason; raise `max_tokens` or shrink schema |
| **Blind retries** | Re-rolls the same dice; doesn't converge | Feed the validation error back into the retry prompt |
| **Treating a partial stream as final** | Provisional shape leaks into trusted code paths | Validate only the complete object |

---

### Sources

Capability-level facts above were cross-checked against current vendor and OSS
documentation (verify field names before coding — several features are recent):

- OpenAI — Structured model outputs guide (strict mode, schema subset, `additionalProperties`, depth/property caps): https://developers.openai.com/api/docs/guides/structured-outputs
- Anthropic — Structured outputs (JSON outputs + strict tool use; schema compiled to a decoding grammar): https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Google — Gemini structured output (`responseSchema`, JSON Schema support, property ordering, enums): https://ai.google.dev/gemini-api/docs/structured-output ; https://blog.google/technology/developers/gemini-api-structured-outputs/
- vLLM / OSS engines — guided decoding parameters and grammar backends: https://deepwiki.com/sihyeong/Awesome-LLM-Inference-Engine/4.7-structured-outputs
- XGrammar — vocabulary bitmask precompute, per-token overhead (constrained-decoding mechanism + performance): https://arxiv.org/pdf/2411.15100
- llama.cpp — GBNF grammars and JSON-Schema→GBNF conversion: https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md
- Instructor — typed models, automatic validation, retries, streaming/partial: https://python.useinstructor.com/ ; https://github.com/567-labs/instructor
- Pydantic AI — typed output / validation: https://pydantic.dev/docs/ai/core-concepts/output/
- Partial / streaming JSON parsing (incremental parse of truncated LLM output): https://pypi.org/project/partial-json-parser/
