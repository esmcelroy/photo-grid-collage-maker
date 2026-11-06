import XCTest

/// Observable UI contract for the native app shell.
///
/// These tests drive the installed app through accessibility labels, identifiers,
/// and visible text. They do not call production helpers or assert on private state.
@MainActor
final class CollageMakerUITests: XCTestCase {
    private let largeContentSizeCategory = "UICTContentSizeCategoryAccessibilityXXXL"

    override func setUp() async throws {
        try await super.setUp()
        continueAfterFailure = false
        XCUIDevice.shared.appearance = .light
    }

    override func tearDown() async throws {
        XCUIDevice.shared.appearance = .light
        try await super.tearDown()
    }

    func testRealPickerImportsAndReopensProject() throws {
        continueAfterFailure = true
        let app = launchedApp()
        let create = app.buttons["New Collage"]
        XCTAssertTrue(create.waitForExistence(timeout: 10))
        XCTAssertTrue(reveal(create, in: app))
        create.tap()
        let count = app.staticTexts["projectPhotoCount"]
        XCTAssertTrue(count.waitForExistence(timeout: 10))
        XCTAssertEqual(count.label, "0 of 16 photos")
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
        let preview = app.descendants(matching: .any).matching(identifier: "projectPreview").firstMatch
        let ready = expectation(for: NSPredicate(format: "label == %@", "Collage preview, 2 photos"), evaluatedWith: preview)
        wait(for: [ready], timeout: 15)
        attachScreenshot(of: app, named: "project-imported")
        try app.performAccessibilityAudit()
        XCTAssertTrue(reveal(app.buttons["editCollage"], in: app))
        app.buttons["editCollage"].tap()
        XCTAssertTrue(app.buttons["layoutPicker"].waitForExistence(timeout: 10))
        attachScreenshot(of: app, named: "editor-default")
        try app.performAccessibilityAudit()
        app.buttons["layoutPicker"].tap()
        app.buttons["Left Focus"].tap()
        XCTAssertTrue(reveal(app.buttons["Rotate clockwise"], in: app))
        app.buttons["Rotate clockwise"].tap()
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 90°")
        position(app.sliders["Horizontal position"], in: app)
        app.sliders["Horizontal position"].adjust(toNormalizedSliderPosition: 0.2)
        position(app.sliders["Vertical position"], in: app)
        app.sliders["Vertical position"].adjust(toNormalizedSliderPosition: 0.8)
        let horizontalValue = try XCTUnwrap(app.sliders["Horizontal position"].value as? String)
        let verticalValue = try XCTUnwrap(app.sliders["Vertical position"].value as? String)
        XCTAssertLessThan(try XCTUnwrap(Double(horizontalValue.components(separatedBy: CharacterSet.decimalDigits.inverted).joined())), 40)
        XCTAssertGreaterThan(try XCTUnwrap(Double(verticalValue.components(separatedBy: CharacterSet.decimalDigits.inverted).joined())), 60)
        let zoom = app.steppers["photoZoom"]
        XCTAssertTrue(reveal(zoom, in: app))
        zoom.buttons["photoZoom-Increment"].tap()
        XCTAssertTrue(app.staticTexts["Zoom: 105%"].exists)
        XCTAssertTrue(reveal(app.buttons["swapPicker"], in: app))
        XCTAssertFalse(app.buttons["Swap photos"].isEnabled)
        position(app.buttons["Swap photos"], in: app, targetY: app.frame.maxY - 146)
        attachScreenshot(of: app, named: "editor-disabled-swap")
        try auditScrolledEditor(in: app)

        // The exceptions must not replace contrast coverage of these same labels.
        scrollEditorToTop(in: app)
        let caption = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Horizontal position: ")).firstMatch
        let navigationFrame = app.navigationBars["Edit collage"].frame
        for element in [caption, app.buttons["slotPicker"]] {
            XCTAssertGreaterThanOrEqual(element.frame.minY, navigationFrame.maxY)
            XCTAssertLessThanOrEqual(element.frame.maxY, app.frame.maxY - 24)
        }
        attachScreenshot(of: app, named: "editor-visible-contrast-controls")
        try app.performAccessibilityAudit(for: .contrast)
        XCTAssertTrue(reveal(app.buttons["swapPicker"], in: app))

        app.buttons["swapPicker"].tap()
        app.buttons["Slot 2 · Photo 2"].tap()
        app.buttons["Swap photos"].tap()
        position(app.buttons["Swap photos"], in: app, targetY: app.frame.maxY - 146)
        attachScreenshot(of: app, named: "editor-adjustments")
        try auditScrolledEditor(in: app)
        scrollEditorToTop(in: app)
        XCTAssertTrue(app.buttons["slotPicker"].label.contains("Photo 2"))
        attachScreenshot(of: app, named: "editor-edited-preview")
        app.buttons["saveEdits"].tap()
        XCTAssertTrue(app.buttons["editCollage"].waitForExistence(timeout: 10))
        app.buttons["closeProject"].tap()
        let saved = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@ AND label CONTAINS %@", "savedProject-", "2 of 16 photos")).firstMatch
        XCTAssertTrue(saved.waitForExistence(timeout: 10))
        let savedID = saved.identifier
        attachScreenshot(of: app, named: "library-saved")
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons[savedID].waitForExistence(timeout: 10))
        app.buttons[savedID].tap()
        XCTAssertTrue(count.waitForExistence(timeout: 10))
        XCTAssertEqual(count.label, "2 of 16 photos")
        let reopened = expectation(for: NSPredicate(format: "label == %@", "Collage preview, 2 photos"), evaluatedWith: preview)
        wait(for: [reopened], timeout: 15)
        attachScreenshot(of: app, named: "project-reopened")
        XCTAssertTrue(reveal(app.buttons["editCollage"], in: app))
        app.buttons["editCollage"].tap()
        XCTAssertTrue(app.buttons["layoutPicker"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["layoutPicker"].label.contains("Left Focus"))
        XCTAssertTrue(app.buttons["slotPicker"].label.contains("Photo 2"))
        XCTAssertTrue(reveal(app.staticTexts["photoRotation"], in: app))
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 90°")
        XCTAssertTrue(app.staticTexts["Zoom: 105%"].exists)
        XCTAssertEqual(app.sliders["Horizontal position"].value as? String, horizontalValue)
        XCTAssertEqual(app.sliders["Vertical position"].value as? String, verticalValue)
        app.buttons["Reset photo adjustments"].tap()
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 0°")
        XCTAssertTrue(app.staticTexts["Zoom: 100%"].exists)
        XCTAssertEqual(app.sliders["Horizontal position"].value as? String, "50 percent")
        XCTAssertEqual(app.sliders["Vertical position"].value as? String, "50 percent")

        // An edited draft cannot be swiped away; Cancel asks before discarding it.
        let editorBar = app.navigationBars["Edit collage"]
        editorBar.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.98)))
        XCTAssertTrue(editorBar.waitForExistence(timeout: 3))
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 0°")
        app.buttons["Cancel"].tap()
        let discardAlert = app.alerts["Discard changes?"]
        XCTAssertTrue(discardAlert.waitForExistence(timeout: 5))
        attachScreenshot(of: app, named: "editor-discard-alert")
        try auditDiscardAlert(discardAlert, in: app)
        app.buttons["keepEditing"].firstMatch.tap()
        XCTAssertTrue(discardAlert.waitForNonExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 0°")
        app.buttons["Cancel"].tap()
        XCTAssertTrue(discardAlert.waitForExistence(timeout: 5))
        app.buttons["discardEdits"].firstMatch.tap()
        XCTAssertTrue(editorBar.waitForNonExistence(timeout: 5))
        app.buttons["editCollage"].tap()
        XCTAssertTrue(reveal(app.staticTexts["photoRotation"], in: app))
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 90°")
        app.buttons["Cancel"].tap()

        // Styling uses the same project draft, without resetting photo adjustments.
        app.buttons["editCollage"].tap()
        openStyle(in: app)
        let gap = app.sliders["styleGap"]
        let radius = app.sliders["styleRadius"]
        XCTAssertEqual(gap.value as? String, "8 points")
        XCTAssertEqual(radius.value as? String, "0 points")
        attachScreenshot(of: app, named: "editor-style-default-controls")
        try app.performAccessibilityAudit()
        gap.adjust(toNormalizedSliderPosition: 0.65)
        radius.adjust(toNormalizedSliderPosition: 0.4)
        let savedGap = try XCTUnwrap(gap.value as? String)
        let savedRadius = try XCTUnwrap(radius.value as? String)
        XCTAssertNotEqual(savedGap, "8 points")
        XCTAssertNotEqual(savedRadius, "0 points")
        selectBackground("Lavender", in: app)
        XCTAssertEqual(app.staticTexts["backgroundStatus"].label, "Background: Lavender")
        attachScreenshot(of: app, named: "editor-style-lavender-controls")
        try app.performAccessibilityAudit(for: .contrast)
        try app.performAccessibilityAudit(for: .all.subtracting(.contrast))
        let customColor = app.buttons["background.custom"]
        XCTAssertTrue(reveal(customColor, in: app))
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
        app.buttons["closeStyle"].tap()
        scrollEditorToTop(in: app)
        attachScreenshot(of: app, named: "editor-style-custom-preview")
        app.buttons["saveEdits"].tap()
        XCTAssertTrue(app.buttons["closeProject"].waitForExistence(timeout: 10))
        app.buttons["closeProject"].tap()
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons[savedID].waitForExistence(timeout: 10))
        app.buttons[savedID].tap()
        XCTAssertTrue(reveal(app.buttons["editCollage"], in: app))
        app.buttons["editCollage"].tap()
        XCTAssertTrue(app.buttons["layoutPicker"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["layoutPicker"].label.contains("Left Focus"))
        XCTAssertTrue(app.buttons["slotPicker"].label.contains("Photo 2"))
        XCTAssertTrue(reveal(app.staticTexts["photoRotation"], in: app))
        XCTAssertEqual(app.staticTexts["photoRotation"].label, "Rotation: 90°")
        XCTAssertTrue(app.staticTexts["Zoom: 105%"].exists)
        XCTAssertEqual(app.sliders["Horizontal position"].value as? String, horizontalValue)
        XCTAssertEqual(app.sliders["Vertical position"].value as? String, verticalValue)
        openStyle(in: app)
        XCTAssertEqual(gap.value as? String, savedGap)
        XCTAssertEqual(radius.value as? String, savedRadius)
        XCTAssertEqual(app.staticTexts["backgroundStatus"].label, customBackground)

        gap.adjust(toNormalizedSliderPosition: 0)
        XCTAssertEqual(gap.value as? String, "0 points")
        radius.adjust(toNormalizedSliderPosition: 1)
        XCTAssertEqual(radius.value as? String, "32 points")
        selectBackground("Black", in: app)
        XCTAssertEqual(app.staticTexts["backgroundStatus"].label, "Background: Black")
        app.buttons["closeStyle"].tap()
        app.buttons["Cancel"].tap()
        app.buttons["discardEdits"].firstMatch.tap()
        app.buttons["editCollage"].tap()
        openStyle(in: app)
        XCTAssertEqual(gap.value as? String, savedGap)
        XCTAssertEqual(radius.value as? String, savedRadius)
        XCTAssertEqual(app.staticTexts["backgroundStatus"].label, customBackground)
        selectBackground("Transparent", in: app)
        XCTAssertEqual(app.staticTexts["backgroundStatus"].label, "Background: Transparent")
        attachScreenshot(of: app, named: "editor-style-transparent-controls")
        try app.performAccessibilityAudit(for: .contrast)
        try app.performAccessibilityAudit(for: .all.subtracting(.contrast))
        app.buttons["closeStyle"].tap()
        scrollEditorToTop(in: app)
        attachScreenshot(of: app, named: "editor-style-transparent-preview")
        app.buttons["saveEdits"].tap()
        XCTAssertTrue(app.buttons["closeProject"].waitForExistence(timeout: 10))
        app.buttons["closeProject"].tap()

        app.terminate()
        app.launchArguments += ["-UIPreferredContentSizeCategoryName", largeContentSizeCategory]
        app.launch()
        XCTAssertTrue(app.buttons[savedID].waitForExistence(timeout: 10))
        app.buttons[savedID].tap()
        XCTAssertTrue(reveal(app.buttons["editCollage"], in: app))
        app.buttons["editCollage"].tap()
        XCTAssertTrue(reveal(app.buttons["layoutPicker"], in: app))
        attachScreenshot(of: app, named: "editor-large-text-preview")
        XCTAssertTrue(reveal(app.buttons["Reset photo adjustments"], in: app))
        attachScreenshot(of: app, named: "editor-large-text-controls")
        // Audit the stable top viewport; control reachability is checked separately.
        scrollEditorToTop(in: app)
        try app.performAccessibilityAudit()
        openStyle(in: app)
        XCTAssertEqual(gap.value as? String, savedGap)
        XCTAssertEqual(radius.value as? String, savedRadius)
        XCTAssertEqual(app.staticTexts["backgroundStatus"].label, "Background: Transparent")
        attachScreenshot(of: app, named: "editor-style-large-text-sliders")
        XCTAssertTrue(reveal(app.buttons["backgroundPresetPicker"], in: app))
        attachScreenshot(of: app, named: "editor-style-large-text-backgrounds")
        try app.performAccessibilityAudit(for: .contrast)
        try app.performAccessibilityAudit(for: .all.subtracting(.contrast))
    }

    private func openStyle(in app: XCUIApplication) {
        let style = app.buttons["editStyle"]
        XCTAssertTrue(reveal(style, in: app))
        style.tap()
        XCTAssertTrue(app.buttons["closeStyle"].waitForExistence(timeout: 10))
        let navigation = app.navigationBars["Style"]
        navigation.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)))
        XCTAssertTrue(app.sliders["styleGap"].exists)
    }

    private func selectBackground(_ name: String, in app: XCUIApplication) {
        let picker = app.buttons["backgroundPresetPicker"]
        XCTAssertTrue(reveal(picker, in: app))
        picker.tap()
        XCTAssertTrue(app.buttons[name].waitForExistence(timeout: 5))
        app.buttons[name].tap()
    }

    func testLibraryShellOpensAndDismissesAboutPreview() throws {
        let app = launchedApp()

        XCTAssertTrue(libraryNavigationTitle(in: app).waitForExistence(timeout: 5))
        XCTAssertTrue(libraryHeading(in: app).exists)
        XCTAssertTrue(app.staticTexts["Native preview"].exists)

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
        XCTAssertTrue(app.staticTexts["projectPhotoCount"].waitForExistence(timeout: 10))
        XCTAssertTrue(reveal(app.buttons["addPhotos"], in: app))
        app.swipeUp()
        let savedExplanation = app.staticTexts["Your collage is saved on this device automatically."]
        XCTAssertTrue(savedExplanation.isHittable)
        XCTAssertLessThanOrEqual(savedExplanation.frame.maxY, app.frame.maxY - 24)
        attachScreenshot(of: app, named: "project-accessibility-dynamic-type")
        try app.performAccessibilityAudit()
        app.buttons["closeProject"].tap()
    }

    private func launchedApp(preferredContentSizeCategory: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        if let preferredContentSizeCategory {
            app.launchArguments += [
                "-UIPreferredContentSizeCategoryName",
                preferredContentSizeCategory,
            ]
        }
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

    /// Bring the whole control into the viewport before gestures; existence alone is insufficient.
    private func position(_ element: XCUIElement, in app: XCUIApplication, targetY: CGFloat? = nil) {
        let targetY = targetY ?? app.frame.midY
        for _ in 0..<4 {
            let distance = element.frame.midY - targetY
            if abs(distance) < 4 { break }
            // Drag on the scroll view's padding, not on a slider or other control.
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.55))
            let end = start.withOffset(CGVector(dx: 0, dy: -min(max(distance, -300), 300)))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.5)
        }
        XCTAssertTrue(element.isHittable)
        XCTAssertGreaterThan(element.frame.minY, app.navigationBars["Edit collage"].frame.maxY)
        XCTAssertLessThan(element.frame.maxY, app.frame.maxY - 24)
    }

    private func scrollEditorToTop(in app: XCUIApplication) {
        let preview = app.descendants(matching: .any).matching(identifier: "editorPreview").firstMatch
        let navigation = app.navigationBars["Edit collage"]
        for _ in 0..<10 {
            XCTAssertTrue(navigation.exists)
            let distance = navigation.frame.maxY + 24 - preview.frame.minY
            if distance <= 12 { break }
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.35))
            start.press(
                forDuration: 0.1,
                thenDragTo: start.withOffset(CGVector(dx: 0, dy: min(distance + 10, 300))),
                withVelocity: .slow, thenHoldForDuration: 0.5
            )
        }
        XCTAssertTrue(navigation.exists)
        XCTAssertGreaterThanOrEqual(preview.frame.minY, navigation.frame.maxY)
    }

    private func auditScrolledEditor(in app: XCUIApplication) throws {
        let version = ProcessInfo.processInfo.operatingSystemVersion
        guard version.majorVersion == 26, version.minorVersion == 3 else {
            try app.performAccessibilityAudit()
            return
        }

        let navigationBar = app.navigationBars["Edit collage"]
        XCTAssertTrue(navigationBar.exists)
        let navigationFrame = navigationBar.frame
        let caption = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Horizontal position: ")).firstMatch
        let slotText = app.staticTexts.matching(NSPredicate(format: "label == %@", app.buttons["slotPicker"].label)).firstMatch
        XCTAssertTrue(caption.exists)
        XCTAssertTrue(slotText.exists)
        // Capture geometry before the audit: its Dynamic Type checks can move content.
        let confirmedFrames = [caption.label: caption.frame, slotText.label: slotText.frame]

        // Keep color sampling separate from checks that temporarily change font sizes.
        try app.performAccessibilityAudit(for: .contrast) { issue in
            guard issue.auditType == .contrast,
                  let element = issue.element, element.elementType == .staticText,
                  let frame = confirmedFrames[element.label]
            else { return false }
            let reportedFrame = element.frame
            guard !frame.isEmpty, frame.intersects(navigationFrame),
                  !reportedFrame.isEmpty, reportedFrame.intersects(navigationFrame)
            else { return false }

            // These exact labels also receive an unfiltered audit when fully visible.
            // Never exempt other text, visible labels, other categories or other OS versions.
            let detail = "Confirmed iOS 26.3 occluded-text contrast exception: \(element.label); pre-audit frame \(frame); reported frame \(reportedFrame); navigation bar \(navigationFrame)"
            let attachment = XCTAttachment(string: detail)
            attachment.name = "Confirmed occluded-text contrast exception"
            attachment.lifetime = .keepAlways
            self.add(attachment)
            print(detail)
            return true
        }
        try app.performAccessibilityAudit(for: .all.subtracting(.contrast))
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
