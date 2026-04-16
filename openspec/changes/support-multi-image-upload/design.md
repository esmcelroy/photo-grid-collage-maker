## Context

The collage experience currently supports up to 9 photos and already enforces count-based layout availability, but requirements do not explicitly define behavior for multi-image selection in one action. This leaves ambiguity around mixed-validity batches, duplicate handling, ordering, and max-capacity edge cases, which in turn weakens confidence in UI proof tests.

The project already has strong unit and UI testing infrastructure (Jest, React Testing Library, Playwright). The design should prioritize deterministic behavior that is easy to verify across these layers.

## Goals / Non-Goals

**Goals:**
- Define deterministic ingestion semantics for multi-image upload from picker and drag-and-drop.
- Ensure capacity enforcement remains correct when adding many files at once.
- Define consistent batch validation and user feedback behavior for accepted vs rejected files.
- Preserve existing layout and customization behaviors while clarifying batch-triggered transitions.
- Make requirements directly translatable into unit, integration, and UI tests.

**Non-Goals:**
- Increasing the 9-photo collage limit.
- Introducing backend upload/storage workflows.
- Redesigning layout algorithms or visual styling controls.
- Adding non-image media support.

## Decisions

1. Batch ingestion is atomic per file, not atomic per batch.
Rationale: Users benefit from partial success (valid files are still accepted), while rejected files are clearly reported. This avoids frustrating all-or-nothing behavior.
Alternatives considered:
- All-or-nothing batch acceptance: simpler to reason about, but poor UX when only one file is invalid.

2. Capacity is enforced by deterministic first-accepted ordering.
Rationale: When remaining slots are fewer than selected files, the system should accept files in the incoming order until capacity is reached, then reject the remainder. This makes outcomes predictable and testable.
Alternatives considered:
- Reject entire batch when overflow occurs: less user-friendly and wastes valid capacity.
- Arbitrary acceptance order: hard to explain and test.

3. Duplicate detection is based on client-side file identity heuristics and applies within the incoming batch and against existing photos.
Rationale: Prevents confusing duplicate thumbnails while remaining implementable without server-side identity.
Alternatives considered:
- Allow duplicates freely: can confuse users and degrade collage quality.
- Strict content hashing: higher implementation cost and slower for common interactions.

4. Layout recalculation occurs after batch processing completes.
Rationale: A single post-batch layout decision avoids intermediate flicker and unstable transitions while still ensuring the selected layout matches final photo count.
Alternatives considered:
- Recalculate after each file: potentially noisy UI transitions.

5. Batch result feedback is explicit and count-oriented.
Rationale: Users should know how many files were accepted and why files were rejected (type, duplicate, capacity). This enables proof-style assertions in automated tests.
Alternatives considered:
- Silent rejection: poor transparency and difficult to validate.

## Risks / Trade-offs

- [Risk] Duplicate heuristics may produce rare false positives/negatives for similarly named files.
  Mitigation: Keep rules stable and documented; cover with targeted tests.

- [Risk] Partial acceptance may surprise users expecting all-or-none behavior.
  Mitigation: Provide explicit batch summary feedback for accepted/rejected files.

- [Risk] Large batch selections can increase client processing time.
  Mitigation: Keep validation lightweight and perform one layout transition per batch.

## Migration Plan

- Update collage capability requirements via delta spec.
- Implement behavior in upload and photo-management paths with unit/component tests first.
- Extend Playwright journeys to verify batch picker and drag/drop outcomes.
- No data migration or backend rollout sequencing is required.
- Rollback strategy: revert to prior upload handling while preserving existing single-file behavior.

## Open Questions

- Should accepted files always be appended, or should users have an option for sorted insertion in future changes?
- What exact feedback surface should be normative (inline message, toast, or both), given current UI patterns?
