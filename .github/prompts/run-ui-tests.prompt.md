---
description: Run UI tests and summarize failures
mode: agent
agent: test-engineer
tools: ['read', 'execute', 'todo']
---

Run the Playwright UI test suite and provide a clear pass/fail summary with root cause analysis for any failures.

## Instructions

### Step 1 — Install Playwright Dependencies (REQUIRED FIRST)
Before running any tests, always install Playwright browser dependencies:
```bash
npm run test:ui:install
```

In Ubuntu/Linux environments this is mandatory and must run `playwright install --with-deps chromium`.

**If install fails:**
- Stop immediately
- Report an environment blocker with the failing command and the key error lines
- Do NOT attempt broad OS troubleshooting beyond the automated remediation built into `test:ui:install`
- Do NOT continue to run Playwright tests after a failed dependency install

### Step 2 — Ensure App is Running
Playwright tests require both the frontend (and backend, if applicable) to be running. If not already running:
```bash
npm run dev
```
Wait for the dev server to be ready before running tests.

### Step 3 — Run UI Tests
```bash
npx playwright test
```
Or use the project's configured script if available:
```bash
npm run test:ui
```

### Step 4 — Summarize Results
Report clearly:

```
UI Test Results
───────────────
✅ Passed: <n>
❌ Failed: <n>
⏭  Skipped: <n>

Failures:
- <test name>: <brief description of what failed>
```

List all proof screenshots captured during the run:
```bash
ls test-results/proof-*.png 2>/dev/null || echo "No proof screenshots found"
```

Include the filenames and a brief description of what each one shows in your summary. These screenshots **must** be referenced in the PR description.

### Step 5 — Classify Failures
For each failure, classify the likely root cause:

| Class | When | Action |
|-------|------|--------|
| **Application bug** | Feature doesn't work in browser either | Flag for `tdd-developer` to fix |
| **Test code issue** | Feature works in browser, selector/assertion is wrong | Fix the test |
| **Environment issue** | Fails only in CI / timing / missing deps | Investigate env setup |
| **Flaky test** | Fails intermittently | Add proper state-based waits; isolate |

### Step 6 — Report Next Steps
If all tests pass:
```
✅ All UI tests passing.
Next: /validate-step <step-number>
```

If tests fail:
```
❌ <n> test(s) failing.
Root causes identified above.
Fix application code (tdd-developer) or test code (test-engineer) before validating.
```
