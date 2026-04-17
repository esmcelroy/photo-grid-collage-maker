# Testing Guidelines

> **Audience:** AI assistants and developers writing tests for this project.
> This document is the authoritative reference for test patterns and standards.
> Follow it without requiring further instruction.

---

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Test Types and When to Use Each](#test-types-and-when-to-use-each)
3. [What to Test (Frontend)](#what-to-test-frontend)
4. [What NOT to Test](#what-not-to-test)
5. [Component Test Patterns](#component-test-patterns-react-testing-library)
6. [Pure Function Test Patterns](#pure-function-test-patterns-jest)
7. [API Test Patterns (Future)](#api-test-patterns-future--jest--supertest)
8. [Playwright E2E Patterns](#playwright-e2e-patterns)
9. [Test File Conventions](#test-file-conventions)
10. [TDD Cycle Reminder](#tdd-cycle-reminder)

---

## Testing Philosophy

### TDD: Red → Green → Refactor

Always write tests before implementation:

1. **RED** — Write a failing test that describes the desired behavior.
2. **GREEN** — Write the minimum code required to make the test pass.
3. **REFACTOR** — Clean up the implementation without breaking tests.

Never skip straight to implementation. A test written after the fact does not drive design — it only verifies what was already built.

### Test Behavior, Not Implementation

Tests should describe *what* the code does from the outside, not *how* it does it internally. Avoid:
- Asserting on internal state variables
- Testing private methods directly
- Coupling tests to component structure that may be refactored

This keeps tests resilient to refactoring — if the behavior is unchanged, no tests should break.

### Tests as Living Documentation

A well-written test suite reads like a spec. Test descriptions (`describe`/`it` strings) should be written in plain English that a non-engineer can understand. The full test name should read as a sentence:

```
UploadZone › calls onFilesSelected when valid images are dropped
```

---

## Test Types and When to Use Each

| Type | Tool | Scope | When to Use |
|------|------|-------|-------------|
| **Unit** | Jest + RTL | Single component or pure function | Always — for pure functions and component rendering |
| **Integration** | Jest + RTL | Component + hooks + state together | Feature-level behavior across multiple connected units |
| **API** | Jest + Supertest | Backend routes | Backend changes (future phase — not applicable yet) |
| **E2E / UI** | Playwright | Critical full user journeys | Flows that can't be confidently validated at lower levels |
| **Manual** | Browser | Visual/exploratory | Layout bugs, animations, drag-and-drop feel, edge cases |

### Current State

The project now includes:

- **Unit/Integration:** Jest + React Testing Library (`jest.config.ts`, `src/__tests__/setup.ts`)
- **Accessibility:** jest-axe for automated WCAG compliance checks
- **API (future):** Jest + Supertest
- **E2E:** Playwright (`playwright.config.ts`, `e2e/journeys/`, `e2e/pages/`, `e2e/fixtures/`)

---

## What to Test (Frontend)

Focus testing effort on behavior that would break user experience if it regressed:

- **Component rendering:** Does the component render correctly with various prop combinations, including boundary values?
- **User interactions:** Do clicks, drags, and keyboard input produce the correct state changes and UI updates?
- **Error states:** Are error messages, empty states, and validation feedback displayed correctly?
- **Edge cases specific to this app:**
  - 0 photos uploaded (empty state)
  - Exactly 9 photos (the enforced maximum)
  - More than 9 photos attempted (limit enforcement)
  - Unsupported file types (non-image files)
  - Corrupt or unreadable files

---

## What NOT to Test

Avoid testing things that are not your code's responsibility or that change too frequently to be stable:

- **Third-party library internals** — Do not test Radix UI, Framer Motion, or any external component's own behavior.
- **CSS and styling details** — Do not assert on class names, colors, or pixel measurements. These belong in visual/manual testing.
- **Implementation details** — Do not assert on internal React state, component refs, or private variables. If you find yourself inspecting internals to write a test, the test is testing the wrong thing.
- **Framework behavior** — Do not test that React renders or that TypeScript types resolve correctly.

---

## Component Test Patterns (React Testing Library)

### Setup

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
```

### Query Priority

Use the most semantically meaningful query available, in this order:

1. `getByRole` — preferred; mirrors how assistive technologies see the page
2. `getByLabelText` — for form inputs associated with a label
3. `getByPlaceholderText` — fallback for inputs without a label
4. `getByText` — for buttons, headings, or body text
5. `getByTestId` — last resort; only use when no semantic query works

### `userEvent` vs `fireEvent`

- **Prefer `userEvent`** — it simulates realistic browser interactions (focus, hover, keyboard sequences).
- **Use `fireEvent`** only for low-level events that `userEvent` cannot simulate (e.g., custom drag events).

`userEvent` requires setup in each test:

```typescript
const user = userEvent.setup()
await user.click(button)
```

### Async Interactions

Wrap async state updates in `waitFor` or use `await` with `userEvent`:

```typescript
await waitFor(() => expect(screen.getByText('Upload complete')).toBeVisible())
```

### UploadZone Example

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UploadZone } from '@/components/UploadZone'

describe('UploadZone', () => {
  it('calls onFilesSelected when valid images are dropped', async () => {
    const onFilesSelected = jest.fn()
    render(<UploadZone onFilesSelected={onFilesSelected} currentFileCount={0} />)

    const dropzone = screen.getByRole('region', { name: /upload/i })
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })

    await userEvent.upload(dropzone, file)
    expect(onFilesSelected).toHaveBeenCalledWith([file])
  })

  it('does not accept uploads when the 9-photo limit is reached', async () => {
    const onFilesSelected = jest.fn()
    render(<UploadZone onFilesSelected={onFilesSelected} currentFileCount={9} />)

    const dropzone = screen.getByRole('region', { name: /upload/i })
    const file = new File(['img'], 'extra.jpg', { type: 'image/jpeg' })

    await userEvent.upload(dropzone, file)
    expect(onFilesSelected).not.toHaveBeenCalled()
  })

  it('shows an error message for unsupported file types', async () => {
    render(<UploadZone onFilesSelected={jest.fn()} currentFileCount={0} />)

    const dropzone = screen.getByRole('region', { name: /upload/i })
    const file = new File(['data'], 'document.pdf', { type: 'application/pdf' })

    await userEvent.upload(dropzone, file)
    expect(screen.getByRole('alert')).toHaveTextContent(/unsupported file type/i)
  })
})
```

---

## Pure Function Test Patterns (Jest)

Pure functions (no side effects, no React) should be tested with straightforward Jest unit tests. No rendering required.

### layouts.ts Example

```typescript
import { getLayoutsForPhotoCount } from '@/lib/layouts'

describe('getLayoutsForPhotoCount', () => {
  it('returns layouts for the exact photo count', () => {
    const layouts = getLayoutsForPhotoCount(2)
    expect(layouts.every(l => l.photoCount === 2)).toBe(true)
  })

  it('returns an empty array for 0 photos', () => {
    expect(getLayoutsForPhotoCount(0)).toHaveLength(0)
  })

  it('returns an empty array for counts above the maximum', () => {
    expect(getLayoutsForPhotoCount(10)).toHaveLength(0)
  })
})
```

### General Guidelines for Pure Function Tests

- Test one logical case per `it` block.
- Cover the happy path, edge cases (0, max, boundary values), and invalid inputs.
- Do not mock dependencies that are pure functions themselves — call them directly.

---

## API Test Patterns (Future — Jest + Supertest)

> **Note:** The backend does not exist yet. These patterns apply when REST API routes are added in a future phase.

### Setup

```typescript
import request from 'supertest'
import { app } from '../app'
```

### Pattern: POST endpoint with file upload

```typescript
describe('POST /api/photos', () => {
  it('returns 201 with photo metadata on success', async () => {
    const res = await request(app)
      .post('/api/photos')
      .attach('file', 'src/__tests__/fixtures/test-image.jpg')

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(res.body).toHaveProperty('url')
  })

  it('returns 400 when no file is attached', async () => {
    const res = await request(app).post('/api/photos')
    expect(res.status).toBe(400)
  })

  it('returns 415 for unsupported file types', async () => {
    const res = await request(app)
      .post('/api/photos')
      .attach('file', 'src/__tests__/fixtures/document.pdf')
    expect(res.status).toBe(415)
  })
})
```

### Guidelines

- Each test should be isolated — use `beforeEach`/`afterEach` to reset database state.
- Do not share state between tests via module-level variables.
- Use fixture files in `src/__tests__/fixtures/` for test assets.
- Assert on both status codes and response body shape.

---

## Playwright E2E Patterns

### Directory

Place all E2E tests in `e2e/` at the project root:

```
e2e/
  collage-journey.spec.ts
  photo-limit.spec.ts
```

### Query Strategy

Prefer semantic locators — they are resilient to markup changes and reflect how users interact with the page:

```typescript
// ✅ Preferred
page.getByRole('button', { name: /download/i })
page.getByText('Add photos')
page.getByLabel('Layout selection')

// ❌ Avoid
page.locator('.upload-zone__button')
page.locator('#btn-download')
```

### Assertion Style

Use `expect(locator).toBeVisible()` rather than raw DOM assertions:

```typescript
await expect(page.getByRole('img', { name: /collage preview/i })).toBeVisible()
```

### Critical User Journeys to Automate

Only automate journeys where a regression would be high-impact and not caught by unit/integration tests:

1. **Upload → Layout → Download**
   - Upload a photo → a layout appears in the preview → click Download → file is saved.

2. **9-photo limit enforcement**
   - Upload 9 photos → attempt to upload a 10th → verify the UI enforces the limit.

3. **Layout switching**
   - Upload multiple photos → select different layout options → verify the preview updates for each.

### Example: Upload → Download Journey

```typescript
import { test, expect } from '@playwright/test'
import path from 'path'

test('upload photo → layout appears → download collage', async ({ page }) => {
  await page.goto('/')

  const fileInput = page.getByLabel(/upload/i)
  await fileInput.setInputFiles(path.join(__dirname, 'fixtures/test-image.jpg'))

  await expect(page.getByRole('region', { name: /collage preview/i })).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /download/i }).click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/collage/)
})
```

---

## Test File Conventions

### Colocation (Unit and Integration)

Test files live next to the source files they test:

```
src/
  components/
    UploadZone.tsx
    UploadZone.test.tsx          ← unit/integration test
  lib/
    layouts.ts
    layouts.test.ts              ← pure function test
```

### E2E Tests

```
e2e/
  collage-journey.spec.ts
  photo-limit.spec.ts
```

### Test Fixtures

Shared test assets (images, files) used across multiple tests:

```
src/
  __tests__/
    fixtures/
      test-image.jpg
      test-image-2.jpg
      document.pdf              ← for unsupported-type tests
```

### Naming Rules

| File type | Suffix |
|-----------|--------|
| Unit / integration (React) | `.test.tsx` |
| Unit / integration (TS only) | `.test.ts` |
| Playwright E2E | `.spec.ts` |

---

## Accessibility Testing (jest-axe)

Every component that renders interactive or structural UI should include an automated accessibility check using `jest-axe`. This catches WCAG violations (missing labels, color contrast, heading order, etc.) before they reach production.

### Pattern

```typescript
import { axe } from 'jest-axe'

it('has no accessibility violations', async () => {
  const { container } = render(<MyComponent {...requiredProps} />)
  const results = await axe(container)
  expect(results).toHaveNoViolations()
})
```

### Guidelines

- Add a `toHaveNoViolations()` test to every new component test file
- The `jest-axe/extend-expect` import in `src/__tests__/setup.ts` makes `toHaveNoViolations` available globally
- If a violation is intentional (e.g., decorative images with `alt=""`), configure axe rules to exclude it:
  ```typescript
  const results = await axe(container, {
    rules: { 'image-alt': { enabled: false } }
  })
  ```
- Accessibility tests complement (but do not replace) manual screen reader testing and Lighthouse audits

### Components with a11y tests

| Component | File |
|---|---|
| UploadZone | `src/components/UploadZone.test.tsx` |
| CollagePreview | `src/components/CollagePreview.test.tsx` |
| LayoutGallery | `src/components/LayoutGallery.test.tsx` |
| AppFooter | `src/components/AppFooter.test.tsx` |

### Signoff Requirement

**All new features must pass a jest-axe accessibility check before merge.** This is enforced by including `toHaveNoViolations()` in the component's test suite. Lighthouse accessibility score must remain at 100.

---

## TDD Cycle Reminder

```
1. RED    → Write the test. Run it. It MUST fail.
2. GREEN  → Write the minimum code to make it pass. Nothing more.
3. REFACTOR → Clean up. Run tests again. All must still pass.
```

**Do not skip RED.** A test that was never red may not actually test anything. Seeing it fail first confirms it is wired correctly and catches the real behavior.

When adding a feature:
1. Start with the test file.
2. Run the test suite — confirm the new test fails with a clear, expected error.
3. Implement.
4. Run again — confirm it passes.
5. Refactor if needed.
