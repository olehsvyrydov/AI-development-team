# Security review — ADT-124

**Owner:** /secops · **Outcome:** approved with follow-ups

- Token entropy ≥128 bits, single-use, 15m TTL ✓
- Reset endpoint must be **rate-limited** (tracked as ADT-130) ⚠
- No user-enumeration via timing/response differences ✓
