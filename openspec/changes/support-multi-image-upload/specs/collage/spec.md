## ADDED Requirements

### Requirement: Batch Upload Feedback
The system SHALL provide user-visible feedback after a multi-image upload action that reports accepted and rejected file counts and SHALL identify rejection categories including invalid type, duplicate, and capacity exceeded.

#### Scenario: Mixed-validity batch reports outcomes
- **GIVEN** the user selects a batch containing valid images, invalid file types, and duplicates
- **WHEN** the batch upload is processed
- **THEN** the system adds only accepted images to the collage
- **AND** the system presents feedback that includes accepted count and rejected count by reason

## MODIFIED Requirements

### Requirement: Upload Limits
The system SHALL allow users to upload between 1 and 9 photos for a collage and SHALL support adding multiple images in a single action via file picker and drag-and-drop.

#### Scenario: Accept batch within remaining capacity
- **GIVEN** 3 photos are already present
- **WHEN** the user adds 4 valid, non-duplicate images in one upload action
- **THEN** the system accepts all 4 images
- **AND** the collage contains 7 photos in total

#### Scenario: Partially accept batch that exceeds capacity
- **GIVEN** 7 photos are already present
- **WHEN** the user adds 4 valid, non-duplicate images in one upload action
- **THEN** the system accepts only the first 2 images from the incoming order
- **AND** the remaining 2 images are rejected for capacity exceeded
- **AND** the collage remains capped at 9 photos

#### Scenario: Reject uploads above limit
- **GIVEN** 9 photos are already present
- **WHEN** the user attempts to add another photo or batch of photos
- **THEN** the system rejects all incoming files
- **AND** the existing 9 photos remain unchanged

### Requirement: Automatic Layout Selection
The system SHALL auto-select a valid layout when photo count changes, including when count changes are caused by a multi-image upload action.

#### Scenario: Initialize layout after batch upload
- **GIVEN** the user uploads multiple photos and no layout is selected
- **WHEN** matching layouts are available for the final photo count after batch processing
- **THEN** the first valid layout is selected
- **AND** photo positions are initialized for each grid area using the final accepted photo set
