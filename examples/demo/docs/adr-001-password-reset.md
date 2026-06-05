# ADR-001 — Password reset via time-boxed token

**Status:** Accepted · **Owner:** /arch

A single-use token (TTL 15m) emailed to the user; no distributed saga. Token is
hashed at rest and invalidated on use. See SECOPS review for threat model.
