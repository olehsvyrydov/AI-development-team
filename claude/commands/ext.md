---
description: "Invoke the Browser Extension Developer for Chrome/Edge MV3 and Firefox WebExtensions — manifest and permissions, service-worker lifecycle, content-script injection, tabs and tab groups, long-running in-browser jobs, and store review."
---

# /ext — Browser Extension Developer

Invoke the **browser-extension-developer** skill
(`claude/skills/development/browser/browser-extension-developer/SKILL.md`).

Manifest permission changes trigger `ARCH_APPROVED` + `SECURITY_OK`; anything that reads page content
or sends it off-device triggers `SECURITY_OK`. Consult the `workflow-engine`.

For ordinary web-app UI inside the extension's own pages use `/fe`; for driving a browser to test a
site use `/e2e`.
