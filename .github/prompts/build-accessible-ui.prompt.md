---
description: Build a strongly accessible web UI feature with WCAG 2.2 AAA-first criteria
mode: agent
agent: tdd-developer
tools: ['search', 'read', 'edit', 'execute', 'todo']
---

Implement an accessibility-first UI feature using the `accessible-web-ui` skill.

## Inputs
- `feature`: UI feature to build or improve
- `constraints` (optional): product, design, or platform constraints
- `complianceTarget` (optional): Defaults to WCAG 2.2 AAA

## Instructions

### Step 1 — Define Acceptance Criteria First
Create explicit, testable criteria for:
1. Semantic structure and landmarks
2. Keyboard support and focus management
3. Programmatic labels/instructions
4. Error messaging and announcements
5. Contrast, zoom, and reduced-motion behavior
6. Composite widget behavior (tabs/menu/listbox/grid): key map, active item strategy, and ARIA state model

### Step 2 — TDD Start (Red)
Write or update tests before implementation:
- Component/integration tests for roles, names, focus movement, and keyboard interactions
- Include at least one failure-path accessibility test
- Keep tests aligned with repo testing patterns
- For composite widgets, add tests for arrow-key navigation and state transitions (`aria-selected`/`aria-expanded`/`aria-current` as applicable)

### Step 3 — Implement (Green)
Implement the feature with semantic-first HTML and minimal ARIA.
- Prefer native controls over custom widgets
- Preserve visible focus styles
- Add `aria-live` messaging for async status when required
- Ensure error states are actionable and linked to inputs

### Step 4 — Validate and Refactor
Run relevant tests, fix failures, then refactor safely.
- Keep behavior intact while reducing accessibility complexity
- Re-check keyboard-only journey end-to-end

### Step 5 — Report
Return:
- Accessibility acceptance criteria
- Files changed
- Test coverage added for accessibility behavior
- Remaining risks or deferred accessibility items

If Playwright coverage is required, stop after Step 5 and hand off to `/create-ui-tests`.
