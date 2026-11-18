import XCTest

/// Deliberately strict diagnostic tests. Audit findings fail normally; none are accepted.
/// A red test run is evidence for the reproduction, not a passing app quality gate.
@MainActor
final class ScrollContrastReproUITests: XCTestCase {
    func testVisibleHighContrastControl() throws { try compare("eager", occlude: false) }
    func testEagerStack() throws { try compare("eager") }
    func testScrollContainment() throws { try compare("scroll-contain") }
    func testContentContainment() throws { try compare("content-contain") }
    func testExplicitClipping() throws { try compare("clipped") }
    func testLazyStack() throws { try compare("lazy") }
    func testNativeList() throws { try compare("list") }
    func testVisibleLowContrastControl() throws { try compare("eager", lowContrast: true) }

    private func compare(_ variant: String, lowContrast: Bool = false, occlude: Bool = true) throws {
        continueAfterFailure = true
        XCUIDevice.shared.appearance = .light
        let app = XCUIApplication()
        app.launchArguments = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryL"]
        app.launchEnvironment = ["SCROLL_VARIANT": variant, "LOW_CONTRAST": lowContrast ? "1" : "0"]
        app.launch()
        XCTAssertTrue(app.buttons["reveal"].waitForExistence(timeout: 10))
        app.buttons["reveal"].tap()
        let controls = app.descendants(matching: .any)["controls"].firstMatch
        let heading = app.staticTexts["row.6"]
        XCTAssertTrue(heading.waitForExistence(timeout: 5))
        XCTAssertTrue(controls.frame.contains(heading.frame), "Visible control: \(heading.frame) in \(controls.frame)")
        XCTAssertTrue(heading.isHittable)
        try audit(app, heading: heading, controls: controls, name: "\(variant)-visible-low\(lowContrast)")
        guard occlude && !lowContrast else { return }

        let start = controls.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.72))
        start.press(
            forDuration: 0.1,
            thenDragTo: start.withOffset(CGVector(dx: 0, dy: 85 - heading.frame.minY)),
            withVelocity: .slow,
            thenHoldForDuration: 0.4
        )
        if heading.exists {
            XCTAssertLessThan(heading.frame.maxY, controls.frame.minY)
            XCTAssertFalse(heading.isHittable)
        }
        try audit(app, heading: heading, controls: controls, name: "\(variant)-occluded")
    }

    private func audit(_ app: XCUIApplication, heading: XCUIElement, controls: XCUIElement, name: String) throws {
        let bounds = heading.exists ? String(describing: heading.frame) : "absent"
        let detail = "\(name): heading=\(bounds); viewport=\(controls.frame)"
        print(detail)
        let tree = XCTAttachment(string: detail + "\n" + app.debugDescription)
        tree.name = name + "-tree"
        tree.lifetime = .keepAlways
        add(tree)
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = name
        image.lifetime = .keepAlways
        add(image)
        try app.performAccessibilityAudit(for: .contrast) { issue in
            let detail = "\(name): \(issue.detailedDescription); label=\(issue.element?.label ?? "missing"); frame=\(issue.element.map { String(describing: $0.frame) } ?? "missing")"
            print(detail)
            let attachment = XCTAttachment(string: detail)
            attachment.name = name + "-issue"
            attachment.lifetime = .keepAlways
            self.add(attachment)
            return false
        }
    }
}
