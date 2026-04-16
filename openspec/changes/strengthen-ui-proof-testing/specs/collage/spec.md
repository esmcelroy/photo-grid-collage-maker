## MODIFIED Requirements

### Requirement: Upload Limits
The system SHALL allow users to upload between 1 and 9 photos for a collage through the supported upload interactions.

#### Scenario: Accept file-picker uploads within limit
- **GIVEN** fewer than 9 photos are present
- **WHEN** the user selects one or more image files through the file picker
- **THEN** the system adds only the selected image files that fit within the remaining limit
- **AND** the newly added photos appear in the collage workflow

#### Scenario: Reject uploads above limit
- **GIVEN** 9 photos are already present
- **WHEN** the user attempts to add another photo through a supported upload interaction
- **THEN** the system rejects the additional upload
- **AND** the existing 9 photos remain unchanged

### Requirement: Automatic Layout Selection
The system SHALL auto-select a valid layout and initialize preview-ready photo positions when photo count changes after a successful upload.

#### Scenario: Initialize layout after supported upload
- **GIVEN** the user uploads photos through a supported upload interaction and no layout is selected
- **WHEN** matching layouts are available
- **THEN** the first valid layout is selected
- **AND** photo positions are initialized for each grid area
- **AND** the preview becomes render-ready for the uploaded photos

## ADDED Requirements

### Requirement: Upload Interaction Coverage
The delivery workflow SHALL validate the critical upload journey through the same file-picker interaction exposed in the UI.

#### Scenario: File-picker wiring regression is caught
- **GIVEN** an automated UI proof test runs against the application
- **WHEN** the upload control is activated through the visible UI and files are provided through the browser file chooser
- **THEN** the test verifies that the upload completes successfully
- **AND** a broken click-to-picker or label-to-input wiring causes the proof test to fail

### Requirement: UI Proof Evidence
The delivery workflow SHALL produce screenshot evidence for critical collage journeys that prove the application rendered and functioned correctly.

#### Scenario: Proof screenshot is captured for upload and preview
- **GIVEN** the automated UI suite runs a critical upload-and-preview journey
- **WHEN** the collage preview has rendered after a successful upload
- **THEN** the workflow stores a named screenshot artifact showing the rendered application state
- **AND** the artifact is available for local review or CI inspection

#### Scenario: CI keeps a pragmatic proof browser scope
- **GIVEN** the automated UI suite runs in GitHub Actions
- **WHEN** proof-producing tests are executed
- **THEN** at least one maintained browser project runs the critical upload-and-preview journey
- **AND** the workflow is not required to execute every supported browser for that proof run