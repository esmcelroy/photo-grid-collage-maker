## Tasks

### Task 1: Generate PNG icon set
Generate PNG icons at 48, 72, 96, 128, 144, 192, 384, 512px from the existing `public/pwa-512x512.svg` using a one-time Node.js script with `sharp`. Commit generated PNGs to `public/icons/`. Update the manifest `icons` array in `vite.config.ts` to include both PNG and SVG entries.

**Files:** `scripts/generate-icons.js` (new, disposable), `public/icons/*.png` (new), `vite.config.ts`

### Task 2: Add PWA meta tags to index.html
Add theme-color, apple-touch-icon, apple-mobile-web-app-capable, and apple-mobile-web-app-status-bar-style meta tags to `index.html`. Reference the 192px PNG icon for apple-touch-icon.

**Files:** `index.html`

### Task 3: Create useOnlineStatus hook
Implement a React hook that tracks `navigator.onLine` state and listens for `online`/`offline` window events. Include unit tests.

**Files:** `src/hooks/useOnlineStatus.ts` (new), `src/hooks/useOnlineStatus.test.ts` (new)

### Task 4: Create OfflineBanner component
Implement a slim fixed banner that shows when offline ("You're offline — everything still works") and auto-dismisses when back online. Include a one-time "Ready for offline use" toast after SW install (tracked via localStorage). Include unit tests.

**Files:** `src/components/OfflineBanner.tsx` (new), `src/components/OfflineBanner.test.tsx` (new)

### Task 5: Switch SW registration to prompt mode
Change `registerType` from `'autoUpdate'` to `'prompt'` in `vite.config.ts`. Create `useServiceWorker` hook wrapping `virtual:pwa-register/react`'s `useRegisterSW`. Expose `needRefresh` and `updateSw`. Include unit tests.

**Files:** `vite.config.ts`, `src/hooks/useServiceWorker.ts` (new), `src/hooks/useServiceWorker.test.ts` (new)

### Task 6: Create UpdateToast component
Implement a fixed bottom-right toast that appears when `needRefresh` is true. Shows "A new version is available" with [Refresh] and [Dismiss] buttons. Refresh calls `updateSw()`. Include unit tests.

**Files:** `src/components/UpdateToast.tsx` (new), `src/components/UpdateToast.test.tsx` (new)

### Task 7: Create usePwaInstall hook
Implement a hook that captures the `beforeinstallprompt` event, provides `canInstall`, `triggerInstall()`, and `isIos` for fallback instructions. Listen for `appinstalled` to hide the button. Include unit tests.

**Files:** `src/hooks/usePwaInstall.ts` (new), `src/hooks/usePwaInstall.test.ts` (new)

### Task 8: Create InstallButton component
Implement a header button that shows "Install" when the app is installable. On Chrome/Edge, triggers the native install prompt. On iOS Safari, shows a popover with manual instructions. Hidden when already in standalone mode. Include unit tests.

**Files:** `src/components/InstallButton.tsx` (new), `src/components/InstallButton.test.tsx` (new)

### Task 9: Integrate PWA components into App
Wire OfflineBanner, UpdateToast, and InstallButton into the main App layout. InstallButton goes in the header. OfflineBanner renders at the top of the viewport. UpdateToast renders at the bottom-right. Verify all components render correctly together.

**Files:** `src/App.tsx`
