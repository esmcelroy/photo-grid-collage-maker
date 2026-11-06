# CollageMaker (iOS)

A native SwiftUI iPhone app for building photo-grid collages, developed alongside the
web app in this repository. Everything stays on the device: there is no account,
backend, analytics or sync.

"Collager" is the provisional display name. Another App Store app already uses it,
so expect it to change.

## Current state

The library now creates local collages and reopens saved projects. Each project
opens the system Photos picker, imports selected photos, and displays a native
count-aware collage preview. Imports save automatically and survive app relaunch.
Edit layout and photos opens a live-preview draft with count-aware layout selection,
horizontal/vertical crop position, 90-degree rotation, 50–300% zoom, reset and swapping.
Edit style opens a compact sheet for photo spacing, corner radius, transparent or
preset backgrounds, and custom sRGB color with opacity. Done returns to the same
draft without persisting; the parent Save/Cancel still applies to all changes.
Standard spacing/radius ranges
match the web editor (0–40 and 0–32, step 2); valid saved values above these ranges
remain available without being clamped on opening. Named preset choices, native
selection checkmarks and a written background status supplement color cues.
Save (the checkmark) atomically persists edits; Cancel (the close button) leaves the saved project unchanged. Selecting
a different layout resets assignments and transforms; swapping keeps transforms
with the slots, matching the web editor. Editing is disabled during photo import.
Naming/deletion controls and sharing remain in the
`collage-ios` backlog. The product scope and rules are in [`AGENTS.md`](AGENTS.md).

The native core now includes versioned project/photo/settings/transform models,
the generated layout catalog, and shared cell and photo geometry. These are value
types, independent of SwiftUI and main-actor isolation. The storage and rendering
layers consume this core independently of SwiftUI. `LibraryView` owns one store;
`ProjectView` binds import completion and preview reads to its originating project.

## Models and geometry contracts

`CollageProject` is a version-1 JSON manifest with stable UUIDs and project-relative
image basenames, not image bytes or temporary picker URLs. After decoding, call
`validate(catalog:)` before accepting a manifest. It checks the 16-photo limit,
unique photos/files, complete layout assignments, settings and transforms. Empty
projects and imported photos awaiting layout selection are valid. Native manifests
are not the web backup format; interoperability remains separate work.

`CollageGeometry` computes fractional tracks, rectangular spans, gaps, outer
padding and rounded clipping bounds in top-left-origin composition coordinates.
Only the explicit transparent background omits outer padding, matching the web
app. For a different preview/export resolution, use `scaled(by:)` on the same
composition geometry so gaps and radii scale with the photos. It does not choose
an export aspect-ratio or rasterization policy.

`PhotoGeometry` gives the aspect-fill image rectangle, pre-transform content clip
and clockwise rotation/zoom transform. Position values are normalized overflow
fractions (0...1), matching CSS object-position. Renderers must clip to the local
content bounds **before** rotating/zooming, then clip to the destination slot.
Rotation does not enlarge the crop to fill exposed corners. Photo swapping changes
only assignments; transforms remain attached to their slots, as in the web editor.

## Generated layout catalog

`CollageMaker/Resources/layouts.json` contains the 105 web layouts, including IDs,
names, photo counts, fractional tracks, area rows, aspect ratios and platforms.
Do not edit it by hand. With the repository's locked npm dependencies installed
(`npm ci`, using the pinned Node toolchain), run from the repository root:

```sh
node ios/scripts/generate-layouts.mjs
node ios/scripts/generate-layouts.mjs --check
```

The script uses the existing TypeScript package at generation time; the iOS app
does not depend on Node or JavaScript. `--check` fails if the bundled JSON is stale
or missing. Native tests load the actual bundled resource and check coverage for
every photo count from 1 through 16. Geometry tests use independent asymmetric
expected rectangles and transformed points, not the production formulas.

## Local project store

Use one `ProjectStore` actor per root. Production roots come from
`ProjectStore.applicationSupportRootURL()`; tests inject an isolated temporary
root. Every operation names a project UUID, with no global active project. The
UI must guard late activation/results and ask for confirmation before calling
`deleteProject`.

Projects contain `project.json` and an `Originals/` directory. Creation stages a
complete directory before publishing it; imports copy unique originals before
atomically replacing the manifest, rolling back new copies on failure. Saves
cannot change the stored photo list. Imports report actual committed successes
and per-source failures, enforcing 16 photos under overlapping calls. Changing
the photo count resets the layout and transforms, matching the web editor.

`PhotoImportSource` requires a regular local file and its orientation-corrected
pixel dimensions. The importer must validate/decode it and keep the picker file
alive until the store call completes. The store copies original bytes unchanged;
it does not decode or re-encode them. Symlinks, directories and remote URLs are
rejected, so a committed original never depends on a picker file's lifetime.

The library reports damaged manifests separately and counts missing originals;
one damaged project does not hide healthy ones. Application Support data is not
excluded from system backups: backup policy remains undecided, and local-only
does not mean device backups cannot contain photos.

## Import and preview components

`PhotoImportButton` provides an ordered, image-only system PhotosPicker using
current encoding without requesting broad library access. It takes a store,
project UUID, current photo count and completion callback. Completion includes
the originating project UUID; callers must not apply it to a different project.
It disables selection while pending or full, and picker dismissal reports nothing.
System Photos may download iCloud-only selections; the app itself adds no network
storage or photo upload path.

`PhotoImporter` validates JPEG/PNG/HEIC files off-main with bounded thumbnail
decoding, preserves original bytes and oriented dimensions, then asks the store to
commit. Reports retain picker indices across partial validation/store failures.
`PhotoImportItem.loadFile()` transfers ownership of a new temporary copy, never a
durable project original; the importer deletes it on success, failure or cancellation.
The real provider-file transfer and system picker selection/cancellation are
tested on the simulator. The picker journey imports synthetic PNGs, closes the
project, relaunches the app and reopens the same saved collage. HEIC and oriented
JPEGs are covered by importer tests, not this picker journey. Actual library HEIC,
Live Photo delivery and iCloud-only asset behavior still need device testing.

`CollagePreview` is read-only and accepts a project snapshot, layout, local URLs,
composition size and thumbnail bound (1...1600 pixels on the longest side).
ImageIO downsampling runs off-main, sequentially per request; generation checks
reject superseded results. SwiftUI draws shared geometry using an isolated cropped
layer before rotation/zoom and destination clipping. The component shows empty,
loading, missing-photo and invalid states without consulting the store.

A temporary simulator host verified populated, empty and missing-photo rendering.
An asymmetric three-photo composition matched export positions and sampled sRGB
interior colors after normalizing the simulator's Display P3 capture. This is one
representative parity check, not complete editor/export or physical-device coverage.
The temporary host was removed. Both components are now wired into the library.
The visible preview has a single accessible composition label; decorative photos
are not announced separately. Empty statuses use semantic Dynamic Type fonts.

## PNG/JPEG renderer core

`CollageRenderer.render(_:)` accepts an explicit project snapshot, resolved layout,
local original-file URLs, editing `compositionSize`, exact output dimensions and
format. It has no store or active-project lookup and can run off the main actor.
The caller must keep originals alive throughout rendering and handle pending,
cancellation, retry and share-file lifetimes when connecting it to the UI.

Geometry is computed at the editing size, including gaps and radius, then the
whole composition scales to the requested dimensions. A mismatched aspect ratio
stretches the composition rather than recropping photos, preserving the web
contract. Cover crops clip before rotation/zoom and destination-slot clipping.
ImageIO applies orientation, including mirroring, while decoding originals one at
a time. Output is encoded in sRGB without copying source metadata. PNG retains
alpha; JPEG flattens onto white, including outside rounded canvas corners.

Tests decode actual PNG/JPEG bytes and independently check asymmetric slot
origins, top/bottom pan, crop-before-rotation, sub-unit zoom, scaled gaps, aspect
stretch, orientation, transparency, rounded corners and retryable failures.
Dimension validation does not establish 40-megapixel reliability on physical
devices; memory testing and editor-to-export comparisons remain outstanding.

## Project facts

| | |
|---|---|
| Project | `ios/CollageMaker.xcodeproj` (hand-authored, folder-synchronized groups) |
| Shared scheme | `CollageMaker`: builds the app and runs both test targets |
| Targets | `CollageMaker` (app), `CollageMakerTests` (unit, Swift Testing, hosted by the app), `CollageMakerUITests` (XCUITest) |
| Platform | iPhone only, iOS 18.0 minimum |
| Language | Swift 6 language mode (complete concurrency checking) |
| Bundle ID | `com.example.CollageMaker` (placeholder) |
| Dependencies | None. Apple frameworks only, no Swift packages |
| Signing | No team or credentials; simulator builds run unsigned |

New Swift files and resources under `CollageMaker/`, `CollageMakerTests/` and
`CollageMakerUITests/` join their target automatically; you don't need to edit the
project file for them. Don't add an `Info.plist` file: the build generates it from
`INFOPLIST_KEY_*` settings.

`CollageMaker/Resources/PrivacyInfo.xcprivacy` declares no tracking, no tracking
domains and no collected data. The unit tests check this in the built app bundle.
When later work uses a required-reason API (for example `UserDefaults` or file
timestamps), add its entry to `NSPrivacyAccessedAPITypes`.

## Requirements

- macOS with Xcode 26 or later and an installed iOS Simulator runtime.
- No Apple Developer Program membership, signing certificate or provisioning profile.

## Build and test from the command line

Run these from the repository root.

Build for any simulator without signing:

```sh
xcodebuild \
  -project ios/CollageMaker.xcodeproj \
  -scheme CollageMaker \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Tests need a specific simulator. List the available iPhone simulators and copy one
UDID:

```sh
xcrun simctl list devices available iPhone
```

The real picker test requires a dedicated simulator with synthetic photos, not
personal media. Add fixtures before the UI tests (this only adds photos and does
not erase anything):

```sh
python3 ios/scripts/seed-simulator-photos.py <SIMULATOR-UDID>
```

The script uses Python's standard library and `simctl`; generated PNG files are
temporary and are not committed. The picker test selects the first two visible
photos through the actual system UI, not injected importer results. It leaves a
saved test collage in the simulator, so repeated runs add projects.

Then run the unit and UI tests, replacing `<SIMULATOR-UDID>`:

```sh
xcodebuild \
  -project ios/CollageMaker.xcodeproj \
  -scheme CollageMaker \
  -destination 'platform=iOS Simulator,id=<SIMULATOR-UDID>' \
  CODE_SIGNING_ALLOWED=NO \
  test
```

Add `-only-testing:CollageMakerTests` or `-only-testing:CollageMakerUITests` to run
one target. The shared test action launches without a debugger so unattended tests
don't require LLDB authorization. Interactive Run in Xcode still supports debugging.
Keep `DerivedData`, `.xcresult` bundles and screenshots out of Git; the local
`.gitignore` covers the usual locations.

## Open in Xcode

Open `ios/CollageMaker.xcodeproj`, choose the `CollageMaker` scheme and an iPhone
simulator, then run. If Xcode asks for a team, leave it unset; simulator runs don't
need one.

## Coverage notes

Simulator runs only cover the simulator runtimes installed on the Mac. They are not
physical-device testing, and they don't prove iOS 18 behaviour unless an iOS 18
runtime is installed and used.

The editor integration was checked on the iOS 26.3 simulator using Xcode 26.3:
the unsigned build and 45 core tests pass. Both existing shell UI tests pass.
The expanded real-picker journey verifies layout selection, asymmetric crop position,
rotation, zoom, swapping, save/relaunch/reopen, reset and Cancel without a functional
assertion failure. A separate read of the persisted manifest confirms the selected
layout, swapped photo IDs and transform. The 105-layout drift check passes.

The complete suite now passes: **45 core tests in eight suites and three UI tests**.
The two normal-size scrolled-editor audits use owner-approved exceptions only on
iOS 26.3 for the current horizontal-position caption and slot-menu StaticText
labels. Both their pre-audit and reported frames must intersect the editor's
navigation bar. Other labels, element types, visible instances, nil-element
issues, other categories and other OS versions are not exempted. Each exception
retains its label and both frames in an xcresult text attachment and the test log.
The final run recorded exactly four exceptions: those two labels in each state.

Contrast runs separately from checks that can temporarily change font sizes;
every audit category still runs. The same journey also asserts that both labels
are fully visible and runs an additional **unfiltered** contrast audit there.
Default editor, largest-text and all other screen audits remain unfiltered.

The disabled Swap button now remains readable instead of fading into its surface,
while retaining its disabled semantics. The journey checks this state before
selecting a swap destination. A non-filtering diagnostic probe confirmed that the
remaining two labels fail while occluded by navigation chrome and pass unchanged
when scrolled fully into view. Another experiment reports a label wholly outside
its scroll viewport. This supports an occlusion-dependent audit problem, not a
confirmed visible text-color defect; the exact XCTest/SwiftUI cause remains
unestablished. The approved exceptions do not assert a known Apple root cause or
justify broad audit exclusions. An independent read-only review reached the same
limited conclusion about the occlusion dependency.

Container, clipping, scroll-edge and full-screen experiments were reverted; the
temporary probe was removed. Beads `collage-ios-editor.2` is verified and closed;
broader editor styling controls remain in the parent task. Final evidence:
`.amp/in/artifacts/native-a11y-scoped-final.xcresult`,
`.amp/in/native-a11y-scoped-final-build.log` and `.amp/in/native-a11y-scoped-final.log`.
The earlier strict failing run remains in `.amp/in/artifacts/native-a11y-final.xcresult`.
Controlled scroll evidence:
`.amp/in/artifacts/native-audit-reversible.xcresult` and its matching log.
Large-text menu/button clipping found during inspection was fixed with flexible,
full-width rows. Save-error UI has not been fault-injected; atomic save failures
remain covered by store tests. Earlier shell runs intermittently failed opening
About at large text; the current run passed that check unchanged.

On this toolchain, command-line system dark
appearance requests were ignored, producing light screenshots even when the API
reported dark. Dark rendering and both accessibility audits were checked separately
with a temporary SwiftUI `.preferredColorScheme(.dark)` override, then that override
was removed. Automatic system appearance switching remains unverified; no forced
appearance or test-only rendering hook is included in the app.

### Style controls verification

Claude implemented the style controls; simulator integration and UI verification
were performed in the coordinator checkout. The final compact sheet replaces
experimental inline swatch grids/rows, which caused excessive scrolling and audit
reports. The native preset menu keeps all ten choices without a long palette grid.
The sheet's Done checkmark follows the existing accessible toolbar-icon pattern.
It edits the same draft; opening a saved custom color does not rewrite its channels.

The unsigned simulator build, **50 core tests in nine suites and all three retained
UI tests pass together** on iPhone 17 Pro/iOS 26.3. The real-picker journey now also
adjusts spacing and radius, selects Lavender, opens/dismisses the system color
picker without changing it, changes real picker opacity to a custom translucent
background, saves/relaunches/reopens, and verifies settings and existing photo
transforms. A discarded black/zero-gap/max-radius draft leaves the saved settings
unchanged. Transparent background persists into the largest-text relaunch.

Default, preset, transparent and largest-text style audits are unfiltered. The
existing four photo-control occlusion exceptions retain their original scope.
Gestures position sliders fully onscreen and stop scrolling when the preview
reaches the top; fixed repeated downward swipes could dismiss the editor sheet.
Largest-text photo controls are checked for reachability and captured, then the
editor is audited in its stable top viewport. The style sheet is audited separately.

A temporary medium-detent presentation check also passed; it was removed after
capturing and inspecting the result. All style controls fit in that default-size
sheet. The parent may show photo controls, not the preview, behind the sheet;
Done returns to the updated preview without saving. Expanded/default, custom,
transparent and largest-text captures were inspected. Large text uses scrolling
and wrapping rather than shrinking text to fit. No scratch UI route remains.

Final evidence: `.amp/in/artifacts/native-style-bounded.xcresult`,
`.amp/in/native-style-bounded.log` and `.amp/in/native-style-bounded-build.log`.
The post-probe-removal build is `.amp/in/native-style-clean-build.log`.
Beads `collage-ios-editor.3` is verified and closed; broader milestone work,
including export/share UI, remains open. Hardware, iOS18 runtime, automatic dark
switching and device-memory limits remain unverified. Unsaved editor drafts still
follow the existing swipe-dismiss/discard behavior; dirty-draft confirmation has
not been added as part of styling.
