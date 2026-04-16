## 1. Multi-Image Ingestion Semantics

- [ ] 1.1 Add failing unit/component tests for multi-file picker and drag-drop batch ingestion (full accept, partial accept, full reject at capacity).
- [ ] 1.2 Implement deterministic batch ingestion in upload handling so files are processed in incoming order and accepted until 9-photo limit is reached.
- [ ] 1.3 Ensure duplicate filtering applies against existing photos and within the incoming batch during one upload action.

## 2. Batch Validation And Feedback

- [ ] 2.1 Add failing tests for mixed-validity batches covering invalid file type, duplicate, and capacity-exceeded rejection reasons.
- [ ] 2.2 Implement batch result summary state that records accepted count and rejected count by reason.
- [ ] 2.3 Render user-visible feedback for batch outcomes and verify it updates correctly across consecutive uploads.

## 3. Layout Consistency After Batch Updates

- [ ] 3.1 Add failing tests to verify layout auto-selection runs once per completed batch and targets final accepted photo count.
- [ ] 3.2 Update layout selection flow to avoid intermediate per-file layout churn during batch processing.
- [ ] 3.3 Verify photo position initialization is based on final accepted photos after batch ingestion.

## 4. Proof-Driven Validation

- [ ] 4.1 Expand React Testing Library coverage for upload zone and app-level photo state transitions under batch operations.
- [ ] 4.2 Add or update Playwright journeys for multi-image picker and drag-drop with mixed-validity and overflow scenarios.
- [ ] 4.3 Run targeted test suites and document pass criteria for this change in OpenSpec progress notes.
