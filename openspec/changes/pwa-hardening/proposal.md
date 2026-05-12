## Why

The app already has basic PWA support via vite-plugin-pwa — a manifest, service worker, and SVG icons — but falls short of a polished installable experience. Key gaps:

1. **SVG-only icons** — iOS ignores SVG for home screen icons, and many Android launchers render them poorly or not at all. No apple-touch-icon is set.
2. **No theme-color or iOS meta tags** — the browser chrome doesn't match the app's purple brand, and iOS standalone mode isn't configured.
3. **Silent updates** — the `autoUpdate` registration silently replaces the service worker. Users don't know new features landed and may see stale content until all tabs close.
4. **No offline awareness** — the app works fully offline (all client-side + IndexedDB), but users have no idea. No status indicator when connectivity drops or restores.
5. **No install prompt** — there's no in-app UI to install. Users must discover browser-native "Add to Home Screen" on their own.

This is a pure UX polish pass. No new features, no new data, no API changes.

## What Changes

- Generate a full PNG icon set (48–512px) from the existing SVG, commit to `public/`
- Add theme-color, apple-touch-icon, and iOS standalone meta tags to `index.html`
- Switch service worker registration from `autoUpdate` to `prompt` mode with a "New version available — Refresh" toast
- Add online/offline detection with a subtle status indicator and "Ready for offline use" toast on first SW install
- Add a persistent "Install App" button in the header that uses the `beforeinstallprompt` API (Chrome/Edge) with a graceful fallback for Safari

## Capabilities

### New Capabilities
- **PNG icon set**: Rasterized icons at 48, 72, 96, 128, 144, 192, 384, 512px for universal device support
- **iOS standalone support**: apple-mobile-web-app-capable, apple-touch-icon, status-bar-style meta tags
- **Update toast**: Prompt-based SW registration with visible "Update available" notification and one-click refresh
- **Offline indicator**: Real-time online/offline detection with non-intrusive banner when offline, auto-dismiss on reconnect
- **"Ready for offline" toast**: One-time notification when the service worker finishes caching all assets
- **Install button**: Permanent header button that triggers native install prompt or shows platform-specific instructions

### Modified Capabilities
- **Service worker registration**: Changes from `autoUpdate` to `prompt` mode, giving users control over when updates activate
- **Manifest icons**: Adds PNG entries alongside existing SVG entries for broader device compatibility
