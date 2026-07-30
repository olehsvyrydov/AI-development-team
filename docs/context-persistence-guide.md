# Context Persistence — Session Continuity

The earlier Qdrant-based context-persistence subsystem (`claude/rag/context-cache/`) shipped with the DART dashboard product and has been set aside along with it. See [`ARCHIVE.md`](../ARCHIVE.md) for what was removed and how to retrieve it from the archive tags.

Cross-session memory is now the concern of **Praxis**, the open agent-memory runtime that lives in its own repository and consumes the shared agent skills in this framework.

By default the framework keeps no external memory backend: agents work from file-based artifacts — markdown tickets (Backlog.md) and the markdown knowledge base. An agent-memory MCP overlay (such as Praxis) is optional; when one is connected, [`/kai`](../claude/commands/kai.md) can propose its human-approved rules as skill updates.
