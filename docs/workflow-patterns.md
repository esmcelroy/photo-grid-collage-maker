# Development Workflow Guidance

> Reference for AI assistants. Concrete, step-by-step procedures for each type of development work in this project.

## Table of Contents

1. [TDD Workflow](#1-tdd-workflow-primary-development-mode)
2. [Code Quality Workflow](#2-code-quality-workflow)
3. [Integration Debugging Workflow](#3-integration-debugging-workflow)
4. [UI Testing Workflow](#4-ui-testing-workflow-test-engineer-agent)
5. [Feature Branch Workflow](#5-feature-branch-workflow)
6. [Memory System Integration](#6-memory-system-integration)
7. [Conventional Commit Reference](#7-conventional-commit-reference)

---

## 1. TDD Workflow (Primary development mode)

### Steps

1. Read `patterns-discovered.md` for relevant patterns
2. Identify the behavior to test
3. Write the test (must fail — **RED**)
4. Run the test:
   ```bash
   npm test -- --testPathPattern=<file>
   ```
5. Confirm it fails for the right reason
6. Write minimum implementation (**GREEN**)
7. Run the test again — confirm it passes
8. Refactor code without breaking tests
9. Run all tests:
   ```bash
   npm test
   ```
10. Note new patterns in `.github/memory/scratch/working-notes.md`

### Agent Roles

| Agent | Responsibility |
|-------|---------------|
| `tdd-developer` | Owns steps 1–10 for unit and integration tests |
| `test-engineer` | Owns all Playwright E2E work |

---

## 2. Code Quality Workflow

### Steps

1. Run lint:
   ```bash
   npm run lint
   ```
2. Categorize issues: **errors** (must fix) vs **warnings** (should fix)
3. Fix errors first, systematically by file
4. Re-run lint to confirm errors resolved
5. Fix warnings if time allows
6. Stage and commit:
   ```bash
   git add . && git commit -m "chore: fix lint errors"
   ```

### Common ESLint Rules in This Project

| Rule | Description |
|------|-------------|
| `react-hooks/exhaustive-deps` | Missing dependency in `useCallback`/`useEffect` |
| `react-refresh/only-export-components` | Component export patterns |
| TypeScript strict mode violations | Various strict-mode type errors |

---

## 3. Integration Debugging Workflow

### Steps

1. Identify the symptom (what broke, what was expected)
2. Check `.github/memory/session-notes.md` for prior similar issues
3. Isolate: is it frontend state, component rendering, or data flow?
4. Write a failing test that reproduces the issue
5. Use test output to guide debugging
6. Fix the root cause (not just the symptom)
7. Verify the test passes
8. Run full test suite:
   ```bash
   npm test
   ```
9. Document findings in `.github/memory/scratch/working-notes.md`

### Common Issues in This Project

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| `useKV` returns `undefined` on first render | Missing default value | Use `\|\| []` defensive fallback |
| Layout not updating after photo count changes | Missing `useEffect` dependency | Check `useEffect` deps array |
| CSS Grid areas not rendering | Template/area mismatch | Verify `gridTemplate` and `areas` array alignment |

---

## 4. UI Testing Workflow (`test-engineer` agent)

### Steps

1. Define critical user journeys (what must work end-to-end)
2. Write Playwright spec in `e2e/` directory
3. Run tests:
   ```bash
   npx playwright test
   ```
4. Debug failures:
   ```bash
   npx playwright test --ui
   # or
   npx playwright test --headed
   ```
5. Use `page.pause()` for interactive debugging
6. Validate coverage: does each critical journey have a test?
7. Document flaky tests in `.github/memory/scratch/working-notes.md`

### Critical User Journeys for This App

- Upload 1 photo → layout gallery appears → select layout → download PNG
- Upload 9 photos → 10th upload attempt is rejected
- Drag photo to swap positions → preview updates

---

## 5. Feature Branch Workflow

```bash
# 1. Create branch
git checkout -b feature/<descriptive-name>

# 2. Write tests first (TDD — see section 1)

# 3. Implement feature

# 4. Lint and test
npm run lint && npm test

# 5. Commit
git add . && git commit -m "feat: <description>"

# 6. Push
git push origin feature/<name>

# 7. Open PR against main
```

---

## 6. Memory System Integration

### Session Start

```bash
cat .github/copilot-instructions.md
cat .github/memory/patterns-discovered.md
cat .github/memory/session-notes.md
```

### During Session

Update `.github/memory/scratch/working-notes.md` with findings as you go.

### Session End

1. Summarize the session into `.github/memory/session-notes.md`
2. Extract new patterns into `.github/memory/patterns-discovered.md`
3. Commit the memory updates:
   ```bash
   git add .github/memory/session-notes.md .github/memory/patterns-discovered.md
   git commit -m "docs: update session notes and patterns"
   ```

---

## 7. Conventional Commit Reference

| Prefix | When to use |
|--------|------------|
| `feat:` | New feature or capability |
| `fix:` | Bug fix |
| `chore:` | Tooling, deps, config (no production code) |
| `docs:` | Documentation changes |
| `test:` | Adding or fixing tests |
| `refactor:` | Refactoring without behavior change |
| `style:` | Formatting only (rare) |
