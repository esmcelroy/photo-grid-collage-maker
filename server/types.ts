/**
 * Serializable API types shared between server routes and (eventually) the frontend
 * API client. These are distinct from the browser-side types in src/lib/types.ts
 * because they cannot contain non-serializable fields like the browser File object.
 */

export interface ApiPhoto {
  id: string
  fileName: string
  dataUrl: string
}

export interface CollageState {
  id: string
  photos: ApiPhoto[]
  selectedLayoutId: string | null
  photoPositions: Array<{ photoId: string; gridArea: string }>
  settings: {
    gap: number
    backgroundColor: string
    borderRadius: number
  }
}
