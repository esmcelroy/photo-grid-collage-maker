---
description: Analyze changes, generate commit message, and push to feature branch
mode: agent
tools: ['read', 'execute', 'todo']
---

Analyze the current changes, generate a conventional commit message, and push to the specified feature branch.

## Inputs
- `branch-name` (REQUIRED): The feature branch to commit and push to. If not provided, ask the user before proceeding.

## Instructions

### Step 0 — Require Branch Name
If `branch-name` was not provided, stop immediately and ask:
> What branch should I commit and push to? (e.g., `feature/photo-upload`)

Do not proceed until a branch name is provided.

### Step 1 — Check for Required UI Tests (if applicable)
If the current step included required UI workflow activities, verify that `/run-ui-tests` was completed successfully in this session before committing. If not, warn:
> ⚠️ This step requires UI tests to pass before committing. Run `/run-ui-tests` first.

### Step 2 — Analyze Changes
```bash
git diff --stat
git diff
```
Review what has changed to understand the scope of the commit.

### Step 3 — Generate Commit Message
Use conventional commit format (see Git Workflow in `.github/copilot-instructions.md`):
- `feat:` — new feature or capability
- `fix:` — bug fix
- `chore:` — tooling, config, dependencies
- `docs:` — documentation changes
- `test:` — adding or fixing tests
- `refactor:` — refactoring without behavior change

Write a message that is specific and meaningful:
```
feat: add photo drag-and-drop reordering in collage preview

- Implemented swap logic in CollagePreview component
- Added drag state handling with Framer Motion
- Updated PhotoPosition type to track drag state
```

### Step 4 — Create or Switch to Branch
```bash
# If branch doesn't exist
git checkout -b <branch-name>

# If branch already exists
git checkout <branch-name>
```

**IMPORTANT**: Only commit to the user-provided branch. Never commit to `main` or any other branch.

### Step 5 — Stage, Commit, and Push
```bash
git add .
git commit -m "<generated commit message>"
git push origin <branch-name>
```

### Step 6 — Report
Confirm the push succeeded and show the commit SHA and branch URL.
