interface FaceDetectorOptions {
  maxDetectedFaces?: number
  fastMode?: boolean
}

interface DetectedFace {
  boundingBox: DOMRectReadOnly
  landmarks?: Array<{ locations: DOMPointReadOnly[], type: string }>
}

declare class FaceDetector {
  constructor(options?: FaceDetectorOptions)
  detect(image: ImageBitmapSource): Promise<DetectedFace[]>
}
