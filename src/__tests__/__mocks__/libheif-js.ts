// Manual mock for libheif-js WASM module
const libheif = {
  HeifDecoder: class MockDecoder {
    decode(data: Uint8Array) {
      if (data.length === 0) return []
      return [{
        get_width: () => 100,
        get_height: () => 100,
        display: (imageData: ImageData, callback: (result: ImageData) => void) => {
          // Fill the provided ImageData with opaque white pixels
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = 255     // R
            imageData.data[i + 1] = 255 // G
            imageData.data[i + 2] = 255 // B
            imageData.data[i + 3] = 255 // A
          }
          callback(imageData)
        },
      }]
    }
  },
}

export default libheif
