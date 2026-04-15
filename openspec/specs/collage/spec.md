# Collage

## Purpose
Define the expected user-facing behavior for the photo collage builder, including upload constraints, layout behavior, customization controls, and export.

## Requirements

### Requirement: Upload Limits
The system SHALL allow users to upload between 1 and 9 photos for a collage.

#### Scenario: Reject uploads above limit
- **GIVEN** 9 photos are already present
- **WHEN** the user attempts to add another photo
- **THEN** the system rejects the additional upload
- **AND** the existing 9 photos remain unchanged

### Requirement: Layout Availability By Photo Count
The system SHALL present only layouts matching the current photo count.

#### Scenario: Show matching layouts
- **GIVEN** the user has uploaded N photos
- **WHEN** the layout gallery is displayed
- **THEN** only layouts configured for photo count N are shown

### Requirement: Automatic Layout Selection
The system SHALL auto-select a valid layout when photo count changes.

#### Scenario: Initialize layout after upload
- **GIVEN** the user uploads photos and no layout is selected
- **WHEN** matching layouts are available
- **THEN** the first valid layout is selected
- **AND** photo positions are initialized for each grid area

### Requirement: Collage Customization
The system SHALL allow collage customization for spacing, corner radius, and background color.

#### Scenario: Apply settings changes
- **GIVEN** the user updates gap, border radius, or background color
- **WHEN** the preview rerenders
- **THEN** the collage reflects the updated settings immediately

### Requirement: PNG Export
The system SHALL export the collage preview as a PNG file.

#### Scenario: Download rendered preview
- **GIVEN** a rendered collage preview is visible
- **WHEN** the user clicks download
- **THEN** the system renders the preview to an image
- **AND** triggers a PNG file download in the browser
