# SwiftUI scroll contrast reproduction

This standalone app reproduces a contrast-audit finding on text clipped out of a scrolling viewport. It does not import the collage app, touch its projects, use photos, or change its test suite. Its separate bundle ID is `ca.esmcelroy.ScrollContrastRepro`.

## Reproduce

Open `ScrollContrastRepro.xcodeproj` and run its shared scheme on an iPhone simulator, or run from the repository root:

```sh
xcodebuild \
  -project ios/Diagnostics/ScrollContrastRepro/ScrollContrastRepro.xcodeproj \
  -scheme ScrollContrastRepro \
  -destination 'platform=iOS Simulator,id=YOUR_SIMULATOR_UDID' \
  -derivedDataPath .amp/in/scroll-repro-dd \
  -resultBundlePath .amp/in/artifacts/scroll-contrast-repro.xcresult \
  -parallel-testing-enabled NO \
  CODE_SIGNING_ALLOWED=NO test
```

Use a new result-bundle path for each run. No seeded library, account, signing credentials, or external dependencies are needed.

**The diagnostic suite intentionally fails when the audit reports issues.** It has no accepted issues or expected-failure wrappers. Its logging handler always returns `false`; `continueAfterFailure` allows comparison of the visible and occluded states. This is not a passing application acceptance suite. To run only the baseline, add:

```sh
-only-testing:ScrollContrastReproUITests/ScrollContrastReproUITests/testEagerStack
```

For the independent passing control, use `testVisibleHighContrastControl`; for the deliberately failing visible-color control, use `testVisibleLowContrastControl`.

## Fixture

A navigation stack contains a white pinned preview, a gray scrolling region, and a white pinned footer. The scroll content is twelve text rows with semantic system fonts. The target row is the black headline `Photo`.

Each comparison uses explicit normal Large text in light appearance:

1. Tap Reveal to bring Photo wholly inside the scroll viewport. Assert containment and hittability, retain the accessibility hierarchy and screenshot, and run a strict contrast audit.
2. Drag the trailing gutter so Photo's accessibility frame moves above the scroll viewport, near the navigation toolbar. Assert it is wholly above the viewport and not hittable if still exposed, capture the hierarchy/screen, and run the same strict audit again.

A separate negative control changes only Photo's color to pale gray while leaving it visible. The tests never change the accessibility tree to hide clipped content.

Launch environment `SCROLL_VARIANT` selects `eager` (default), `scroll-contain`, `content-contain`, `clipped`, `lazy`, or `list`. `LOW_CONTRAST=1` enables the intentional color defect. These are diagnostic-only variations in this app, not collage-app settings.

## Observed comparison

Verified with Xcode 26.3 (17C529), iOS SDK 26.2, iPhone 17 Pro simulator / iOS 26.3.1, 402 × 874 pt. The final run is `.amp/in/artifacts/scroll-contrast-repro-final.xcresult`, with log `.amp/in/scroll-contrast-repro-final.log` and exported screenshots/hierarchies in `.amp/in/artifacts/scroll-contrast-repro-final-captures/`.

**Final strict result: 8 tests, 1 passed, 7 failed, 0 skipped.** The independent visible high-contrast control passes. Each of the six implementation comparisons fails only on its occluded-state audit. The seventh failure is the deliberately low-contrast visible control. All six normal-contrast visible audits pass, and no geometry or hittability assertion fails. This repeats the refined comparison results without accepting any issues.

| Implementation | Visible normal-contrast audit | After scrolling |
| --- | --- | --- |
| ScrollView + VStack | No issues | Photo contrast report |
| `.accessibilityElement(children: .contain)` on ScrollView | No issues | Same Photo report |
| `.contain` on the content VStack | No issues | Same Photo report |
| Explicit `.clipped()` on ScrollView | No issues | Same Photo report |
| ScrollView + LazyVStack | No issues | Same Photo report; lazy caching still exposes the nearby clipped row |
| Native List | No issues | Photo is absent from the tree, but clipped-out Control row 7 receives a contrast report |
| Visible pale-gray Photo control | Contrast failure on Photo | Not scrolled |

For the five ScrollView variants, the viewport is `(0,306,402,434)`. Visible Photo is `(16,322,47,20.3)`; occluded Photo is `(16,95,47,20.3)`, over the Reveal toolbar button rather than rendered Photo text. All five produce exactly `Contrast failed for SwiftUI.AccessibilityNode`, label `Photo`, at the occluded position. Screenshots confirm scroll content is visually clipped and does not paint over the preview or footer.

List exposes a whole-row accessibility frame rather than the text glyph frame. Its reported Control row 7 frame `(0,247,402,152)` intersects the viewport, but the screenshot's first visible text is Control row 8. Therefore List does not eliminate the issue; merely checking row-frame intersection is not sufficient to establish rendered text visibility.

The initial exploratory run also reported a fixture-header issue caused by placing the header identifier directly on a padded/framed Text. That confounded experiment is retained as `scroll-contrast-repro.xcresult`, not the reference result. The final fixture uses a containing VStack for each pinned region so the semantic text keeps its own bounds. The refined run above has only the intended seven contrast findings, with no geometry or hittability assertion failures.

## Interpretation and limits

The report is reproducible without collage rendering, asynchronous image work, data storage, editing state, custom fonts, or disabled controls. The tested containment/clipping/lazy/List changes do not provide an audit-preserving fix. This supports a SwiftUI/accessibility-audit clipping interaction, not a product text-color defect. It does not establish the audit's private implementation, VoiceOver behavior, or that every contrast report in the collage app is invalid.

Apple documents [contain](https://developer.apple.com/documentation/swiftui/accessibilitychildbehavior/contain) as accessibility navigation grouping, not a clipping rule. Its [audit presentation](https://developer.apple.com/videos/play/wwdc2023/10035/) describes an audit as limited to on-screen elements. This reproduction demonstrates reports on visually clipped text in the tested configuration.

Keep production audits unchanged. Do not hide offscreen accessibility elements, combine interactive controls into a single label, change correct colors, or remove audit checkpoints to obtain a green result. This source and synthetic attachments can accompany an Apple feedback report; no report has been submitted. Other OS versions, physical devices, and assistive-technology navigation remain unverified.
