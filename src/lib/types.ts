export interface UploadedPhoto {
  id: string
  file: File
  dataUrl: string
}

export interface PhotoPosition {
  photoId: string
  gridArea: string
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
