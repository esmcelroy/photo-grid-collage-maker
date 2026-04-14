---
description: Create UI tests for required critical user journeys
mode: agent
agent: test-engineer
tools: ['search', 'read', 'edit', 'execute', 'todo']
---

Create Playwright UI tests for critical user journeys in the Collage Maker app.

## Inputs
- `journeys` (optional): Specific journeys to test. If not provided, use the default set.

## Instructions

### Step 1 — Determine Journeys to Test
If `journeys` were not specified, use these defaults:
1. Create: Upload photos and generate a collage
2. Edit: Modify an existing collage (layout, customization)
3. Toggle/Interact: Swap photo positions
4. Delete: Remove photos / clear all
5. Error-state: Upload unsupported file type or exceed photo limit

**HARD LIMIT: Maximum 5 Playwright tests for this run (target 3-5).**

If more than 5 candidate scenarios exist:
- Select the 5 highest-risk journeys
- List the deferred scenarios in your response — do NOT create more than 5 tests

At least 1 of the 5 tests must be an error-path scenario.

### Step 2 — Review Existing Tests
```bash
find e2e/ -name "*.spec.ts" 2>/dev/null || echo "No e2e directory yet"
```
Avoid duplicating existing coverage.

### Step 3 — Apply Page Object Model (POM)
Structure tests using POM (see `test-engineer.agent.md` for patterns):
```
e2e/
├── pages/          ← reusable page interactions and selectors
└── journeys/       ← scenario-focused test specs
```

Keep page object classes free of assertions. Keep test specs free of raw selectors.

### Step 4 — Write Tests
Use stable selectors in priority order:
1. `page.getByRole()` — preferred
2. `page.getByLabel()` — for inputs
3. `page.getByText()` — for visible content
4. `data-testid` — last resort

Use state-based waits, never `waitForTimeout`:
```typescript
await expect(locator).toBeVisible()
await expect(locator).toBeEnabled()
```

### Step 5 — Verify Test Count
Before finishing, count the total number of `test(` / `it(` calls across all created/modified files.

**If the count exceeds 5, remove the lowest-priority tests until the count is ≤ 5.**

Do not claim "small scope" if the final count is > 5.

### Step 6 — Report
List:
- Files created or modified
- Scenarios covered (with test names)
- Scenarios deferred (if any)
- Total test count

Next step: `/run-ui-tests`
