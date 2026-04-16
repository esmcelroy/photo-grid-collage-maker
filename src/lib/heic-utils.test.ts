import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { isHeicFile, convertHeicToJpeg, processFilesForHeic } from '@/lib/heic-utils'

function createHeicFile(name = 'photo.heic', type = 'image/heic'): File {
  // Create a file with HEIC magic bytes: offset 4 = "ftyp", offset 8 = "heic"
  const header = new Uint8Array(12)
  header.set([0, 0, 0, 24], 0) // box size
  header.set([102, 116, 121, 112], 4) // "ftyp"
  header.set([104, 101, 105, 99], 8) // "heic"
  return new File([header], name, { type })
}

describe('isHeicFile', () => {
  it('detects HEIC by MIME type', async () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/heic' })
    expect(await isHeicFile(file)).toBe(true)
  })

  it('detects HEIF by MIME type', async () => {
    const file = new File(['data'], 'photo.jpg', { type: 'image/heif' })
    expect(await isHeicFile(file)).toBe(true)
  })

  it('detects HEIC by file extension', async () => {
    const file = new File(['data'], 'IMG_1234.HEIC', { type: '' })
    expect(await isHeicFile(file)).toBe(true)
  })

  it('detects HEIF by file extension', async () => {
    const file = new File(['data'], 'photo.heif', { type: '' })
    expect(await isHeicFile(file)).toBe(true)
  })

  it('detects HEIC by magic bytes', async () => {
    const file = createHeicFile('unknown.dat', '')
    expect(await isHeicFile(file)).toBe(true)
  })

  it('returns false for JPEG files', async () => {
    const file = new File(['jpeg-data'], 'photo.jpg', { type: 'image/jpeg' })
    expect(await isHeicFile(file)).toBe(false)
  })

  it('returns false for PNG files', async () => {
    const file = new File(['png-data'], 'photo.png', { type: 'image/png' })
    expect(await isHeicFile(file)).toBe(false)
  })
})

describe('convertHeicToJpeg', () => {
  beforeEach(() => {
    // Mock canvas APIs since jsdom doesn't have canvas support
    const mockCtx = {
      createImageData: (w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
        colorSpace: 'srgb' as PredefinedColorSpace,
      }),
      putImageData: jest.fn(),
    }
    HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue(mockCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.toBlob = function (
      callback: BlobCallback,
      type?: string,
    ) {
      callback(new Blob(['jpeg-data'], { type: type || 'image/jpeg' }))
    }
  })

  it('returns a File with .jpg extension', async () => {
    const heicFile = createHeicFile('vacation.heic')
    const result = await convertHeicToJpeg(heicFile)

    expect(result).toBeInstanceOf(File)
    expect(result.name).toBe('vacation.jpg')
    expect(result.type).toBe('image/jpeg')
  })

  it('converts .HEIF extension to .jpg', async () => {
    const heicFile = createHeicFile('photo.HEIF', 'image/heif')
    const result = await convertHeicToJpeg(heicFile)
    expect(result.name).toBe('photo.jpg')
  })
})

describe('processFilesForHeic', () => {
  beforeEach(() => {
    const mockCtx = {
      createImageData: (w: number, h: number) => ({
        data: new Uint8ClampedArray(w * h * 4),
        width: w,
        height: h,
        colorSpace: 'srgb' as PredefinedColorSpace,
      }),
      putImageData: jest.fn(),
    }
    HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue(mockCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.toBlob = function (
      callback: BlobCallback,
      type?: string,
    ) {
      callback(new Blob(['jpeg-data'], { type: type || 'image/jpeg' }))
    }
  })

  it('passes through non-HEIC files unchanged', async () => {
    const jpg = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
    const png = new File(['data'], 'photo.png', { type: 'image/png' })
    const { converted, errors } = await processFilesForHeic([jpg, png])

    expect(converted).toHaveLength(2)
    expect(converted[0]).toBe(jpg)
    expect(converted[1]).toBe(png)
    expect(errors).toHaveLength(0)
  })

  it('converts HEIC files in a mixed batch', async () => {
    const jpg = new File(['data'], 'photo.jpg', { type: 'image/jpeg' })
    const heic = createHeicFile('iphone.heic')
    const { converted, errors } = await processFilesForHeic([jpg, heic])

    expect(converted).toHaveLength(2)
    expect(converted[0]).toBe(jpg) // unchanged
    expect(converted[1].name).toBe('iphone.jpg') // converted
    expect(errors).toHaveLength(0)
  })

  it('calls onProgress for each HEIC file', async () => {
    const heic1 = createHeicFile('a.heic')
    const heic2 = createHeicFile('b.heic')
    const progress = jest.fn()

    await processFilesForHeic([heic1, heic2], progress)

    expect(progress).toHaveBeenCalledTimes(2)
    expect(progress).toHaveBeenCalledWith(1, 2, 'a.heic')
    expect(progress).toHaveBeenCalledWith(2, 2, 'b.heic')
  })
})
