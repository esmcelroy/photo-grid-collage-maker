## ADDED Requirements

### Requirement: High-Count Grid Rendering Stability
The system SHALL render a valid, non-overlapping collage preview grid for every supported photo count, including counts above three photos.

#### Scenario: Render stable grid for high counts
- **WHEN** the user has uploaded 4, 6, or 9 photos and a matching layout is selected
- **THEN** every uploaded photo is visible exactly once in the preview
- **AND** no grid area is duplicated or left unassigned for the selected layout

#### Scenario: Render stable grid at extended limit when configured
- **WHEN** the application is configured with valid layouts for 10 to 12 photos and the user selects one of those counts
- **THEN** the preview renders all uploaded photos without overlap or missing assignments

### Requirement: Automated UI Validation For Grid Counts
The system SHALL include automated UI tests that verify grid behavior for representative and boundary photo counts.

#### Scenario: Validate supported and boundary counts in UI tests
- **WHEN** the UI test suite runs
- **THEN** it verifies layout gallery availability and collage preview rendering for 1, 3, 4, 6, and 9 photos
- **AND** it verifies rejection behavior when upload count exceeds the currently supported maximum

## MODIFIED Requirements

### Requirement: Upload Limits
The system SHALL allow users to upload between 1 and the supported maximum photo count for a collage. The default supported maximum SHALL be 9, and implementations MAY support up to 12 when matching layouts are configured.

#### Scenario: Reject uploads above supported maximum
- **GIVEN** the user has already uploaded the supported maximum number of photos
- **WHEN** the user attempts to add another photo
- **THEN** the system rejects the additional upload
- **AND** the existing photos remain unchanged

#### Scenario: Accept uploads through supported maximum
- **WHEN** the user uploads photos up to the supported maximum
- **THEN** each upload is accepted and appears in the collage preview

### Requirement: Layout Availability By Photo Count
The system SHALL present only layouts matching the current photo count and SHALL always provide at least one selectable layout for each supported count.

#### Scenario: Show matching layouts
- **WHEN** the user has uploaded N photos within the supported range
- **THEN** only layouts configured for photo count N are shown

#### Scenario: No empty gallery for supported counts
- **WHEN** the user photo count is within the supported range
- **THEN** the layout gallery is not empty
- **AND** at least one layout can be selected

### Requirement: Automatic Layout Selection
The system SHALL auto-select a valid layout whenever photo count changes and the current layout is missing or invalid for the new count.

#### Scenario: Initialize layout after upload
- **WHEN** the user uploads photos and no valid layout is selected for the current count
- **THEN** the first valid layout for that count is selected
- **AND** photo positions are initialized for each required grid area

#### Scenario: Recover from invalid layout on count increase
- **GIVEN** the user changes from a lower count to a higher count and the prior layout is no longer valid
- **WHEN** layout filtering is recalculated
- **THEN** a valid layout for the new count is auto-selected
- **AND** the preview renders with complete photo assignments
