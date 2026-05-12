/// <reference types="vite/client" />
declare const GITHUB_RUNTIME_PERMANENT_NAME: string
declare const BASE_KV_SERVICE_URL: string

declare module 'virtual:pwa-register/react' {
  export function useRegisterSW(options?: {
    immediate?: boolean
    onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void
    onRegisterError?: (error: Error) => void
    onOfflineReady?: () => void
    onNeedRefresh?: () => void
  }): {
    needRefresh: [boolean, (val: boolean) => void]
    offlineReady: [boolean, (val: boolean) => void]
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>
  }
}

declare module 'libheif-js' {
  interface HeifImage {
    get_width(): number
    get_height(): number
    display(imageData: ImageData, callback: (result: ImageData) => void): void
  }

  interface HeifDecoder {
    decode(data: Uint8Array): HeifImage[]
  }

  interface LibHeif {
    HeifDecoder: new () => HeifDecoder
  }

  const libheif: LibHeif
  export default libheif
}