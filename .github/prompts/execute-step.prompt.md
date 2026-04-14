---
description: Execute instructions from the current GitHub Issue step
mode: agent
agent: tdd-developer
tools: ['search', 'read', 'edit', 'execute', 'web', 'todo']
---

Execute the current step from the exercise GitHub Issue using TDD principles.

## Inputs
- `issue-number` (optional): The GitHub issue number to execute. If not provided, find it automatically.

## Instructions

### Step 1 — Find the Issue
If `issue-number` was not provided:
```bash
gh issue list --state open
```
Look for the issue with "Exercise:" in the title (see Workflow Utilities in `.github/copilot-instructions.md`).

### Step 2 — Get Issue Content and Steps
```bash
gh issue view <issue-number> --comments
```
Parse the issue body and comments to identify the current step. Steps are posted as comments on the main issue. Look for the latest step that has not been completed.

### Step 3 — Execute Each Activity
Find every `:keyboard: Activity:` section in the current step and execute each one systematically using TDD (Red-Green-Refactor):

1. Write tests FIRST before any implementation (see `docs/testing-guidelines.md`)
2. Confirm tests fail (RED)
3. Implement the minimum code to pass (GREEN)
4. Refactor while keeping tests green (REFACTOR)

### Scope Boundary — Playwright
Do NOT create or run Playwright UI tests in this prompt. If an activity requires UI testing:
- Note the UI work as out of scope
- Hand off with `/create-ui-tests` → `/run-ui-tests`

### Step 4 — Do NOT Commit
Stop after completing all activities. Do not run `git add`, `git commit`, or `git push`. That is handled by `/commit-and-push`.

### Step 5 — Report Next Commands
After completing all activities, provide next steps in this exact order:

**If the current step requires a UI workflow:**
```
Next steps:
1. /create-ui-tests
2. /run-ui-tests
3. /validate-step <step-number>
```

**If no UI workflow is required:**
```
Next steps:
1. /validate-step <step-number>
```

Never recommend `/validate-step` before the required UI prompts are complete.
