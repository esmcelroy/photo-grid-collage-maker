---
description: Bridge a GitHub issue step into OpenSpec artifacts
mode: agent
agent: Explore
tools: ['search', 'read', 'edit', 'execute', 'web', 'todo']
---

Bridge a GitHub issue step into OpenSpec artifacts so planning and implementation stay aligned.

## Inputs
- `issue-number` (optional): GitHub issue number. If omitted, auto-detect from open issues.
- `step-number` (optional): Step identifier in the issue (for example `5-1`). If omitted, use the latest incomplete step.
- `change-name` (optional): Existing or new OpenSpec change name (kebab-case).

## Goal
Use GitHub issue steps as the execution source while keeping OpenSpec artifacts as the design/spec source of truth.

## Instructions

### Step 1 — Resolve the source issue
If `issue-number` was not provided:
```bash
gh issue list --state open
```
Pick the issue with `Exercise:` in the title.

Then fetch full issue context:
```bash
gh issue view <issue-number> --comments
```

### Step 2 — Resolve the source step
Find the step block from the issue body/comments.

If `step-number` is provided, locate:
```text
# Step <step-number>:
```

If `step-number` is not provided, select the latest step that is not completed.

Extract and summarize:
- Activity tasks (`:keyboard: Activity:`)
- Success criteria
- Constraints, dependencies, and explicit non-goals

### Step 3 — Resolve the OpenSpec change
If `change-name` is provided, use it.

If not provided:
1. Run `openspec list --json`
2. If one active change clearly matches the step scope, use it.
3. Otherwise derive a kebab-case name from the step title and create one:
   ```bash
   openspec new change "<derived-name>"
   ```

Always report: `Using change: <name>`.

### Step 4 — Sync the step into OpenSpec artifacts
Use OpenSpec instructions to update artifacts, grounded in the selected issue step:

```bash
openspec status --change "<name>" --json
openspec instructions proposal --change "<name>" --json
openspec instructions design --change "<name>" --json
openspec instructions tasks --change "<name>" --json
```

Apply updates so artifacts include:
- Traceability to the source issue and step
- Acceptance criteria mirrored in `tasks.md`
- Scope boundaries and non-goals from the issue step
- Implementation notes in `design.md` for constraints discovered in issue comments

### Step 5 — Output a runnable handoff
Return:
1. Issue and step used
2. OpenSpec change selected/created
3. Artifacts updated
4. Next commands in order:

```text
Next steps:
1. /opsx:apply <change-name>
2. /execute-step <issue-number>
3. /validate-step <step-number>
```

## Guardrails
- Do not implement application code in this prompt.
- If issue step content is ambiguous, ask for clarification before modifying artifacts.
- Keep OpenSpec artifacts minimal, precise, and directly traceable to issue success criteria.
- Prefer updating an existing matching change over creating duplicates.
