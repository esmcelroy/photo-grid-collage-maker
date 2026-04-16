export interface UploadedPhoto {
  id: string
  file: File
  dataUrl: string
}

export interface PhotoPosition {
  photoId: string
  gridArea: string
  objectPosition?: string // CSS object-position, e.g. '30% 60%'
  rotation?: number       // degrees (0, 90, 180, 270 for steps; -45 to 45 for fine)
  scale?: number          // 1.0 = fit, >1.0 = zoomed in
}

export interface GridLayout {
  id: string
  name: string
  photoCount: number
  gridTemplate: string
  areas: string[]
  aspectRatio?: string
}

export interface CollageSettings {
  gap: number
  backgroundColor: string
  borderRadius: number
}

export type ExportFormat = 'png' | 'jpeg'

export interface ExportOptions {
  format: ExportFormat
  quality: number // 0.0–1.0, only used for JPEG
  filename: string
}

export interface CollageState {
  photos: UploadedPhoto[]
  selectedLayoutId: string | null
  photoPositions: PhotoPosition[]
  settings: CollageSettings
}
