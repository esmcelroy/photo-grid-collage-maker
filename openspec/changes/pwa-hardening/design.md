## Architecture

No new external dependencies. All PWA features use browser-native APIs and vite-plugin-pwa's built-in virtual modules.

```
┌─────────────────────────────────────────────────────────┐
│                    Build Pipeline                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  public/icons/        vite.config.ts                    │
│  ├─ icon-48x48.png    ├─ VitePWA plugin                │
│  ├─ icon-72x72.png    │  registerType: 'prompt'        │
│  ├─ ...               │  manifest.icons → PNGs + SVGs  │
│  └─ icon-512x512.png  └─ workbox config (unchanged)    │
│                                                         │
│  index.html                                             │
│  ├─ <meta name="theme-color" content="#6b21a8">        │
│  ├─ <link rel="apple-touch-icon" ...>                  │
│  └─ <meta name="apple-mobile-web-app-capable" ...>    │
│                                                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   Runtime Components                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  src/hooks/                                             │
│  ├─ usePwaInstall.ts    → beforeinstallprompt capture   │
│  ├─ useServiceWorker.ts → SW update detection + toast   │
│  └─ useOnlineStatus.ts  → navigator.onLine + events    │
│                                                         │
│  src/components/                                        │
│  ├─ InstallButton.tsx   → Header install button         │
│  ├─ UpdateToast.tsx     → "New version" notification    │
│  └─ OfflineBanner.tsx   → "You're offline" indicator    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Design Decisions

### 1. Icon Strategy: Pre-committed PNGs

Generate PNGs once with a Node.js script using `sharp`, commit them to `public/icons/`. No build-time dependency on sharp.

Sizes: 48, 72, 96, 128, 144, 192, 384, 512 — covers Android adaptive icons, iOS home screen, and Windows tiles. Keep existing SVGs as fallback entries in the manifest.

### 2. SW Registration: Prompt Mode

Switch `registerType` from `'autoUpdate'` to `'prompt'`. Use `virtual:pwa-register/react` for the React hook that provides:
- `needRefresh` — boolean, true when a new SW is waiting
- `updateServiceWorker()` — activates the waiting SW and reloads

The `UpdateToast` component renders only when `needRefresh` is true.

### 3. Install Button: Persistent in Header

Capture the `beforeinstallprompt` event at the app level. Store the deferred prompt in a React ref. The `InstallButton` renders in the header only when:
- The deferred prompt exists (Chrome/Edge), OR
- The app is on iOS Safari and not already in standalone mode

On click: call `deferredPrompt.prompt()` on Chrome/Edge; on iOS, show a tooltip with manual instructions ("Tap Share → Add to Home Screen").

Hide the button when the app is already running in standalone mode (`window.matchMedia('(display-mode: standalone)').matches`).

### 4. Offline Indicator: Subtle Banner

Use `navigator.onLine` + `online`/`offline` events. Show a slim fixed banner at the top of the viewport:
- Offline: "You're offline — everything still works" (amber background)
- Back online: banner auto-dismisses with a fade

The "Ready for offline use" toast fires once (tracked via localStorage) after the SW's `controlling` event, indicating all assets are cached.

### 5. Meta Tags

Add to `index.html`:
```html
<meta name="theme-color" content="#6b21a8">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="apple-touch-icon" href="/icons/icon-192x192.png">
```

## Component Details

### usePwaInstall Hook
```
Input:  none
Output: { canInstall: boolean, triggerInstall: () => Promise<void>, isIos: boolean }

- Listens for 'beforeinstallprompt' on window
- Stores deferred event in ref
- canInstall = true when deferred event exists AND not in standalone mode
- isIos = true when iOS Safari AND not standalone (show manual instructions)
- triggerInstall() calls deferredPrompt.prompt() and awaits user choice
- Listens for 'appinstalled' to hide the button
```

### useServiceWorker Hook
```
Input:  none
Output: { needRefresh: boolean, updateSw: () => void }

- Wraps virtual:pwa-register/react useRegisterSW
- needRefresh from the registration callbacks
- updateSw calls updateServiceWorker(true) to skip waiting and reload
```

### useOnlineStatus Hook
```
Input:  none
Output: { isOnline: boolean }

- navigator.onLine initial value
- Listens for 'online' and 'offline' window events
- Cleans up listeners on unmount
```

### InstallButton Component
- Renders a download/install icon + "Install" text
- Hidden when already installed or when browser doesn't support install
- On iOS: shows a popover with manual instructions
- Styled to match existing header buttons

### UpdateToast Component
- Fixed position bottom-right
- "A new version is available" + [Refresh] button + [Dismiss] button
- Dismiss hides until next update cycle
- Refresh calls updateSw()

### OfflineBanner Component
- Fixed position top, full width, slim height
- Amber background with "You're offline" message
- Auto-dismisses when back online
- "Ready for offline use" variant shows once after SW install (green, auto-dismiss after 4s)
