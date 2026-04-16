/**
 * HEIC/HEIF image detection and conversion utilities.
 * Uses libheif-js (WASM) for client-side decoding.
 */

const HEIC_EXTENSIONS = ['.heic', '.heif']
const HEIC_MIME_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']

/**
 * Detect if a file is HEIC/HEIF by MIME type, extension, or magic bytes.
 */
export async function isHeicFile(file: File): Promise<boolean> {
  // Check MIME type (may be empty on some browsers)
  if (HEIC_MIME_TYPES.includes(file.type.toLowerCase())) {
    return true
  }

  // Check file extension
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (HEIC_EXTENSIONS.includes(ext)) {
    return true
  }

  // Check magic bytes: ftyp box at offset 4, with HEIC/HEIF brand
  try {
    const slice = file.slice(0, 12)
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = reject
      reader.readAsArrayBuffer(slice)
    })
    const header = new Uint8Array(buffer)
    if (header.length >= 12) {
      const ftyp = String.fromCharCode(header[4], header[5], header[6], header[7])
      if (ftyp === 'ftyp') {
        const brand = String.fromCharCode(header[8], header[9], header[10], header[11])
        if (['heic', 'heix', 'mif1', 'heif'].includes(brand)) {
          return true
        }
      }
    }
  } catch {
    // Can't read file — fall through
  }

  return false
}

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

let libheifInstance: LibHeif | null = null

async function getLibHeif(): Promise<LibHeif> {
  if (libheifInstance) return libheifInstance
  const module = await import('libheif-js')
  libheifInstance = module.default || module
  return libheifInstance!
}

/**
 * Convert a HEIC/HEIF file to JPEG using libheif-js WASM decoder.
 * Returns a new File with .jpg extension.
 */
export async function convertHeicToJpeg(file: File, quality = 0.92): Promise<File> {
  const libheif = await getLibHeif()
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
  const data = new Uint8Array(buffer)

  const decoder = new libheif.HeifDecoder()
  const images = decoder.decode(data)

  if (!images || images.length === 0) {
    throw new Error(`Failed to decode HEIC file: ${file.name}`)
  }

  const image = images[0]
  const width = image.get_width()
  const height = image.get_height()

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas context')

  const imageData = ctx.createImageData(width, height)

  await new Promise<void>((resolve, reject) => {
    try {
      image.display(imageData, (displayData: ImageData) => {
        if (!displayData) {
          reject(new Error(`Failed to render HEIC image: ${file.name}`))
          return
        }
        ctx.putImageData(displayData, 0, 0)
        resolve()
      })
    } catch (err) {
      reject(err)
    }
  })

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
      'image/jpeg',
      quality
    )
  })

  const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg')
  return new File([blob], newName, { type: 'image/jpeg' })
}

/**
 * Process an array of files, converting any HEIC/HEIF files to JPEG.
 * Returns the processed files in the same order.
 * Calls onProgress for each file processed.
 */
export async function processFilesForHeic(
  files: File[],
  onProgress?: (processed: number, total: number, fileName: string) => void
): Promise<{ converted: File[]; errors: Array<{ fileName: string; error: string }> }> {
  const heicCount = await Promise.all(files.map(isHeicFile))
  const totalHeic = heicCount.filter(Boolean).length

  if (totalHeic === 0) {
    return { converted: files, errors: [] }
  }

  const converted: File[] = []
  const errors: Array<{ fileName: string; error: string }> = []
  let processedCount = 0

  // Process up to 3 HEIC files concurrently
  const concurrency = 3
  const queue = files.map((file, i) => ({ file, isHeic: heicCount[i], index: i }))
  const results = new Array<File>(files.length)

  const processItem = async (item: typeof queue[0]) => {
    if (!item.isHeic) {
      results[item.index] = item.file
      return
    }

    try {
      processedCount++
      onProgress?.(processedCount, totalHeic, item.file.name)
      results[item.index] = await convertHeicToJpeg(item.file)
    } catch (err) {
      errors.push({
        fileName: item.file.name,
        error: err instanceof Error ? err.message : 'Unknown conversion error',
      })
      // Still include the original file — it won't display but won't block others
      results[item.index] = item.file
    }
  }

  // Process in batches of `concurrency`
  for (let i = 0; i < queue.length; i += concurrency) {
    const batch = queue.slice(i, i + concurrency)
    await Promise.all(batch.map(processItem))
  }

  return { converted: results.filter(Boolean), errors }
}
