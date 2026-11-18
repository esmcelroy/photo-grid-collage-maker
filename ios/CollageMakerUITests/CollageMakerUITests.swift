import XCTest

/// Observable UI contract for the native app shell.
///
/// These tests drive the installed app through accessibility labels, identifiers,
/// and visible text. They do not call production helpers or assert on private state.
///
/// The editing workspace is one screen: a pinned preview above `workspaceControls`,
/// with Photos, Layout and Style inline. Save persists the draft without leaving
/// that screen. Projects asks before discarding a dirty draft.
@MainActor
final class CollageMakerUITests: XCTestCase {
    private let normalContentSizeCategory = "UICTContentSizeCategoryL"
    private let largeContentSizeCategory = "UICTContentSizeCategoryAccessibilityXXXL"
    private let focusLayouts = [
        (id: "layout.2-left-large", label: "Left Focus"),
        (id: "layout.2-right-large", label: "Right Focus"),
        (id: "layout.2-top-large", label: "Top Focus"),
        (id: "layout.2-bottom-large", label: "Bottom Focus"),
    ]
    private var verifiedLayoutScaling: Set<String> = []
    /// Visual choice whose composition ratio differs from the default two-photo layout.
    /// Side by Side and Left Focus are both 16:9, so a ratio check cannot tell them apart.
    private let alternateTwoPhotoLayoutID = "layout.2-vertical"

    override func setUp() async throws {
        try await super.setUp()
        continueAfterFailure = false
        verifiedLayoutScaling.removeAll()
        XCUIDevice.shared.appearance = .light
    }

    override func tearDown() async throws {
        XCUIDevice.shared.appearance = .light
        try await super.tearDown()
    }


    func testRealPickerImportsAndReopensProject() throws {
        let app = launchedApp()
        let create = app.buttons["New Collage"]
        XCTAssertTrue(create.waitForExistence(timeout: 10))
        XCTAssertTrue(reveal(create, in: app))
        create.tap()
        XCTAssertTrue(workspaceIsVisible(in: app))
        XCTAssertFalse(app.sheets.firstMatch.exists, "The project opens as a pushed screen, not a sheet.")
        let count = app.staticTexts["projectPhotoCount"]
        XCTAssertTrue(count.waitForExistence(timeout: 10))
        XCTAssertEqual(count.label, "0 of 16 photos")
        XCTAssertTrue(app.staticTexts["Photos"].exists)
        XCTAssertTrue(app.staticTexts["Layout"].exists)
        XCTAssertTrue(app.staticTexts["Style"].exists)
        XCTAssertFalse(app.buttons["editCollage"].exists)
        XCTAssertFalse(app.buttons["editStyle"].exists)
        XCTAssertFalse(app.navigationBars["Edit collage"].exists)
        XCTAssertFalse(app.navigationBars["Style"].exists)
        attachScreenshot(of: app, named: "project-empty")
        try app.performAccessibilityAudit()
        app.buttons["addPhotos"].tap()
        XCTAssertTrue(app.buttons["Cancel"].waitForExistence(timeout: 10), app.debugDescription)
        app.buttons["Cancel"].tap()
        XCTAssertEqual(count.label, "0 of 16 photos")
        XCTAssertFalse(app.staticTexts["importStatus"].exists)
        app.buttons["addPhotos"].tap()
        let photos = app.images.matching(NSPredicate(format: "label BEGINSWITH %@", "Photo,"))
        XCTAssertTrue(photos.firstMatch.waitForExistence(timeout: 30), "Seed the simulator with ios/scripts/seed-simulator-photos.py first.\n\(app.debugDescription)")
        XCTAssertGreaterThanOrEqual(photos.count, 2)
        // The out-of-process picker exposes image frames but no XCTest hit point on iOS 26.
        // Touch their actual centers; selection and import are still entirely system UI driven.
        photos.element(boundBy: 0).coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        photos.element(boundBy: 1).coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        attachScreenshot(of: app, named: "system-picker")
        let confirm = app.buttons.matching(NSPredicate(format: "label == %@ OR label == %@", "Add", "Done")).firstMatch
        XCTAssertTrue(confirm.isEnabled, app.debugDescription)
        confirm.tap()
        let imported = expectation(for: NSPredicate(format: "label == %@", "2 of 16 photos"), evaluatedWith: count)
        wait(for: [imported], timeout: 30)
        let preview = collagePreview(in: app)
        let ready = expectation(for: NSPredicate(format: "label == %@", "Collage preview, 2 photos"), evaluatedWith: preview)
        wait(for: [ready], timeout: 15)
        let importedRatio = try previewRatio(in: app)
        attachScreenshot(of: app, named: "project-imported")
        try verifyLayoutLabelScaling(in: app)
        try auditWorkspace(in: app)

        // Layout choices are visual buttons. The preview must follow the choice before Save,
        // so a preview still bound to the last saved layout fails here. Stacked is 9:16;
        // Side by Side is 16:9, so the accessible composition frame has to change shape.
        let stacked = app.buttons[alternateTwoPhotoLayoutID]
        XCTAssertTrue(revealInWorkspace(stacked, in: app))
        XCTAssertEqual(stacked.label, "Stacked")
        XCTAssertFalse(stacked.isSelected)
        XCTAssertTrue(app.buttons["layout.2-horizontal"].isSelected)
        stacked.tap()
        XCTAssertTrue(stacked.isSelected)
        XCTAssertFalse(app.buttons["layout.2-horizontal"].isSelected)
        let layoutApplied = expectation(for: NSPredicate { _, _ in
            let frame = preview.frame
            return frame.width > 20 && frame.height > frame.width * 1.4
        }, evaluatedWith: preview)
        wait(for: [layoutApplied], timeout: 10)
        XCTAssertEqual(preview.label, "Collage preview, 2 photos")
        let stackedRatio = try previewRatio(in: app)
        XCTAssertLessThan(stackedRatio, 0.72, "Stacked preview must use the 9:16 composition, not the saved 16:9 layout.")
        XCTAssertGreaterThan(importedRatio / stackedRatio, 2.5)
        let stackedPane = projectPreview(in: app).frame
        let stackedPreview = preview.frame
        XCTAssertTrue(
            // AX container widths use Float precision: shared edges can differ by ~0.00001pt.
            stackedPane.insetBy(dx: -0.001, dy: -0.001).contains(stackedPreview),
            "Stacked preview must stay inside the pinned pane. pane=\(stackedPane) preview=\(stackedPreview)"
        )
        XCTAssertTrue(app.buttons["saveEdits"].exists, "Choosing a layout dirties the draft before Save.")
        XCTAssertTrue(app.staticTexts["draftStatus"].exists)

        XCTAssertTrue(revealInWorkspace(app.buttons["photoSlot.a"], in: app))
        selectPhotoSlot("a", in: app)
        XCTAssertTrue(app.buttons["photoSlot.a"].isSelected)
        XCTAssertTrue(revealInWorkspace(app.buttons["rotateClockwise"], in: app))
        app.buttons["rotateClockwise"].tap()
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 90°")
        positionInWorkspace(app.sliders["Horizontal position"], in: app)
        app.sliders["Horizontal position"].adjust(toNormalizedSliderPosition: 0.2)
        positionInWorkspace(app.sliders["Vertical position"], in: app)
        app.sliders["Vertical position"].adjust(toNormalizedSliderPosition: 0.8)
        let horizontalValue = try XCTUnwrap(app.sliders["Horizontal position"].value as? String)
        let verticalValue = try XCTUnwrap(app.sliders["Vertical position"].value as? String)
        XCTAssertLessThan(try XCTUnwrap(Double(horizontalValue.components(separatedBy: CharacterSet.decimalDigits.inverted).joined())), 40)
        XCTAssertGreaterThan(try XCTUnwrap(Double(verticalValue.components(separatedBy: CharacterSet.decimalDigits.inverted).joined())), 60)
        let zoom = app.steppers["photoZoom"]
        XCTAssertTrue(revealInWorkspace(zoom, in: app))
        zoom.buttons["photoZoom-Increment"].tap()
        let zoomed = expectation(for: NSPredicate(format: "label == %@", "Zoom: 105%"), evaluatedWith: zoom)
        wait(for: [zoomed], timeout: 5)
        XCTAssertTrue(revealInWorkspace(app.buttons["swapPicker"], in: app))
        XCTAssertFalse(app.buttons["swapPhotos"].isEnabled)
        attachScreenshot(of: app, named: "editor-disabled-swap")
        try auditWorkspace(in: app)

        // Swap is below the position captions. Searching upward from here walks past them.
        XCTAssertTrue(revealInWorkspace(app.staticTexts["photoControls"], in: app, direction: .down))
        let caption = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Horizontal position: ")).firstMatch
        let controls = workspaceControls(in: app)
        for element in [caption, app.buttons["slotPicker"]] {
            XCTAssertTrue(revealInWorkspace(element, in: app))
            XCTAssertGreaterThanOrEqual(element.frame.minY, controls.frame.minY - 1)
            XCTAssertLessThanOrEqual(element.frame.maxY, app.frame.maxY - 24)
        }
        attachScreenshot(of: app, named: "editor-visible-contrast-controls")
        try app.performAccessibilityAudit(for: .contrast)
        XCTAssertTrue(revealInWorkspace(app.buttons["swapPicker"], in: app))

        app.buttons["swapPicker"].tap()
        menuOption("Slot 2 · Photo 2", in: app).tap()
        app.buttons["swapPhotos"].tap()
        XCTAssertTrue(app.buttons["slotPicker"].label.contains("Photo 2"))
        attachScreenshot(of: app, named: "editor-adjustments")
        try auditWorkspace(in: app)
        scrollWorkspace(toTopIn: app)
        attachScreenshot(of: app, named: "editor-edited-preview")

        // Save stays on the workspace. Add Photos and Export stay disabled until then.
        XCTAssertFalse(app.buttons["addPhotos"].isEnabled)
        XCTAssertTrue(app.staticTexts["addPhotosBlocked"].exists)
        XCTAssertTrue(app.staticTexts["addPhotosBlocked"].label.contains("Save or discard"))
        XCTAssertFalse(app.buttons["exportCollage"].isEnabled)
        XCTAssertTrue(app.staticTexts["draftStatus"].label.contains("Unsaved"))
        let saveBar = app.buttons["saveEdits"]
        let discardBar = app.buttons["Discard"]
        XCTAssertTrue(saveBar.exists)
        XCTAssertTrue(discardBar.exists)
        // The save bar exists only while dirty, so the controls viewport is shorter then.
        // Compare the pinned preview across Save; do not expect the controls frame to stay.
        let paneBeforeSave = projectPreview(in: app).frame
        let dirtyControls = workspaceControls(in: app).frame
        XCTAssertLessThan(saveBar.frame.maxY, app.frame.maxY - 8)
        XCTAssertLessThan(discardBar.frame.maxY, app.frame.maxY - 8)
        XCTAssertGreaterThanOrEqual(saveBar.frame.minY, dirtyControls.maxY - 1)
        XCTAssertGreaterThanOrEqual(discardBar.frame.minY, dirtyControls.maxY - 1)
        saveBar.tap()
        let saved = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: saveBar)
        wait(for: [saved], timeout: 10)
        XCTAssertTrue(workspaceIsVisible(in: app))
        XCTAssertFalse(app.navigationBars["Export"].exists)
        XCTAssertFalse(app.buttons["Discard"].exists)
        XCTAssertEqual(projectPreview(in: app).frame, paneBeforeSave)
        XCTAssertGreaterThan(workspaceControls(in: app).frame.height, dirtyControls.height)
        XCTAssertTrue(app.buttons["addPhotos"].isEnabled)
        XCTAssertFalse(app.staticTexts["addPhotosBlocked"].exists)
        XCTAssertTrue(app.buttons["exportCollage"].isEnabled)
        XCTAssertEqual(preview.label, "Collage preview, 2 photos")
        try exportThroughShareSheet(in: app)

        app.buttons["closeProject"].tap()
        XCTAssertFalse(app.alerts["Discard changes?"].exists)
        let savedProject = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "savedProject-", "2 of 16 photos")).firstMatch
        XCTAssertTrue(savedProject.waitForExistence(timeout: 10))
        let savedID = savedProject.identifier
        attachScreenshot(of: app, named: "library-saved")
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons[savedID].waitForExistence(timeout: 10))
        app.buttons[savedID].tap()
        XCTAssertTrue(workspaceIsVisible(in: app))
        XCTAssertEqual(count.label, "2 of 16 photos")
        let reopened = expectation(for: NSPredicate(format: "label == %@", "Collage preview, 2 photos"), evaluatedWith: preview)
        wait(for: [reopened], timeout: 15)
        let reopenedRatio = try previewRatio(in: app)
        XCTAssertEqual(reopenedRatio, stackedRatio, accuracy: 0.08)
        XCTAssertLessThan(reopenedRatio, 0.72)
        attachScreenshot(of: app, named: "project-reopened")
        XCTAssertTrue(app.buttons[alternateTwoPhotoLayoutID].isSelected)
        XCTAssertTrue(revealInWorkspace(app.buttons["photoSlot.a"], in: app))
        selectPhotoSlot("a", in: app)
        XCTAssertTrue(app.buttons["slotPicker"].label.contains("Photo 2"))
        XCTAssertTrue(app.staticTexts["photoRotation"].isHittable)
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 90°")
        XCTAssertEqual(app.steppers["photoZoom"].label, "Zoom: 105%")
        XCTAssertEqual(app.sliders["Horizontal position"].value as? String, horizontalValue)
        XCTAssertEqual(app.sliders["Vertical position"].value as? String, verticalValue)
        app.buttons["resetPhoto"].tap()
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 0°")
        XCTAssertEqual(app.steppers["photoZoom"].label, "Zoom: 100%")
        XCTAssertEqual(app.sliders["Horizontal position"].value as? String, "50 percent")
        XCTAssertEqual(app.sliders["Vertical position"].value as? String, "50 percent")

        // An edited draft cannot be swiped away. Projects asks before discarding it.
        assertWorkspaceStaysAfterEdgeSwipe(in: app)
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 0°")
        app.buttons["closeProject"].tap()
        let discardAlert = app.alerts["Discard changes?"]
        XCTAssertTrue(discardAlert.waitForExistence(timeout: 5))
        XCTAssertTrue(discardAlert.staticTexts["Your edits to this collage haven't been saved."].exists)
        attachScreenshot(of: app, named: "editor-discard-alert")
        try auditDiscardAlert(discardAlert, in: app)
        app.buttons["keepEditing"].firstMatch.tap()
        XCTAssertTrue(discardAlert.waitForNonExistence(timeout: 5))
        XCTAssertTrue(workspaceIsVisible(in: app))
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 0°")
        app.buttons["closeProject"].tap()
        XCTAssertTrue(discardAlert.waitForExistence(timeout: 5))
        app.buttons["discardEdits"].firstMatch.tap()
        XCTAssertTrue(libraryNavigationTitle(in: app).waitForExistence(timeout: 5))
        app.buttons[savedID].tap()
        XCTAssertTrue(workspaceIsVisible(in: app))
        // A reopened draft has no slot selected, so rotation is hidden until a strip tap.
        XCTAssertFalse(app.staticTexts["photoRotation"].exists)
        XCTAssertTrue(revealInWorkspace(app.buttons["photoSlot.a"], in: app))
        selectPhotoSlot("a", in: app)
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 90°")

        // Style is inline on the same draft, so photo adjustments stay put.
        // It sits above the Photo section the strip tap just revealed.
        let gap = app.sliders["styleGap"]
        let radius = app.sliders["styleRadius"]
        XCTAssertTrue(revealStyle(gap, in: app))
        positionInWorkspace(gap, in: app)
        XCTAssertEqual(gap.value as? String, "8 points")
        XCTAssertTrue(revealInWorkspace(radius, in: app))
        positionInWorkspace(radius, in: app)
        XCTAssertEqual(radius.value as? String, "0 points")
        attachScreenshot(of: app, named: "editor-style-default-controls")
        try auditWorkspace(in: app)
        gap.adjust(toNormalizedSliderPosition: 0.65)
        positionInWorkspace(radius, in: app)
        radius.adjust(toNormalizedSliderPosition: 0.4)
        let savedGap = try XCTUnwrap(gap.value as? String)
        let savedRadius = try XCTUnwrap(radius.value as? String)
        XCTAssertNotEqual(savedGap, "8 points")
        XCTAssertNotEqual(savedRadius, "0 points")
        selectBackground("Lavender", in: app)
        XCTAssertEqual(app.staticTexts["backgroundStatus"].label, "Background: Lavender")
        attachScreenshot(of: app, named: "editor-style-lavender-controls")
        try app.performAccessibilityAudit(for: .contrast)
        try auditWorkspace(in: app, for: .all.subtracting(.contrast))
        let customColor = app.buttons["background.custom"]
        XCTAssertTrue(revealInWorkspace(customColor, in: app))
        customColor.tap()
        let closeColorPicker = app.buttons["close"]
        XCTAssertTrue(closeColorPicker.waitForExistence(timeout: 10), app.debugDescription)
        attachScreenshot(of: app, named: "editor-custom-background-picker")
        closeColorPicker.tap()
        XCTAssertEqual(app.staticTexts["backgroundStatus"].label, "Background: Lavender")

        customColor.tap()
        let opacity = app.sliders["sliderAlpha"]
        XCTAssertTrue(opacity.waitForExistence(timeout: 10))
        opacity.adjust(toNormalizedSliderPosition: 0.6)
        closeColorPicker.tap()
        let customBackground = app.staticTexts["backgroundStatus"].label
        XCTAssertTrue(customBackground.hasPrefix("Background: Custom #E6E6FA,"))
        XCTAssertTrue(customBackground.contains("opacity"))
        attachScreenshot(of: app, named: "editor-style-custom-controls")
        scrollWorkspace(toTopIn: app)
        XCTAssertEqual(preview.label, "Collage preview, 2 photos")
        attachScreenshot(of: app, named: "editor-style-custom-preview")
        app.buttons["saveEdits"].tap()
        let styleSaved = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.buttons["saveEdits"])
        wait(for: [styleSaved], timeout: 10)
        XCTAssertTrue(workspaceIsVisible(in: app))
        app.buttons["closeProject"].tap()
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons[savedID].waitForExistence(timeout: 10))
        app.buttons[savedID].tap()
        XCTAssertTrue(workspaceIsVisible(in: app))
        XCTAssertTrue(app.buttons[alternateTwoPhotoLayoutID].isSelected)
        XCTAssertTrue(revealInWorkspace(app.buttons["photoSlot.a"], in: app))
        selectPhotoSlot("a", in: app)
        XCTAssertTrue(app.buttons["slotPicker"].label.contains("Photo 2"))
        XCTAssertTrue(app.staticTexts["photoRotation"].isHittable)
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 90°")
        XCTAssertEqual(app.steppers["photoZoom"].label, "Zoom: 105%")
        XCTAssertEqual(app.sliders["Horizontal position"].value as? String, horizontalValue)
        XCTAssertEqual(app.sliders["Vertical position"].value as? String, verticalValue)
        XCTAssertTrue(revealStyle(gap, in: app))
        positionInWorkspace(gap, in: app)
        XCTAssertEqual(gap.value as? String, savedGap)
        XCTAssertTrue(revealInWorkspace(radius, in: app))
        positionInWorkspace(radius, in: app)
        XCTAssertEqual(radius.value as? String, savedRadius)
        XCTAssertEqual(app.staticTexts["backgroundStatus"].label, customBackground)

        drag(gap, to: 0, expecting: "0 points")
        XCTAssertTrue(revealInWorkspace(radius, in: app))
        positionInWorkspace(radius, in: app)
        drag(radius, to: 1, expecting: "32 points")
        selectBackground("Black", in: app)
        XCTAssertEqual(app.staticTexts["backgroundStatus"].label, "Background: Black")
        // Cancel the draft in place. The workspace stays, and the saved style returns.
        app.buttons["Discard"].tap()
        XCTAssertTrue(discardAlert.waitForExistence(timeout: 5))
        XCTAssertTrue(discardAlert.staticTexts["Your edits to this collage haven't been saved."].exists)
        app.buttons["discardEdits"].firstMatch.tap()
        XCTAssertTrue(discardAlert.waitForNonExistence(timeout: 5))
        XCTAssertTrue(workspaceIsVisible(in: app))
        XCTAssertFalse(app.buttons["saveEdits"].exists)
        // Discard left the background controls on screen. Gap and radius are above them.
        XCTAssertTrue(revealStyle(gap, in: app))
        positionInWorkspace(gap, in: app)
        XCTAssertEqual(gap.value as? String, savedGap)
        XCTAssertTrue(revealInWorkspace(radius, in: app))
        positionInWorkspace(radius, in: app)
        XCTAssertEqual(radius.value as? String, savedRadius)
        XCTAssertEqual(app.staticTexts["backgroundStatus"].label, customBackground)
        selectBackground("Transparent", in: app)
        XCTAssertEqual(app.staticTexts["backgroundStatus"].label, "Background: Transparent")
        attachScreenshot(of: app, named: "editor-style-transparent-controls")
        try app.performAccessibilityAudit(for: .contrast)
        try auditWorkspace(in: app, for: .all.subtracting(.contrast))
        scrollWorkspace(toTopIn: app)
        XCTAssertEqual(preview.label, "Collage preview, 2 photos")
        attachScreenshot(of: app, named: "editor-style-transparent-preview")
        app.buttons["saveEdits"].tap()
        let transparentSaved = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.buttons["saveEdits"])
        wait(for: [transparentSaved], timeout: 10)
        app.buttons["closeProject"].tap()

        app.terminate()
        app.launchArguments = ["-UIPreferredContentSizeCategoryName", largeContentSizeCategory]
        app.launch()
        XCTAssertTrue(app.buttons[savedID].waitForExistence(timeout: 10))
        app.buttons[savedID].tap()
        XCTAssertTrue(workspaceIsVisible(in: app))
        attachScreenshot(of: app, named: "editor-large-text-preview")
        // A relaunch selects no slot, so reset is hidden until the strip tap.
        XCTAssertFalse(app.buttons["resetPhoto"].exists)
        XCTAssertTrue(revealInWorkspace(app.buttons["photoSlot.a"], in: app))
        selectPhotoSlot("a", in: app)
        XCTAssertTrue(revealInWorkspace(app.buttons["resetPhoto"], in: app))
        attachScreenshot(of: app, named: "editor-large-text-controls")
        // Audit the stable top viewport; control reachability is checked separately.
        scrollWorkspace(toTopIn: app)
        try auditWorkspace(in: app)
        XCTAssertTrue(revealInWorkspace(gap, in: app))
        positionInWorkspace(gap, in: app)
        XCTAssertEqual(gap.value as? String, savedGap)
        XCTAssertTrue(revealInWorkspace(radius, in: app))
        positionInWorkspace(radius, in: app)
        XCTAssertEqual(radius.value as? String, savedRadius)
        XCTAssertTrue(revealInWorkspace(app.staticTexts["backgroundStatus"], in: app))
        XCTAssertEqual(app.staticTexts["backgroundStatus"].label, "Background: Transparent")
        attachScreenshot(of: app, named: "editor-style-large-text-sliders")
        XCTAssertTrue(revealInWorkspace(app.buttons["backgroundPresetPicker"], in: app))
        attachScreenshot(of: app, named: "editor-style-large-text-backgrounds")
        // The picker is below the sliders. Returning to them scrolls content upward.
        XCTAssertTrue(revealStyle(gap, in: app))
        XCTAssertTrue(revealInWorkspace(radius, in: app))
        try app.performAccessibilityAudit(for: .contrast)
        try auditWorkspace(in: app, for: .all.subtracting(.contrast))

        // The unchanged draft leaves without a discard prompt; then check export at large text.
        XCTAssertFalse(app.buttons["saveEdits"].exists)
        app.buttons["closeProject"].tap()
        XCTAssertFalse(app.alerts["Discard changes?"].waitForExistence(timeout: 1))
        app.buttons[savedID].tap()
        XCTAssertTrue(workspaceIsVisible(in: app))
        XCTAssertTrue(app.buttons["exportCollage"].isEnabled)
        app.buttons["exportCollage"].tap()
        XCTAssertTrue(app.buttons["exportCreate"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.navigationBars["Export"].exists)
        attachScreenshot(of: app, named: "export-large-text")
        try app.performAccessibilityAudit(for: .contrast)
        try app.performAccessibilityAudit(for: .all.subtracting(.contrast))
        // The options scroll above the pinned Create Image button.
        XCTAssertTrue(reveal(app.textFields["exportWidth"], in: app))
        XCTAssertTrue(app.buttons["exportCreate"].isHittable)
        attachScreenshot(of: app, named: "export-large-text-custom-size")
    }

    /// Creates a real export and opens the system share sheet. Exact pixels and formats are
    /// decoded in CollageExporterTests; this proves the visible flow and the Save Image path.
    private func exportThroughShareSheet(in app: XCUIApplication, auditAccessibility: Bool = true) throws {
        XCTAssertTrue(app.buttons["exportCollage"].isEnabled)
        app.buttons["exportCollage"].tap()
        let create = app.buttons["exportCreate"]
        XCTAssertTrue(create.waitForExistence(timeout: 10))
        XCTAssertTrue(app.navigationBars["Export"].exists)
        XCTAssertFalse(app.sheets["Export"].exists)
        XCTAssertTrue(app.buttons["exportPreset.web"].isSelected)
        attachScreenshot(of: app, named: "export-default")
        if auditAccessibility { try app.performAccessibilityAudit() }

        app.buttons["exportPreset.social"].tap()
        XCTAssertTrue(app.buttons["exportPreset.social"].isSelected)
        let width = try XCTUnwrap(app.textFields["exportWidth"].value as? String)
        let height = try XCTUnwrap(app.textFields["exportHeight"].value as? String)
        XCTAssertTrue(width == "1080" || height == "1080", "\(width) × \(height)")
        app.segmentedControls["exportFormat"].buttons["JPEG"].tap()
        XCTAssertTrue(app.sliders["exportQuality"].waitForExistence(timeout: 5))
        create.tap()
        let status = app.staticTexts["exportStatus"]
        XCTAssertTrue(status.waitForExistence(timeout: 30), app.debugDescription)
        XCTAssertTrue(status.label.contains(".jpg, \(width) × \(height) px"), status.label)
        XCTAssertTrue(reveal(app.buttons["exportShare"], in: app))
        attachScreenshot(of: app, named: "export-ready")
        if auditAccessibility { try app.performAccessibilityAudit() }

        app.buttons["exportShare"].tap()
        let shareSheet = app.otherElements["ShareSheet.RemoteContainerView"]
        XCTAssertTrue(app.cells["Copy"].firstMatch.waitForExistence(timeout: 15), app.debugDescription)
        attachScreenshot(of: app, named: "export-share-sheet")
        // iOS lists Save Image (an action cell) unless add-only Photos access was denied
        // earlier. When offered, it must reach the system prompt without crashing the app.
        let saveImage = app.cells["Save Image"].firstMatch
        if saveImage.exists {
            saveImage.tap()
            // Deny, so the seeded library used by the picker steps is never changed.
            let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
            let deny = springboard.alerts.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Don")).firstMatch
            if deny.waitForExistence(timeout: 5) {
                attachScreenshot(of: app, named: "export-photos-add-prompt")
                deny.tap()
            }
            XCTAssertEqual(app.state, .runningForeground)
        }
        if shareSheet.waitForExistence(timeout: 2) {
            shareSheet.swipeDown()
        }
        XCTAssertTrue(app.buttons["exportShare"].waitForExistence(timeout: 10), app.debugDescription)

        // A changed option invalidates the prepared file.
        app.buttons["exportPreset.web"].tap()
        XCTAssertFalse(app.staticTexts["exportStatus"].exists)
        XCTAssertFalse(app.buttons["exportShare"].exists)
        XCTAssertTrue(app.buttons["exportCreate"].exists)
        app.buttons["closeExport"].tap()
        XCTAssertTrue(app.navigationBars["Export"].waitForNonExistence(timeout: 5))
        XCTAssertTrue(workspaceIsVisible(in: app))
        XCTAssertEqual(collagePreview(in: app).label, "Collage preview, 2 photos")
    }


    /// A photo-strip tap selects the slot and scrolls the inline Photo section to the top
    /// of `workspaceControls`. Layout and Style stay open; no sheet appears.
    private func selectPhotoSlot(_ area: String, in app: XCUIApplication) {
        let slot = app.buttons["photoSlot.\(area)"]
        XCTAssertTrue(slot.exists, area)
        let pane = projectPreview(in: app).frame
        slot.tap()
        let heading = app.staticTexts["photoControls"]
        let controls = workspaceControls(in: app)
        let placed = expectation(for: NSPredicate { _, _ in
            heading.exists && heading.isHittable && heading.frame.minY <= controls.frame.minY + 48
        }, evaluatedWith: heading)
        wait(for: [placed], timeout: 5)
        XCTAssertEqual(heading.label, "Photo")
        XCTAssertTrue(app.buttons["slotPicker"].isHittable)
        // Rotation sits below the position sliders and zoom, so it is not in the same
        // viewport as the heading. Callers that tap it reveal it afterward.
        XCTAssertTrue(app.buttons["rotateClockwise"].exists)
        XCTAssertFalse(app.sheets.firstMatch.exists)
        XCTAssertFalse(app.navigationBars["Edit collage"].exists)
        XCTAssertTrue(app.staticTexts["Layout"].exists)
        XCTAssertTrue(app.staticTexts["Style"].exists)
        XCTAssertEqual(projectPreview(in: app).frame, pane)
        XCTAssertLessThanOrEqual(projectPreview(in: app).frame.maxY, controls.frame.minY + 1)
    }

    /// Drags a stepped slider to the end of its track. One coordinate drag to an end can stop
    /// a step or more short on iOS 26, so repeat the same drag a bounded number of times.
    private func drag(_ slider: XCUIElement, to position: CGFloat, expecting value: String, attempts: Int = 4) {
        for _ in 0..<attempts where slider.value as? String != value {
            slider.adjust(toNormalizedSliderPosition: position)
        }
        XCTAssertEqual(slider.value as? String, value)
    }


    /// Style is above Photo. A default upward search from the photo controls walks away from it.
    private func revealStyle(_ element: XCUIElement, in app: XCUIApplication) -> Bool {
        revealInWorkspace(element, in: app, direction: .down)
    }

    private func selectBackground(_ name: String, in app: XCUIApplication) {
        let picker = app.buttons["backgroundPresetPicker"]
        XCTAssertTrue(revealInWorkspace(picker, in: app))
        picker.tap()
        // The preset list is a menu, below the Style sliders once those are on screen.
        menuOption(name, in: app).tap()
    }

    /// A native menu option lives in a collection-view cell. Slot labels also name the
    /// photo-strip buttons, so an app-wide button query is ambiguous. Preset cells carry
    /// their own identifiers, so an empty identifier is not a discriminator.
    private func menuOption(_ label: String, in app: XCUIApplication) -> XCUIElement {
        let option = app.collectionViews.cells.buttons[label]
        XCTAssertTrue(option.waitForExistence(timeout: 5), label)
        return option
    }

    /// Functional persistence/export coverage must not depend on reaching the end of
    /// the separate journey that retains the owner-accepted Photo contrast failure.
    /// No accessibility audit in that journey is skipped or changed by this test.
    func testSavedEditsReopenDiscardAndExport() throws {
        let app = launchedApp()
        XCTAssertTrue(reveal(app.buttons["New Collage"], in: app))
        app.buttons["New Collage"].tap()
        XCTAssertTrue(workspaceIsVisible(in: app))
        importTwoPhotos(in: app)

        let stacked = app.buttons[alternateTwoPhotoLayoutID]
        XCTAssertTrue(revealInWorkspace(stacked, in: app))
        stacked.tap()
        XCTAssertTrue(stacked.isSelected)
        XCTAssertTrue(revealInWorkspace(app.buttons["photoSlot.a"], in: app))
        selectPhotoSlot("a", in: app)
        XCTAssertTrue(revealInWorkspace(app.buttons["rotateClockwise"], in: app))
        app.buttons["rotateClockwise"].tap()
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 90°")
        let zoom = app.steppers["photoZoom"]
        XCTAssertTrue(revealInWorkspace(zoom, in: app, direction: .down))
        zoom.buttons["photoZoom-Increment"].tap()
        XCTAssertEqual(zoom.label, "Zoom: 105%")

        let gap = app.sliders["styleGap"]
        let radius = app.sliders["styleRadius"]
        XCTAssertTrue(revealStyle(gap, in: app))
        positionInWorkspace(gap, in: app)
        gap.adjust(toNormalizedSliderPosition: 0.35)
        let savedGap = try XCTUnwrap(gap.value as? String)
        XCTAssertNotEqual(savedGap, "8 points")
        XCTAssertTrue(revealInWorkspace(radius, in: app))
        positionInWorkspace(radius, in: app)
        radius.adjust(toNormalizedSliderPosition: 0.6)
        let savedRadius = try XCTUnwrap(radius.value as? String)
        XCTAssertNotEqual(savedRadius, "0 points")
        selectBackground("Lavender", in: app)
        XCTAssertEqual(app.staticTexts["backgroundStatus"].label, "Background: Lavender")
        XCTAssertFalse(app.buttons["exportCollage"].isEnabled)
        app.buttons["saveEdits"].tap()
        XCTAssertTrue(app.buttons["saveEdits"].waitForNonExistence(timeout: 10))
        XCTAssertTrue(workspaceIsVisible(in: app))
        XCTAssertTrue(app.buttons["exportCollage"].isEnabled)
        attachScreenshot(of: app, named: "saved-functional-workspace")
        app.buttons["closeProject"].tap()
        let saved = app.buttons.matching(NSPredicate(
            format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "savedProject-", "2 of 16 photos"
        )).firstMatch
        XCTAssertTrue(saved.waitForExistence(timeout: 10))
        let savedID = saved.identifier
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons[savedID].waitForExistence(timeout: 10))
        app.buttons[savedID].tap()
        XCTAssertTrue(workspaceIsVisible(in: app))
        XCTAssertTrue(app.buttons[alternateTwoPhotoLayoutID].isSelected)
        XCTAssertTrue(revealInWorkspace(app.buttons["photoSlot.a"], in: app))
        selectPhotoSlot("a", in: app)
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 90°")
        XCTAssertEqual(zoom.label, "Zoom: 105%")

        XCTAssertTrue(revealInWorkspace(app.buttons["resetPhoto"], in: app))
        app.buttons["resetPhoto"].tap()
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 0°")
        app.buttons["Discard"].tap()
        let discard = app.alerts["Discard changes?"]
        XCTAssertTrue(discard.waitForExistence(timeout: 5))
        discard.buttons["discardEdits"].firstMatch.tap()
        XCTAssertTrue(discard.waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.buttons["saveEdits"].waitForNonExistence(timeout: 5))
        XCTAssertTrue(workspaceIsVisible(in: app))
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 90°")
        XCTAssertEqual(zoom.label, "Zoom: 105%")
        XCTAssertTrue(revealStyle(gap, in: app))
        XCTAssertEqual(gap.value as? String, savedGap)
        XCTAssertTrue(revealInWorkspace(radius, in: app))
        XCTAssertEqual(radius.value as? String, savedRadius)
        XCTAssertEqual(app.staticTexts["backgroundStatus"].label, "Background: Lavender")
        scrollWorkspace(toTopIn: app)
        attachScreenshot(of: app, named: "reopened-functional-workspace")
        // Functional coverage is independent; the original audited journey still uses
        // this helper's default full audits, including the unwaived export warning.
        try exportThroughShareSheet(in: app, auditAccessibility: false)
    }

    /// Separate functional stress coverage; retained accessibility journeys are unchanged.
    func testSixteenPhotoPickerLimitReopenAndExport() throws {
        let app = launchedApp()
        XCTAssertTrue(reveal(app.buttons["New Collage"], in: app))
        app.buttons["New Collage"].tap()
        XCTAssertTrue(workspaceIsVisible(in: app))
        app.buttons["addPhotos"].tap()
        let photos = app.images.matching(NSPredicate(format: "label BEGINSWITH %@", "Photo,"))
        XCTAssertTrue(photos.firstMatch.waitForExistence(timeout: 30), "Seed sixteen synthetic photos first.\n\(app.debugDescription)")
        // Photos exposes a scrolling window, not stable library-wide indices.
        for index in 0..<16 {
            var candidate: XCUIElement?
            for _ in 0..<8 {
                candidate = photos.allElementsBoundByIndex.first { photo in
                    guard !photo.isSelected else { return false }
                    let frame = photo.frame
                    return frame.midY > 230 && frame.midY < app.frame.maxY - 100
                }
                if candidate != nil { break }
                app.swipeUp()
            }
            let photo = try XCTUnwrap(candidate, "Picker selection \(index): \(app.debugDescription)")
            photo.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            XCTAssertTrue(photo.isSelected, "Picker selection \(index) did not select a photo")
        }
        attachScreenshot(of: app, named: "sixteen-picker-selected")
        let confirm = app.buttons.matching(NSPredicate(format: "label == %@ OR label == %@", "Add", "Done")).firstMatch
        XCTAssertTrue(confirm.isEnabled)
        confirm.tap()
        let imported = expectation(for: NSPredicate(format: "label == %@", "16 of 16 photos"), evaluatedWith: app.staticTexts["projectPhotoCount"])
        wait(for: [imported], timeout: 60)
        XCTAssertFalse(app.buttons["addPhotos"].isEnabled)
        let preview = collagePreview(in: app)
        let ready = expectation(for: NSPredicate(format: "label == %@", "Collage preview, 16 photos"), evaluatedWith: preview)
        wait(for: [ready], timeout: 15)
        // Seeded fixtures are colored blocks. Check rendered pixels, not just the ready label:
        // a Canvas image-resolution failure can otherwise leave white cells and still pass.
        let image = try XCTUnwrap(preview.screenshot().image.cgImage)
        var pixels = [UInt8](repeating: 0, count: image.width * image.height * 4)
        let context = try XCTUnwrap(CGContext(
            data: &pixels, width: image.width, height: image.height,
            bitsPerComponent: 8, bytesPerRow: image.width * 4,
            space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ))
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        for row in 0..<4 {
            for column in 0..<4 {
                let x = Int((Double(column) + 0.5) * Double(image.width) / 4)
                let y = Int((Double(row) + 0.5) * Double(image.height) / 4)
                let offset = (y * image.width + x) * 4
                let rgb = pixels[offset..<(offset + 3)].map(Int.init)
                XCTAssertGreaterThan(rgb.max()! - rgb.min()!, 30, "Blank preview slot \(row),\(column): \(rgb)")
            }
        }
        let grid = app.buttons["layout.16-grid-4x4"]
        XCTAssertTrue(revealInWorkspace(grid, in: app))
        XCTAssertTrue(grid.isSelected)
        attachScreenshot(of: app, named: "sixteen-workspace")
        app.buttons["closeProject"].tap()
        let saved = app.buttons.matching(NSPredicate(
            format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "savedProject-", "16 of 16 photos"
        )).firstMatch
        XCTAssertTrue(saved.waitForExistence(timeout: 10))
        let savedID = saved.identifier
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons[savedID].waitForExistence(timeout: 10))
        app.buttons[savedID].tap()
        XCTAssertTrue(workspaceIsVisible(in: app))
        XCTAssertEqual(app.staticTexts["projectPhotoCount"].label, "16 of 16 photos")
        XCTAssertFalse(app.buttons["addPhotos"].isEnabled)
        app.buttons["exportCollage"].tap()
        XCTAssertTrue(app.buttons["exportCreate"].waitForExistence(timeout: 10))
        for format in ["PNG", "JPEG"] {
            app.segmentedControls["exportFormat"].buttons[format].tap()
            app.buttons["exportCreate"].tap()
            let status = app.staticTexts["exportStatus"]
            XCTAssertTrue(status.waitForExistence(timeout: 60), app.debugDescription)
            XCTAssertTrue(status.label.contains("1920 × 1920 px"), status.label)
            XCTAssertTrue(status.label.contains(format == "PNG" ? ".png," : ".jpg,"), status.label)
            XCTAssertTrue(reveal(app.buttons["exportShare"], in: app))
            attachScreenshot(of: app, named: "sixteen-\(format.lowercased())-ready")
            app.buttons["exportShare"].tap()
            XCTAssertTrue(app.cells["Copy"].firstMatch.waitForExistence(timeout: 15), app.debugDescription)
            app.otherElements["ShareSheet.RemoteContainerView"].swipeDown()
            XCTAssertTrue(app.buttons["exportShare"].waitForExistence(timeout: 10))
        }
        app.buttons["closeExport"].tap()
        XCTAssertTrue(workspaceIsVisible(in: app))
    }

    func testProjectManagement() throws {
        continueAfterFailure = true
        let app = launchedApp()
        let name = "Lake trip \(UUID().uuidString.prefix(6))"
        XCTAssertTrue(reveal(app.buttons["New Collage"], in: app))
        app.buttons["New Collage"].tap()
        XCTAssertTrue(workspaceIsVisible(in: app))
        XCTAssertFalse(app.sheets.firstMatch.exists)
        app.buttons["addPhotos"].tap()
        let photos = app.images.matching(NSPredicate(format: "label BEGINSWITH %@", "Photo,"))
        XCTAssertTrue(photos.firstMatch.waitForExistence(timeout: 30))
        XCTAssertGreaterThanOrEqual(photos.count, 2)
        for index in 0..<2 {
            photos.element(boundBy: index).coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        app.buttons.matching(NSPredicate(format: "label == %@ OR label == %@", "Add", "Done")).firstMatch.tap()
        let imported = expectation(for: NSPredicate(format: "label == %@", "2 of 16 photos"), evaluatedWith: app.staticTexts["projectPhotoCount"])
        wait(for: [imported], timeout: 30)
        let preview = collagePreview(in: app)
        let importedReady = expectation(for: NSPredicate(format: "label == %@", "Collage preview, 2 photos"), evaluatedWith: preview)
        wait(for: [importedReady], timeout: 15)
        XCTAssertTrue(revealInWorkspace(app.buttons["photoSlot.a"], in: app))
        selectPhotoSlot("a", in: app)
        XCTAssertTrue(revealInWorkspace(app.buttons["rotateClockwise"], in: app))
        app.buttons["rotateClockwise"].tap()
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 90°")
        app.buttons["saveEdits"].tap()
        let savedEdits = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.buttons["saveEdits"])
        wait(for: [savedEdits], timeout: 10)
        XCTAssertTrue(workspaceIsVisible(in: app))
        app.buttons["closeProject"].tap()
        let newest = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "savedProject-")).firstMatch
        XCTAssertTrue(newest.waitForExistence(timeout: 10))
        let originalID = newest.identifier
        let actionsID = originalID.replacingOccurrences(of: "savedProject-", with: "projectActions-")
        openProjectAction("Rename", identifier: actionsID, in: app)
        let field = app.descendants(matching: .any).matching(identifier: "projectName").firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        try app.performAccessibilityAudit()
        field.tap()
        let existing = try XCTUnwrap(field.value as? String)
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: existing.count))
        XCTAssertFalse(app.buttons["saveProjectName"].isEnabled)
        field.typeText(name)
        attachScreenshot(of: app, named: "project-rename")
        app.buttons["saveProjectName"].tap()
        XCTAssertTrue(app.buttons[actionsID].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons[originalID].label.contains(name))

        openProjectAction("Duplicate", identifier: actionsID, in: app)
        let status = app.staticTexts["libraryStatus"]
        let duplicated = expectation(for: NSPredicate(format: "label == %@", "Duplicated as \(name) copy."), evaluatedWith: status)
        wait(for: [duplicated], timeout: 10)
        let copy = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label BEGINSWITH %@", "savedProject-", "\(name) copy")).firstMatch
        XCTAssertTrue(copy.waitForExistence(timeout: 10))
        let copyID = copy.identifier
        XCTAssertNotEqual(copyID, originalID)
        let copyActions = copyID.replacingOccurrences(of: "savedProject-", with: "projectActions-")
        openProjectAction("Delete", identifier: copyActions, in: app)
        XCTAssertTrue(app.buttons["keepProject"].waitForExistence(timeout: 5))
        attachScreenshot(of: app, named: "project-delete-confirmation")
        try app.performAccessibilityAudit()
        app.buttons["keepProject"].tap()
        XCTAssertTrue(app.buttons[copyID].waitForExistence(timeout: 5))
        openProjectAction("Delete", identifier: copyActions, in: app)
        app.buttons["confirmDeleteProject"].tap()
        XCTAssertTrue(app.buttons[copyID].waitForNonExistence(timeout: 10))
        XCTAssertTrue(app.buttons[originalID].exists)

        openProjectAction("Back Up", identifier: actionsID, in: app)
        XCTAssertTrue(app.buttons["createBackup"].waitForExistence(timeout: 5))
        attachScreenshot(of: app, named: "project-backup-options")
        try app.performAccessibilityAudit()
        app.buttons["createBackup"].tap()
        XCTAssertTrue(app.buttons["saveBackup"].waitForExistence(timeout: 15))
        attachScreenshot(of: app, named: "project-backup-ready")
        try app.performAccessibilityAudit()
        app.buttons["saveBackup"].tap()
        XCTAssertTrue(app.buttons["Save"].waitForExistence(timeout: 60), app.debugDescription)
        attachScreenshot(of: app, named: "project-save-backup-picker")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.buttons["Save"].waitForNonExistence(timeout: 10))
        app.buttons["shareBackup"].tap()
        XCTAssertTrue(app.cells["Copy"].firstMatch.waitForExistence(timeout: 30), app.debugDescription)
        attachScreenshot(of: app, named: "project-share-backup")
        app.otherElements["ShareSheet.RemoteContainerView"].swipeDown()
        XCTAssertTrue(app.buttons["closeProjectAction"].waitForExistence(timeout: 10))
        app.buttons["closeProjectAction"].tap()
        for _ in 0..<6 where !app.buttons["restoreBackup"].isHittable { app.swipeDown() }
        app.buttons["restoreBackup"].tap()
        let backup = app.cells.matching(NSPredicate(format: "label CONTAINS %@", "\(name) backup")).firstMatch
        XCTAssertTrue(backup.waitForExistence(timeout: 10), app.debugDescription)
        attachScreenshot(of: app, named: "project-restore-picker")
        backup.tap()
        let restored = expectation(for: NSPredicate(format: "label == %@", "Restored \(name) as a new collage."), evaluatedWith: status)
        wait(for: [restored], timeout: 20)
        XCTAssertTrue(app.buttons[originalID].exists)
        let restoredRow = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label BEGINSWITH %@", "savedProject-", name)).firstMatch
        let restoredID = restoredRow.identifier
        XCTAssertNotEqual(restoredID, originalID)
        restoredRow.tap()
        XCTAssertTrue(workspaceIsVisible(in: app))
        XCTAssertEqual(app.staticTexts["projectPhotoCount"].label, "2 of 16 photos")
        let ready = expectation(for: NSPredicate(format: "label == %@", "Collage preview, 2 photos"), evaluatedWith: preview)
        wait(for: [ready], timeout: 15)
        attachScreenshot(of: app, named: "project-restored-preview")
        // Restoring does not select a slot. The first strip tap reveals the saved rotation.
        XCTAssertFalse(app.staticTexts["photoRotation"].exists)
        XCTAssertTrue(revealInWorkspace(app.buttons["photoSlot.a"], in: app))
        let restoredPane = projectPreview(in: app).frame
        selectPhotoSlot("a", in: app)
        XCTAssertEqual(projectPreview(in: app).frame, restoredPane)
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 90°")
        app.buttons["closeProject"].tap()
        app.terminate()
        app.launchArguments = ["-UIPreferredContentSizeCategoryName", largeContentSizeCategory]
        app.launch()
        let restoredActions = restoredID.replacingOccurrences(of: "savedProject-", with: "projectActions-")
        openProjectAction("Rename", identifier: restoredActions, in: app)
        XCTAssertTrue(app.buttons["saveProjectName"].waitForExistence(timeout: 5))
        attachScreenshot(of: app, named: "project-rename-large-text")
        try app.performAccessibilityAudit()
        app.buttons["closeProjectAction"].tap()
        openProjectAction("Back Up", identifier: restoredActions, in: app)
        XCTAssertTrue(reveal(app.buttons["createBackup"], in: app))
        attachScreenshot(of: app, named: "project-backup-large-text")
        app.buttons["createBackup"].tap()
        XCTAssertTrue(reveal(app.buttons["shareBackup"], in: app))
        attachScreenshot(of: app, named: "project-backup-ready-large-text")
        app.buttons["closeProjectAction"].tap()
        openProjectAction("Delete", identifier: restoredActions, in: app)
        XCTAssertTrue(reveal(app.buttons["keepProject"], in: app))
        XCTAssertLessThanOrEqual(app.buttons["keepProject"].frame.maxY, app.frame.maxY - 24)
        attachScreenshot(of: app, named: "project-delete-large-text")
        try app.performAccessibilityAudit(for: .contrast)
        try app.performAccessibilityAudit(for: .all.subtracting(.contrast))
        app.buttons["confirmDeleteProject"].tap()
        XCTAssertTrue(app.buttons[restoredID].waitForNonExistence(timeout: 10))
        XCTAssertTrue(app.buttons[originalID].exists)
    }

    private func openProjectAction(_ name: String, identifier: String, in app: XCUIApplication) {
        XCTAssertTrue(reveal(app.buttons[identifier], in: app))
        app.buttons[identifier].tap()
        XCTAssertTrue(app.buttons[name].waitForExistence(timeout: 5), app.debugDescription)
        app.buttons[name].tap()
    }

    func testLibraryShellOpensAndDismissesAboutPreview() throws {
        let app = launchedApp()

        XCTAssertTrue(libraryNavigationTitle(in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(libraryHeading(in: app).exists)

        let about = aboutButton(in: app)
        XCTAssertTrue(about.waitForExistence(timeout: 5))
        XCTAssertEqual(about.label, "About this preview")
        XCTAssertTrue(about.isHittable)
        attachScreenshot(of: app, named: "library-default-light")
        try app.performAccessibilityAudit()

        openAbout(in: app)
        let sheetTitle = aboutSheetTitle(in: app)
        XCTAssertTrue(sheetTitle.waitForExistence(timeout: 5))
        XCTAssertTrue(reveal(workingNameHeading(in: app), in: app))
        XCTAssertTrue(
            reveal(
                app.staticTexts["Collager is a working name. The final name is still open."],
                in: app
            )
        )

        let done = dismissButton(in: app)
        XCTAssertTrue(reveal(done, in: app))
        attachScreenshot(of: app, named: "about-preview-sheet")
        try app.performAccessibilityAudit()

        done.tap()
        XCTAssertTrue(libraryNavigationTitle(in: app).waitForExistence(timeout: 5))
        XCTAssertFalse(sheetTitle.exists)
        XCTAssertFalse(workingNameHeading(in: app).exists)
        XCTAssertTrue(libraryHeading(in: app).exists)
    }

    func testAccessibilityDynamicTypeKeepsControlsReachable() throws {
        let app = launchedApp(preferredContentSizeCategory: largeContentSizeCategory)

        let title = libraryHeading(in: app)
        XCTAssertTrue(reveal(title, in: app))
        let about = aboutButton(in: app)
        XCTAssertTrue(reveal(about, in: app))
        attachScreenshot(of: app, named: "library-accessibility-dynamic-type")

        about.tap()
        XCTAssertTrue(aboutSheetTitle(in: app).waitForExistence(timeout: 5), app.debugDescription)
        XCTAssertTrue(reveal(workingNameHeading(in: app), in: app))
        let explanation = app.staticTexts["Collager is a working name. The final name is still open."]
        XCTAssertTrue(reveal(explanation, in: app))
        app.swipeUp()
        app.swipeUp()
        app.swipeUp()
        XCTAssertTrue(explanation.isHittable)

        let done = dismissButton(in: app)
        XCTAssertTrue(reveal(done, in: app))
        attachScreenshot(of: app, named: "about-preview-accessibility-dynamic-type")

        done.tap()
        XCTAssertTrue(reveal(libraryNavigationTitle(in: app), in: app))
        XCTAssertFalse(aboutSheetTitle(in: app).exists)
        XCTAssertTrue(reveal(libraryHeading(in: app), in: app))

        let create = app.buttons["New Collage"]
        XCTAssertTrue(reveal(create, in: app))
        create.tap()
        XCTAssertTrue(workspaceIsVisible(in: app))
        XCTAssertTrue(revealInWorkspace(app.buttons["addPhotos"], in: app))
        let savedExplanation = app.staticTexts["Your collage is saved on this device automatically."]
        if savedExplanation.exists {
            XCTAssertTrue(revealInWorkspace(savedExplanation, in: app))
            XCTAssertLessThanOrEqual(savedExplanation.frame.maxY, app.frame.maxY - 24)
        }
        for label in ["Photos", "Layout", "Style"] {
            XCTAssertTrue(revealInWorkspace(app.staticTexts[label], in: app), label)
        }
        // Style is below Photos. Swiping up again would leave the button behind.
        scrollWorkspace(toTopIn: app)
        let addPhotos = app.buttons["addPhotos"]
        XCTAssertEqual(addPhotos.label, "Add Photos")
        XCTAssertTrue(addPhotos.isHittable)
        addPhotos.tap()
        XCTAssertTrue(app.buttons["Cancel"].waitForExistence(timeout: 10), app.debugDescription)
        attachScreenshot(of: app, named: "project-accessibility-dynamic-type-picker")
        app.buttons["Cancel"].tap()
        XCTAssertTrue(addPhotos.waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["projectPhotoCount"].label, "0 of 16 photos")
        attachScreenshot(of: app, named: "project-accessibility-dynamic-type")
        try app.performAccessibilityAudit()
        app.buttons["closeProject"].tap()
    }

    func testPinnedWorkspaceStaysVisibleWhileControlsScroll() throws {
        let app = launchedApp()
        XCTAssertTrue(reveal(app.buttons["New Collage"], in: app))
        app.buttons["New Collage"].tap()
        XCTAssertTrue(workspaceIsVisible(in: app))
        importTwoPhotos(in: app)
        let preview = collagePreview(in: app)
        let ready = expectation(for: NSPredicate(format: "label == %@", "Collage preview, 2 photos"), evaluatedWith: preview)
        wait(for: [ready], timeout: 15)
        let pane = projectPreview(in: app)
        let cleanPane = pane.frame
        let cleanPreview = preview.frame
        let cleanControls = workspaceControls(in: app).frame
        XCTAssertGreaterThan(cleanPane.height, 40)
        XCTAssertGreaterThan(cleanPane.width, 40)
        XCTAssertTrue(cleanPane.contains(cleanPreview))
        XCTAssertLessThanOrEqual(cleanPane.maxY, cleanControls.minY + 1)
        XCTAssertGreaterThan(cleanControls.height, 80)
        XCTAssertFalse(app.buttons["saveEdits"].exists)
        attachScreenshot(of: app, named: "workspace-clean-before-slot")

        XCTAssertTrue(revealInWorkspace(app.buttons["photoSlot.a"], in: app))
        let paneBeforeSlot = projectPreview(in: app).frame
        selectPhotoSlot("a", in: app)
        XCTAssertEqual(projectPreview(in: app).frame, paneBeforeSlot)
        XCTAssertTrue(revealInWorkspace(app.buttons["rotateClockwise"], in: app))
        app.buttons["rotateClockwise"].tap()
        XCTAssertTrue(app.buttons["saveEdits"].waitForExistence(timeout: 5))
        // First edit inserts the save bar, so the controls viewport shrinks. Pinning is
        // measured from this dirty layout, not from the clean controls frame above.
        let paneFrame = projectPreview(in: app).frame
        let previewFrame = collagePreview(in: app).frame
        let controlsFrame = workspaceControls(in: app).frame
        XCTAssertEqual(paneFrame, cleanPane, "The preview pane stays fixed when the draft becomes dirty.")
        XCTAssertEqual(previewFrame, cleanPreview)
        XCTAssertLessThan(controlsFrame.height, cleanControls.height)
        let saveFrame = app.buttons["saveEdits"].frame
        let discardFrame = app.buttons["Discard"].frame
        XCTAssertLessThan(saveFrame.maxY, app.frame.maxY - 8)
        XCTAssertLessThan(discardFrame.maxY, app.frame.maxY - 8)
        XCTAssertGreaterThanOrEqual(saveFrame.minY, controlsFrame.maxY - 1)
        XCTAssertGreaterThanOrEqual(discardFrame.minY, controlsFrame.maxY - 1)

        // The strip tap already scrolled photo controls to the top. Scroll back through Style
        // and Layout, then return to the photo controls, and require the pinned frames to hold.
        XCTAssertTrue(revealInWorkspace(app.sliders["styleGap"], in: app, maxSwipes: 8, direction: .down))
        assertPinned(paneFrame: paneFrame, previewFrame: previewFrame, saveFrame: saveFrame, discardFrame: discardFrame, controlsFrame: controlsFrame, in: app)
        attachScreenshot(of: app, named: "workspace-dirty-style")
        XCTAssertTrue(revealInWorkspace(app.staticTexts["Layout"], in: app, maxSwipes: 8, direction: .down))
        assertPinned(paneFrame: paneFrame, previewFrame: previewFrame, saveFrame: saveFrame, discardFrame: discardFrame, controlsFrame: controlsFrame, in: app)
        attachScreenshot(of: app, named: "workspace-dirty-layout")
        XCTAssertTrue(revealInWorkspace(app.staticTexts["photoControls"], in: app))
        XCTAssertTrue(revealInWorkspace(app.sliders["Horizontal position"], in: app))
        assertPinned(paneFrame: paneFrame, previewFrame: previewFrame, saveFrame: saveFrame, discardFrame: discardFrame, controlsFrame: controlsFrame, in: app)
        XCTAssertFalse(app.sheets.firstMatch.exists)
        XCTAssertTrue(app.staticTexts["Layout"].exists)
        XCTAssertTrue(app.staticTexts["Style"].exists)
        attachScreenshot(of: app, named: "workspace-pinned-while-scrolling")

        // Save so the same collage can prove reachability after a large-text relaunch.
        app.buttons["saveEdits"].tap()
        let savedEdits = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.buttons["saveEdits"])
        wait(for: [savedEdits], timeout: 10)
        app.buttons["closeProject"].tap()
        let saved = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "savedProject-", "2 of 16 photos")).firstMatch
        XCTAssertTrue(saved.waitForExistence(timeout: 10))
        let savedID = saved.identifier
        app.terminate()
        app.launchArguments = ["-UIPreferredContentSizeCategoryName", largeContentSizeCategory]
        app.launch()
        XCTAssertTrue(app.buttons[savedID].waitForExistence(timeout: 10))
        app.buttons[savedID].tap()
        XCTAssertTrue(workspaceIsVisible(in: app))
        let largeCount = expectation(for: NSPredicate(format: "label == %@", "2 of 16 photos"), evaluatedWith: app.staticTexts["projectPhotoCount"])
        wait(for: [largeCount], timeout: 10)
        let largePreview = collagePreview(in: app)
        let largeReady = expectation(for: NSPredicate(format: "label == %@", "Collage preview, 2 photos"), evaluatedWith: largePreview)
        wait(for: [largeReady], timeout: 15)
        let largeRatio = try previewRatio(in: app)
        XCTAssertGreaterThan(largeRatio, 1.4, "The reopened default layout keeps its 16:9 composition at the largest text size.")
        // Visit sections in visual order rather than relying on an offscreen lazy row
        // when returning from Background.
        scrollWorkspace(toTopIn: app)
        let sideBySide = app.buttons["layout.2-horizontal"]
        XCTAssertTrue(revealInWorkspace(sideBySide, in: app), "layout.2-horizontal")
        XCTAssertTrue(isInsideWorkspace(sideBySide, workspaceControls(in: app)))
        for identifier in ["styleGap", "styleRadius", "backgroundPresetPicker"] {
            let element = app.descendants(matching: .any)[identifier]
            XCTAssertTrue(revealInWorkspace(element, in: app), identifier)
            XCTAssertTrue(isInsideWorkspace(element, workspaceControls(in: app)), identifier)
        }
        scrollWorkspace(toTopIn: app)
        let addPhotos = app.buttons["addPhotos"]
        XCTAssertTrue(addPhotos.isHittable)
        XCTAssertTrue(app.buttons["exportCollage"].isHittable)
        XCTAssertTrue(app.buttons["closeProject"].isHittable)
        XCTAssertTrue(revealInWorkspace(app.buttons["photoSlot.a"], in: app))
        selectPhotoSlot("a", in: app)
        let rotate = app.buttons["rotateClockwise"]
        XCTAssertTrue(revealInWorkspace(rotate, in: app))
        XCTAssertTrue(isInsideWorkspace(rotate, workspaceControls(in: app)))
        attachScreenshot(of: app, named: "workspace-large-text-rotation")
        XCTAssertTrue(revealInWorkspace(app.buttons["slotPicker"], in: app, direction: .down))
        XCTAssertTrue(isInsideWorkspace(app.buttons["slotPicker"], workspaceControls(in: app)))
        XCTAssertTrue(revealInWorkspace(app.buttons["resetPhoto"], in: app))
        XCTAssertTrue(isInsideWorkspace(app.buttons["resetPhoto"], workspaceControls(in: app)))
        XCTAssertTrue(projectPreview(in: app).exists)
        XCTAssertEqual(largePreview.label, "Collage preview, 2 photos")
        attachScreenshot(of: app, named: "workspace-large-text-reachable")
        let largePane = projectPreview(in: app)
        XCTAssertGreaterThan(largePane.frame.width, 40)
        XCTAssertGreaterThan(largePane.frame.height, 40)
        XCTAssertTrue(largePane.frame.contains(largePreview.frame))
        XCTAssertLessThanOrEqual(largePane.frame.maxY, workspaceControls(in: app).frame.minY + 1)
        XCTAssertLessThanOrEqual(largePane.frame.maxY, app.frame.maxY - 24)
    }

    private func launchedApp(preferredContentSizeCategory: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = [
            "-UIPreferredContentSizeCategoryName",
            preferredContentSizeCategory ?? normalContentSizeCategory,
        ]
        app.launch()
        return app
    }

    private func openAbout(in app: XCUIApplication) {
        let about = aboutButton(in: app)
        XCTAssertTrue(reveal(about, in: app))
        about.tap()
    }

    private func aboutButton(in app: XCUIApplication) -> XCUIElement {
        app.buttons["aboutPreview"]
    }

    private func dismissButton(in app: XCUIApplication) -> XCUIElement {
        app.buttons["dismissAboutPreview"]
    }

    private func libraryNavigationTitle(in app: XCUIApplication) -> XCUIElement {
        app.navigationBars["Collager"]
    }

    private func libraryHeading(in app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Your collages")).firstMatch
    }

    private func aboutSheetTitle(in app: XCUIApplication) -> XCUIElement {
        app.navigationBars["About this preview"]
    }

    private func workingNameHeading(in app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label ==[c] %@", "Working name")).firstMatch
    }

    private func projectPreview(in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: "projectPreview").firstMatch
    }

    /// The accessible collage composition. The `projectPreview` pane also contains the count,
    /// so its own label is not the readiness text.
    private func collagePreview(in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(
            format: "label BEGINSWITH %@ OR label == %@",
            "Collage preview",
            "Loading collage preview"
        )).firstMatch
    }

    private func workspaceControls(in app: XCUIApplication) -> XCUIElement {
        let identified = app.descendants(matching: .any).matching(identifier: "workspaceControls").firstMatch
        if identified.exists { return identified }
        return app.scrollViews.firstMatch
    }

    @discardableResult
    private func workspaceIsVisible(in app: XCUIApplication) -> Bool {
        let projects = app.buttons["closeProject"]
        let controls = workspaceControls(in: app)
        let preview = projectPreview(in: app)
        let appeared = projects.waitForExistence(timeout: 10) && controls.waitForExistence(timeout: 10) && preview.waitForExistence(timeout: 10)
        XCTAssertTrue(appeared, app.debugDescription)
        XCTAssertEqual(projects.label, "Projects")
        XCTAssertFalse(app.buttons["editCollage"].exists)
        XCTAssertFalse(app.buttons["editStyle"].exists)
        XCTAssertFalse(app.buttons["closeStyle"].exists)
        XCTAssertFalse(app.navigationBars["Edit collage"].exists)
        XCTAssertFalse(app.navigationBars["Style"].exists)
        return appeared
    }

    private func previewRatio(in app: XCUIApplication) throws -> CGFloat {
        let frame = collagePreview(in: app).frame
        XCTAssertGreaterThan(frame.width, 20)
        XCTAssertGreaterThan(frame.height, 20)
        return frame.width / frame.height
    }

    private func importTwoPhotos(in app: XCUIApplication) {
        XCTAssertTrue(revealInWorkspace(app.buttons["addPhotos"], in: app))
        app.buttons["addPhotos"].tap()
        let photos = app.images.matching(NSPredicate(format: "label BEGINSWITH %@", "Photo,"))
        XCTAssertTrue(photos.firstMatch.waitForExistence(timeout: 30), app.debugDescription)
        XCTAssertGreaterThanOrEqual(photos.count, 2)
        for index in 0..<2 {
            photos.element(boundBy: index).coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        app.buttons.matching(NSPredicate(format: "label == %@ OR label == %@", "Add", "Done")).firstMatch.tap()
        let imported = expectation(for: NSPredicate(format: "label == %@", "2 of 16 photos"), evaluatedWith: app.staticTexts["projectPhotoCount"])
        wait(for: [imported], timeout: 30)
    }

    private func assertPinned(
        paneFrame: CGRect,
        previewFrame: CGRect,
        saveFrame: CGRect,
        discardFrame: CGRect,
        controlsFrame: CGRect,
        in app: XCUIApplication
    ) {
        let pane = projectPreview(in: app)
        let preview = collagePreview(in: app)
        XCTAssertEqual(pane.frame, paneFrame)
        XCTAssertEqual(preview.frame, previewFrame)
        XCTAssertEqual(preview.label, "Collage preview, 2 photos")
        XCTAssertEqual(app.buttons["saveEdits"].frame, saveFrame)
        XCTAssertEqual(app.buttons["Discard"].frame, discardFrame)
        XCTAssertTrue(app.buttons["saveEdits"].isHittable)
        XCTAssertTrue(app.buttons["Discard"].isHittable)
        let controls = workspaceControls(in: app)
        XCTAssertEqual(controls.frame, controlsFrame)
        XCTAssertLessThanOrEqual(pane.frame.maxY, controls.frame.minY + 1)
        XCTAssertGreaterThanOrEqual(app.buttons["saveEdits"].frame.minY, controls.frame.maxY - 1)
    }

    private func assertWorkspaceStaysAfterEdgeSwipe(in app: XCUIApplication) {
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.5))
        let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.5))
        start.press(forDuration: 0.05, thenDragTo: end)
        XCTAssertTrue(app.buttons["closeProject"].waitForExistence(timeout: 3))
        XCTAssertTrue(workspaceControls(in: app).exists)
        XCTAssertFalse(libraryNavigationTitle(in: app).exists)
    }

    /// Scrolls a bounded number of times until a control exists and can be hit.
    ///
    /// A Form can omit offscreen rows until they are scrolled into view, so absence
    /// is not treated as a finished search.
    @discardableResult
    private func reveal(
        _ element: XCUIElement,
        in app: XCUIApplication,
        maxSwipes: Int = 6
    ) -> Bool {
        if element.exists, element.isHittable {
            return true
        }

        for _ in 0..<maxSwipes {
            app.swipeUp()
            if element.exists, element.isHittable {
                return true
            }
        }

        return element.exists && element.isHittable
    }

    /// Scrolls only `workspaceControls`. A full-app swipe would drag across the pinned preview.
    private enum WorkspaceScrollDirection { case up, down }

    /// Drag the trailing gutter so the gesture does not land on a slider. Distance is at
    /// most half the viewport. When the target already exists, move its center toward the
    /// viewport center instead of continuing a search direction that has already passed it.
    private func nudgeWorkspace(
        _ controls: XCUIElement,
        toward element: XCUIElement? = nil,
        fallback direction: WorkspaceScrollDirection = .up
    ) {
        let viewport = controls.frame
        let half = max(viewport.height * 0.5, 40)
        let delta: CGFloat
        if let element, element.exists, !element.frame.isEmpty {
            let needed = viewport.midY - element.frame.midY
            delta = min(max(needed, -half), half)
        } else {
            delta = direction == .up ? -half : half
        }
        guard abs(delta) > 1 else { return }
        let goingUp = delta < 0
        let start = controls.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: goingUp ? 0.72 : 0.28))
        let end = start.withOffset(CGVector(dx: 0, dy: delta))
        start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.35)
    }

    /// The whole target must sit inside the controls viewport. Hittable alone can be a
    /// toolbar or a strip button outside the scrolled content.
    private func isInsideWorkspace(_ element: XCUIElement, _ controls: XCUIElement) -> Bool {
        guard element.exists, controls.exists, !element.frame.isEmpty, !controls.frame.isEmpty else { return false }
        let viewport = controls.frame.insetBy(dx: 0, dy: -1)
        return viewport.contains(element.frame)
    }

    @discardableResult
    private func revealInWorkspace(
        _ element: XCUIElement,
        in app: XCUIApplication,
        maxSwipes: Int = 12,
        direction: WorkspaceScrollDirection = .up
    ) -> Bool {
        let controls = workspaceControls(in: app)
        if isInsideWorkspace(element, controls), element.isHittable {
            return true
        }
        for _ in 0..<maxSwipes {
            guard controls.exists else { break }
            nudgeWorkspace(controls, toward: element, fallback: direction)
            if isInsideWorkspace(element, controls), element.isHittable {
                return true
            }
        }
        let found = isInsideWorkspace(element, controls) && element.isHittable
        if !found {
            let detail = "workspace reveal missed target. exists=\(element.exists) hittable=\(element.exists && element.isHittable) target=\(element.exists ? String(describing: element.frame) : "missing") viewport=\(controls.exists ? String(describing: controls.frame) : "missing") direction=\(direction)"
            let attachment = XCTAttachment(string: detail)
            attachment.name = "Workspace reveal miss"
            attachment.lifetime = .keepAlways
            add(attachment)
            print(detail)
        }
        return found
    }

    /// Bring the whole control into the controls viewport before gestures.
    private func positionInWorkspace(_ element: XCUIElement, in app: XCUIApplication) {
        let controls = workspaceControls(in: app)
        let targetY = controls.frame.midY
        for _ in 0..<4 {
            guard element.exists else { break }
            let distance = element.frame.midY - targetY
            if abs(distance) < 8, element.isHittable { break }
            let start = controls.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.62))
            let end = start.withOffset(CGVector(dx: 0, dy: -min(max(distance, -220), 220)))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.4)
        }
        XCTAssertTrue(element.isHittable)
        XCTAssertGreaterThanOrEqual(element.frame.minY, controls.frame.minY - 1)
        XCTAssertLessThan(element.frame.maxY, app.frame.maxY - 8)
    }

    private func scrollWorkspace(toTopIn app: XCUIApplication) {
        let controls = workspaceControls(in: app)
        let photos = app.staticTexts["Photos"].firstMatch
        for _ in 0..<12 {
            XCTAssertTrue(controls.exists)
            if isInsideWorkspace(photos, controls), photos.frame.minY < controls.frame.minY + 80 {
                break
            }
            nudgeWorkspace(controls, toward: photos, fallback: .down)
        }
        XCTAssertTrue(projectPreview(in: app).exists)
        XCTAssertTrue(isInsideWorkspace(photos, controls))
    }

    /// Measure the same four labels in the same saved collage at explicit normal and
    /// largest sizes before permitting their known iOS 26.3 SwiftUI audit warning.
    /// A fixed font fails growth even though the larger grid columns offer more width.
    private func verifyLayoutLabelScaling(in app: XCUIApplication) throws {
        var normalFrames: [String: CGRect] = [:]
        for layout in focusLayouts {
            normalFrames[layout.id] = visibleLayoutLabelFrame(layout, in: app)
        }
        attachScreenshot(of: app, named: "layout-labels-normal-text")
        app.buttons["closeProject"].tap()
        let saved = app.buttons.matching(NSPredicate(
            format: "identifier BEGINSWITH %@ AND label CONTAINS %@",
            "savedProject-", "2 of 16 photos"
        )).firstMatch
        XCTAssertTrue(saved.waitForExistence(timeout: 10))
        let savedID = saved.identifier

        for category in [largeContentSizeCategory, normalContentSizeCategory] {
            app.terminate()
            app.launchArguments = ["-UIPreferredContentSizeCategoryName", category]
            app.launch()
            XCTAssertTrue(app.buttons[savedID].waitForExistence(timeout: 10))
            app.buttons[savedID].tap()
            XCTAssertTrue(workspaceIsVisible(in: app))
            let ready = expectation(
                for: NSPredicate(format: "label == %@", "Collage preview, 2 photos"),
                evaluatedWith: collagePreview(in: app)
            )
            wait(for: [ready], timeout: 15)
            if category == largeContentSizeCategory {
                var evidence: [String] = []
                for layout in focusLayouts {
                    let normal = try XCTUnwrap(normalFrames[layout.id])
                    let enlarged = visibleLayoutLabelFrame(layout, in: app)
                    let grows = enlarged.height > normal.height * 1.5
                    XCTAssertTrue(grows, "\(layout.label) must scale: normal=\(normal), largest=\(enlarged)")
                    if grows { verifiedLayoutScaling.insert(layout.id) }
                    evidence.append("\(layout.id): normal=\(normal), largest=\(enlarged)")
                }
                XCTAssertEqual(verifiedLayoutScaling.count, focusLayouts.count)
                let attachment = XCTAttachment(string: evidence.joined(separator: "\n"))
                attachment.name = "Verified layout label scaling"
                attachment.lifetime = .keepAlways
                add(attachment)
                print(evidence.joined(separator: "\n"))
                attachScreenshot(of: app, named: "layout-labels-largest-text")
                try auditWorkspace(in: app, for: .dynamicType)
                app.buttons["closeProject"].tap()
            }
        }
        scrollWorkspace(toTopIn: app)
    }

    private func visibleLayoutLabelFrame(
        _ layout: (id: String, label: String), in app: XCUIApplication
    ) -> CGRect {
        let button = app.buttons[layout.id]
        XCTAssertTrue(revealInWorkspace(button, in: app), layout.id)
        let label = button.staticTexts[layout.label]
        XCTAssertTrue(label.exists, layout.label)
        XCTAssertTrue(label.isHittable, layout.label)
        let frame = label.frame
        XCTAssertGreaterThan(frame.height, 0)
        XCTAssertTrue(button.frame.contains(frame), "\(layout.label): label=\(frame), button=\(button.frame)")
        XCTAssertTrue(isInsideWorkspace(label, workspaceControls(in: app)), layout.label)
        return frame
    }

    /// The owner-approved exception is only for the four measured layout labels, on
    /// iOS 26.3, with the exact SwiftUI font warning and a fully visible matching label.
    /// Apple DTS: https://developer.apple.com/forums/thread/828525
    /// Other categories, elements, OS versions, duplicates and timeouts still fail.
    private func auditWorkspace(
        in app: XCUIApplication, for types: XCUIAccessibilityAuditType = .all
    ) throws {
        XCTAssertFalse(app.navigationBars["Edit collage"].exists)
        XCTAssertTrue(projectPreview(in: app).exists)
        let os = ProcessInfo.processInfo.operatingSystemVersion
        var acceptedLayouts: Set<String> = []
        do {
            try app.performAccessibilityAudit(for: types) { issue in
                var accepted = false
                defer {
                    if !accepted {
                        let element = issue.element
                        let detail = "Unfiltered workspace audit issue: \(issue.detailedDescription); label=\(element?.label ?? "missing"), frame=\(element.map { String(describing: $0.frame) } ?? "missing"), viewport=\(self.workspaceControls(in: app).frame)"
                        let attachment = XCTAttachment(string: detail)
                        attachment.name = "Unfiltered workspace audit issue"
                        attachment.lifetime = .keepAlways
                        self.add(attachment)
                        print(detail)
                    }
                }
                guard os.majorVersion == 26, os.minorVersion == 3,
                      issue.auditType == .dynamicType,
                      issue.detailedDescription == "User will not be able to change the font size of this SwiftUI.AccessibilityNode",
                      let element = issue.element, element.elementType == .staticText,
                      let layout = self.focusLayouts.first(where: { $0.label == element.label }),
                      self.verifiedLayoutScaling.contains(layout.id),
                      !acceptedLayouts.contains(layout.id)
                else { return false }
                let button = app.buttons[layout.id]
                let label = button.staticTexts[layout.label]
                let frame = element.frame
                let controls = self.workspaceControls(in: app)
                guard button.exists, label.exists, frame.width > 0, frame.height > 0,
                      frame == label.frame, button.frame.contains(frame),
                      self.isInsideWorkspace(button, controls), label.isHittable
                else { return false }
                acceptedLayouts.insert(layout.id)
                let detail = "iOS 26.3 layout-label Dynamic Type exception: \(layout.id) (\(layout.label)), label=\(frame), viewport=\(controls.frame); normal-to-largest scaling verified in this journey"
                let attachment = XCTAttachment(string: detail)
                attachment.name = "Verified layout-label Dynamic Type exception"
                attachment.lifetime = .keepAlways
                self.add(attachment)
                print(detail)
                accepted = true
                return true
            }
        } catch let error as NSError where error.domain == "XCTAutomationSupportErrorDomain" && error.code == -56 {
            let detail = "Accessibility audit timed out (error -56) on the single-screen workspace. Checks were not weakened."
            let attachment = XCTAttachment(string: detail + "\n" + String(describing: error))
            attachment.name = "Workspace accessibility audit timeout"
            attachment.lifetime = .keepAlways
            add(attachment)
            XCTFail(detail)
        }
    }

    /// Audits the editor's discard confirmation. UIAlertController owns the alert's title and
    /// message fonts, so only Dynamic Type reports on exactly those two system labels are exempt;
    /// contrast and every other category stay unfiltered, as do the alert's buttons.
    /// On iOS 26.3 the alert also reports one element-less duplicate of the same UILabel issue per
    /// label; at most that many are accepted, and only while this alert is presented.
    private func auditDiscardAlert(_ alert: XCUIElement, in app: XCUIApplication) throws {
        let systemLabels: Set<String> = ["Discard changes?", "Your edits to this collage haven't been saved."]
        XCTAssertTrue(systemLabels.allSatisfy { alert.staticTexts[$0].exists })
        try app.performAccessibilityAudit(for: .contrast)
        var elementlessDuplicates = 0
        try app.performAccessibilityAudit(for: .all.subtracting(.contrast)) { issue in
            guard issue.auditType == .dynamicType, alert.exists else { return false }
            let detail: String
            if let element = issue.element {
                guard element.elementType == .staticText, systemLabels.contains(element.label),
                      alert.staticTexts[element.label].exists
                else { return false }
                detail = "System alert Dynamic Type exception: \(element.label)"
            } else {
                guard issue.detailedDescription.contains("font size of this UILabel"),
                      elementlessDuplicates < systemLabels.count
                else { return false }
                elementlessDuplicates += 1
                detail = "System alert Dynamic Type exception: element-less UILabel duplicate \(elementlessDuplicates) while the alert is presented"
            }
            let attachment = XCTAttachment(string: detail)
            attachment.name = "System alert Dynamic Type exception"
            attachment.lifetime = .keepAlways
            self.add(attachment)
            print(detail)
            return true
        }
    }

    private func attachScreenshot(of app: XCUIApplication, named name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
