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

### Step 1 — Check for Required UI Tests and Screenshots (if applicable)
If the current step included required UI workflow activities, verify that `/run-ui-tests` was completed successfully in this session before committing. If not, warn:
> ⚠️ This step requires UI tests to pass before committing. Run `/run-ui-tests` first.

After UI tests have passed, collect the proof screenshot filenames and prepare them for inclusion in the PR description (Step 6).

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

### Step 6 — Open PR with Screenshots (required for cloud agent sessions)
After pushing, open a PR (or update the existing one) with a description that includes:

1. A summary of what changed and why
2. A **Playwright Screenshots** section listing every proof screenshot captured during `/run-ui-tests`:

```markdown
## 🎭 Playwright Screenshots

The following screenshots were captured during UI testing to prove the feature works end-to-end.
Screenshots follow the naming convention `proof-<checkpoint>-<timestamp>.png` (e.g., `proof-upload-complete-1713200000000.png`).

- `proof-<checkpoint>-<timestamp>.png` — <describe what the screenshot shows>
- ...

> Full Playwright report is available in the CI `playwright-report` artifact.
```

If no UI tests were run for this session, note that in the PR description instead.

### Step 7 — Report
Confirm the push succeeded and show the commit SHA, branch URL, and PR link.
