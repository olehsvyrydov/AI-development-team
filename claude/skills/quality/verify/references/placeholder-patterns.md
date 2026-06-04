# Placeholder Detection Patterns

## Universal Patterns (All Checkpoints)

Search for these EXACT strings. Any occurrence = finding.

### Angle Quote Placeholders
```
«
»
```
These are the primary placeholder markers from the templates. Any remaining = document not complete.

### Template Instruction Leftovers
```
[Fill here]
[e.g.
[Replace
INSTRUCTION:
```

### Deferred Work Markers
```
TODO
TBD
FIXME
```

### Generic Names (Template Examples Not Replaced)
```
field1
field2
EntityA
EntityB
```

### Unfilled References
```
topic-name
TICKET-XXX
EPIC-XXX
```

### Example Content in Tables
```
e.g.,
```
**Note:** `e.g.,` in table cells is almost always template example text that wasn't replaced. In prose paragraphs it may be legitimate — use judgment, but flag it.

## Dev Doc Specific Patterns (CP2 + CP3)

### Reference Examples Not Replaced
```
ExistingService
ExistingConsumer
ExistingController
ExistingIT
[ExistingClass]
```

### Generic Package/Metric Names
```
com.app.[module]
com.app.module.feature
feature.x.
feature.name.
```

### Generic Class Names (Only if feature has a specific name)
```
FeatureController
FeatureService
FeatureEntity
FeatureRepository
FeatureMapper
FeatureEventPublisher
FeatureEventConsumer
FeatureProperties
CreateFeatureRequest
FeatureResponse
```
**Note:** These are findings ONLY if the actual feature name is known and different from "Feature". If the feature IS generically named, these may be valid.

## How to Search

### For file-based documents:
```bash
# Count all placeholder occurrences
for pattern in '«' '»' '\[Fill here\]' '\[e.g\.' 'TODO' 'TBD' 'FIXME' '\[Replace' 'field1' 'field2' 'EntityA' 'EntityB' 'topic-name' 'TICKET-XXX' 'EPIC-XXX'; do
  count=$(grep -c "$pattern" document.md 2>/dev/null || echo 0)
  if [ "$count" -gt 0 ]; then
    echo "FOUND $count: $pattern"
    grep -n "$pattern" document.md
  fi
done
```

### For conversation content:
Scan the full text manually. Count EVERY occurrence. Report section + surrounding context for each.

## Threshold

**0 occurrences across ALL patterns = PASS**
**Any > 0 = FAIL**

No exceptions. No "it's just one placeholder." One placeholder means the document is incomplete.
