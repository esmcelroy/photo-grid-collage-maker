---
description: Validate that all success criteria for the current step are met
mode: agent
agent: code-reviewer
tools: ['search', 'read', 'execute', 'web', 'todo']
---

Validate that all success criteria for the specified step are fully met.

## Inputs
- `step-number` (REQUIRED): The step identifier to validate (e.g., `5-0`, `5-1`, `3`). Must be provided.

## Instructions

### Step 1 — Find the Exercise Issue
```bash
gh issue list --state open
```
Find the issue with "Exercise:" in the title (see Workflow Utilities in `.github/copilot-instructions.md`).

### Step 2 — Get Issue Content
```bash
gh issue view <issue-number> --comments
```

### Step 3 — Locate the Step
Search through the issue body and comments for:
```
# Step <step-number>:
```
Extract the full content of that step, specifically the **Success Criteria** section.

### Step 4 — Check Each Criterion
For each success criterion, verify it against the current workspace state:

- **Code changes**: Check if the required files were modified correctly
  ```bash
  git diff HEAD~1 -- <file>
  ```
- **Tests passing**: Run the test suite
  ```bash
  npm test
  ```
- **Lint clean**: Check for errors
  ```bash
  npm run lint
  ```
- **Feature behavior**: Verify the feature works as described (check component logic, data flow, etc.)
- **UI tests** (if required): Confirm Playwright tests were run and passed

### Step 5 — Report Results
For each criterion, report:
- ✅ **Met**: Brief explanation of how it's satisfied
- ❌ **Not met**: What's missing and specific guidance to fix it

If all criteria are met:
```
✅ Step <step-number> complete. Ready to commit.
Next: /commit-and-push <branch-name>
```

If any criteria are not met:
```
❌ Step <step-number> incomplete. Address the following before committing:
- <specific issue 1>
- <specific issue 2>
```
