# Native iOS app

## Approved product scope

- Swift and SwiftUI, iPhone first, iOS 18 minimum. Start with the simulator; do not require paid Apple Developer Program membership or signing credentials.
- First milestone: native PhotosPicker import of 1–16 images, count-aware layouts, photo crop/rotation/zoom and swapping, gap/background/radius, local saved projects, and exact-size PNG/JPEG export through the native share sheet.
- Use an iOS-native interface with the web app's plum/violet identity as the initial direction, not a pixel-for-pixel web port. Support VoiceOver, Dynamic Type, accessible touch targets, and alternatives to gestures.
- Everything stays on-device. No backend, account, analytics, photo uploads, or iCloud sync. Simulator testing uses synthetic or repository-owned fixtures, not private photos.
- Personal use first. Possible later public distribution would be free with optional goodwill tips; no payment implementation or membership purchase is authorized now.
- Collager is only a provisional name; an existing App Store collage app uses it. Naming must not block simulator work. Do not claim trademark or App Store availability.

## Implementation boundaries

- Keep native code under `ios/` and preserve the web app. Use the web implementation as a behavioral specification, not a runtime dependency or web view.
- Prefer versioned JSON project manifests and original image files in Application Support, with atomic saves and project-bound async operations. Persist durable copies of picker files, not transient provider URLs. Confirm backup policy before making a broad promise that system device backups cannot contain projects.
- Use the same layout/crop geometry for preview and export. Generate portable layout data from `src/lib/layouts.ts` rather than manually maintaining a divergent catalog. Inspect `src/components/CollagePreview.tsx` and `PhotoEditDialog.tsx` for existing transforms and swap semantics; do not silently change them while porting.
- Keep preview image decoding off the main actor and downsample/cache thumbnails without silently lowering export resolution. Avoid decoding all full-size originals at once during export.
- Preserve export validation from `src/lib/export-dimensions.ts`: positive whole-pixel dimensions, at most 8192 per side and 40 megapixels total. PNG preserves transparency; JPEG composites on white. Keep pending guards and retryable failures. Strip photo metadata from rendered output.
- Do not promise 40-megapixel export reliability without device-memory testing; the uncompressed output canvas alone is about 160 MB.
- Defer smart positioning, suggestions/comparison, undo/redo, web-backup interoperability, iPad-specific layouts, cloud sync and public distribution beyond the first milestone.

## Work and verification

- Track dependencies and acceptance criteria in Beads (`collage-ios` epic); do not create a second Markdown task list. Parent/coordinator owns backlog writes when agents run concurrently.
- Delegate independent work to Claude/Grok subscription-backed threads when useful. Agree on contracts before parallel implementation; separate file ownership or worktrees, and transfer exact unpushed work when integrating across checkouts.
- Native implementation needs an unsigned simulator build, targeted model/geometry/storage/rendering tests, and an end-to-end import/edit/save/relaunch/export journey. Verify actual picker behavior, not only injected images.
- Decode real PNG/JPEG exports to check exact dimensions, alpha/background, and asymmetric crop/rotation/layout fidelity. Use independent expected geometry rather than deriving test expectations from production helpers.
- Inspect simulator screenshots for affected visual states, and exercise accessibility. Keep screenshots, simulator state, build output and photo fixtures containing user content out of Git. Report simulator versus physical-device and OS coverage honestly.
- Native tooling must not bypass or accidentally gate the existing web Pages deployment. Changes to shared web code still require the applicable web checks in the root instructions.
