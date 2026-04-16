---
description: Review existing UI for accessibility risks with severity-first findings and actionable fixes
mode: agent
agent: code-reviewer
tools: ['search', 'read', 'edit', 'execute', 'todo']
---

Run an accessibility-focused code review on the specified UI surface.

## Inputs
- `scope`: file(s), component(s), or user flow to review
- `complianceTarget` (optional): Defaults to WCAG 2.2 AAA
- `fixNow` (optional): yes/no, default no

## Instructions

### Step 1 — Review Scope and Risks
Identify critical interactions in scope:
- Keyboard-only navigation and focus flow
- Screen reader name/role/value quality
- Error handling and status announcements
- Contrast, zoom/reflow, and reduced-motion support

### Step 2 — Report Findings First
Return findings ordered by severity:
1. Critical
2. High
3. Medium
4. Low

For each finding include:
- Why it is a user-impacting accessibility risk
- File and line references
- Concrete remediation approach

### Step 3 — Validate With Evidence
Where possible, support findings with tests or reproducible interaction steps.
- Prefer deterministic checks (role/name assertions, keyboard sequence checks)
- Include at least one keyboard interaction trace for each critical/high finding

### Step 4 — Optional Fix Pass
If `fixNow=yes`, implement minimal safe fixes and update or add tests.
- Preserve existing behavior and APIs unless change is required for accessibility correctness
- Re-run relevant tests

### Step 5 — Final Output
Always provide:
- Findings list (or explicit statement that no findings were identified)
- Residual risks/testing gaps
- If fixes were applied: files changed and verification results
