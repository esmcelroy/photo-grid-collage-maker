---
name: accessible-web-ui
description: "Build strongly accessible web UI components and flows. Use when designing or implementing forms, dialogs, navigation, uploads, interactive widgets, or page layouts that must meet keyboard, screen reader, focus, color-contrast, and error-handling standards."
argument-hint: "Describe the UI feature, target users, and WCAG level (A/AA/AAA)."
user-invocable: true
---

# Strongly Accessible Web UI

Create and ship UI work with accessibility as a first-class requirement, not a final audit task.

## When To Use

Use this skill when you need to:
- Build a new interactive UI (form, modal, menu, tabs, drag/drop, file upload, gallery)
- Refactor an existing UI while preserving behavior and improving accessibility
- Investigate reported usability issues for keyboard and assistive technology users
- Add acceptance tests for accessibility-critical user journeys

## Inputs To Gather First

Collect these inputs before implementation:
- User outcome: what the user must accomplish
- Critical assistive pathways: keyboard-only, screen reader, zoom, high contrast, reduced motion
- Compliance target: WCAG 2.2 AAA by default (override only when explicitly requested)
- Browser/device scope: desktop, mobile, touch, and orientation constraints

If any input is missing, ask before writing production code.

## Workflow

1. Define accessibility acceptance criteria
- Translate the feature ask into testable criteria.
- Include semantic structure, keyboard order, focus behavior, labels/instructions, errors, and announcements.
- Add explicit non-goals to avoid over-scoping.

2. Choose semantic-first structure
- Prefer native elements (`button`, `a`, `input`, `select`, `dialog`, `fieldset`, `legend`) before ARIA-heavy custom widgets.
- Use ARIA only to fill semantic gaps, never to override correct native semantics.
- Ensure landmarks and heading hierarchy are meaningful.

3. Plan interaction model
- Define keyboard support for each control (Tab, Shift+Tab, Enter, Space, Arrow keys, Escape).
- Define focus entry, movement, trapping (if modal), and return focus on close.
- Define status messaging (`aria-live`) for async states (loading, success, failure).
- For composite widgets (tabs, menu/menuitem, listbox/option, grid), define the exact key map and focus strategy (`aria-activedescendant` or roving tabindex) before coding.

4. Model composite widgets explicitly when needed
- Map each custom part to an expected role and state (`aria-selected`, `aria-expanded`, `aria-controls`, `aria-current`).
- Ensure one clear active item model and one clear selection model.
- Keep Tab behavior predictable: Tab exits/enters the widget; arrow keys move within the widget.

5. Implement visible and non-visual affordances
- Add persistent labels, help text, and programmatic relationships (`id`, `htmlFor`, `aria-describedby`).
- Ensure focus indicators are always visible and not color-only.
- Make target sizes and spacing touch-friendly.

6. Handle error states accessibly
- Validate with clear inline guidance and summary context where needed.
- Set `aria-invalid` and associate error messages with fields.
- Move focus to the first actionable error after submit failures.

7. Verify contrast, motion, and zoom behavior
- Check text/UI contrast against target WCAG level.
- Respect reduced motion preferences for animations.
- Validate at 200% zoom and reflow behavior without hidden critical actions.
- Ensure conformance checks align with WCAG 2.2 AAA unless a different target is supplied.

8. Test with layered coverage
- Unit/integration: assert roles, names, keyboard interactions, and focus movement.
- End-to-end: validate core journeys with keyboard-only navigation.
- Manual spot checks: screen reader pass, high contrast pass, mobile/touch pass.

9. Ship readiness review
- Confirm all acceptance criteria pass.
- Document known limitations and mitigation plan.
- Include accessibility notes in PR summary.

## Decision Points

Use this branching logic during implementation:
- Need custom control behavior? Start with native element and enhance; build custom widget only if native cannot satisfy interaction requirements.
- Dynamic updates not obvious visually? Add polite/assertive live region depending on urgency.
- Modal-like surface? Trap focus only while open and restore focus to triggering control on close.
- Color used to convey meaning? Add text/icon/shape redundancy.
- Animation introduces cognitive load? Provide reduced-motion alternative.
- Composite widget required? Choose a documented ARIA pattern and encode its full key behavior in tests.

## Completion Checklist

A change is complete only when all are true:
- Keyboard-only usage works end-to-end without dead-ends
- Interactive elements expose correct accessible names and roles
- Focus order is logical and visible at all times
- Errors are announced and actionable
- Contrast and zoom checks meet the agreed target
- Composite widget behavior matches its expected keyboard and state model
- Automated tests cover at least one happy path and one failure path for accessibility-critical behavior
- No critical or serious issues remain in accessibility audit output

## Output Expectations

When this skill is invoked, produce:
- Accessibility acceptance criteria for the feature
- Implementation plan with semantic + interaction decisions
- Code/test changes validating keyboard, focus, and announcement behavior
- Brief accessibility QA notes suitable for PR description
