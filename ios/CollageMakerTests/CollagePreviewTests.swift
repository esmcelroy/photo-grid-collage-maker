import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import CollageMaker

struct CollagePreviewTests {
    private let photoID = UUID(uuidString: "00000000-0000-0000-0000-0000000000A1")!

    @Test func emptyProjectIsEmptyBeforeLayoutValidation() throws {
        let layout = try singleLayout()
        var project = project(photo: nil, layout: layout)
        project.selectedLayoutID = nil
        project.positions = []
        let request = CollagePreviewRequest(
            project: project,
            layout: layout,
            originalURLs: [:],
            compositionSize: CGSize(width: 400, height: 300)
        )
        #expect(CollagePreviewLoader.phase(for: request) == .empty)
    }

    @Test func missingAndRemoteOriginalsDoNotReadAsReady() throws {
        let layout = try singleLayout()
        let project = project(photo: photoID, layout: layout)
        let missing = CollagePreviewRequest(
            project: project,
            layout: layout,
            originalURLs: [:],
            compositionSize: CGSize(width: 200, height: 100)
        )
        #expect(CollagePreviewLoader.phase(for: missing) == .missingPhoto(photoID))

        var remote = missing
        remote.originalURLs = [photoID: URL(string: "https://example.com/photo.jpg")!]
        #expect(CollagePreviewLoader.phase(for: remote) == .invalid("Originals must be local file URLs."))

        var oversized = missing
        oversized.maximumPixelSize = CollagePreviewRequest.maximumAllowedPixelSize + 1
        #expect(CollagePreviewLoader.phase(for: oversized) == .invalid("Preview size must be finite and positive."))
    }

    @Test func downsampleAppliesOrientationAndBoundsTheLongestSide() throws {
        let store = PreviewFixtureStore()
        let wide = try store.writePNG(width: 80, height: 20) { x, _ in
            x < 40 ? rgba(255, 0, 0, 255) : rgba(0, 0, 255, 255)
        }
        let turned = try store.writeJPEG(copying: wide, orientation: 6)
        let image = try CollagePreviewLoader.downsample(at: turned, maximumPixelSize: 40)
        #expect(max(image.width, image.height) <= 40)
        #expect(image.height > image.width)

        #expect(throws: CollagePreviewError.self) {
            try CollagePreviewLoader.downsample(at: turned, maximumPixelSize: 0)
        }
        #expect(throws: CollagePreviewError.self) {
            try CollagePreviewLoader.downsample(at: turned, maximumPixelSize: 1601)
        }
    }

    private func singleLayout() throws -> GridLayout {
        try GridLayout(
            id: "preview-single",
            name: "Single",
            photoCount: 1,
            rows: [1],
            columns: [1],
            areas: [["a"]],
            aspectRatio: 1,
            platforms: []
        )
    }

    private func project(photo: UUID?, layout: GridLayout) -> CollageProject {
        var value = CollageProject(
            id: UUID(uuidString: "10000000-0000-0000-0000-0000000000AA")!,
            name: "Preview",
            createdAt: Date(timeIntervalSince1970: 1),
            updatedAt: Date(timeIntervalSince1970: 2)
        )
        guard let photo else { return value }
        value.photos = [ProjectPhoto(id: photo, imageFilename: "one.png", pixelWidth: 80, pixelHeight: 20)]
        value.selectedLayoutID = layout.id
        value.positions = [PhotoPosition(photoID: photo, area: "a")]
        return value
    }
}

private final class PreviewFixtureStore {
    let directory: URL

    init() {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("collage-preview-\(UUID().uuidString)", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    func writePNG(width: Int, height: Int, pixel: (Int, Int) -> RGBA) throws -> URL {
        let url = directory.appendingPathComponent(UUID().uuidString).appendingPathExtension("png")
        try write(bytes: bytes(width: width, height: height, pixel: pixel), width: width, height: height, type: .png, to: url, orientation: nil)
        return url
    }

    func writeJPEG(copying png: URL, orientation: UInt32) throws -> URL {
        guard let source = CGImageSourceCreateWithURL(png as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            throw CollagePreviewError.unreadableOriginal
        }
        var samples: [UInt8] = []
        guard let data = image.dataProvider?.data, let pointer = CFDataGetBytePtr(data) else {
            throw CollagePreviewError.unreadableOriginal
        }
        for y in 0..<image.height {
            for x in 0..<image.width {
                let offset = y * image.bytesPerRow + x * 4
                samples.append(contentsOf: [pointer[offset], pointer[offset + 1], pointer[offset + 2], 255])
            }
        }
        let url = directory.appendingPathComponent(UUID().uuidString).appendingPathExtension("jpg")
        try write(bytes: samples, width: image.width, height: image.height, type: .jpeg, to: url, orientation: orientation)
        return url
    }

    private func write(bytes: [UInt8], width: Int, height: Int, type: UTType, to url: URL, orientation: UInt32?) throws {
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let provider = CGDataProvider(data: Data(bytes) as CFData),
              let image = CGImage(
                width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
                space: space, bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent
              ),
              let destination = CGImageDestinationCreateWithURL(url as CFURL, type.identifier as CFString, 1, nil) else {
            throw CollagePreviewError.unreadableOriginal
        }
        var properties: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: 1]
        if let orientation {
            properties[kCGImagePropertyOrientation] = orientation
        }
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        guard CGImageDestinationFinalize(destination) else {
            throw CollagePreviewError.unreadableOriginal
        }
    }

    private func bytes(width: Int, height: Int, pixel: (Int, Int) -> RGBA) -> [UInt8] {
        var bytes: [UInt8] = []
        for y in 0..<height {
            for x in 0..<width {
                let sample = pixel(x, y)
                bytes.append(contentsOf: [sample.red, sample.green, sample.blue, sample.alpha])
            }
        }
        return bytes
    }

    deinit {
        try? FileManager.default.removeItem(at: directory)
    }
}

private struct RGBA {
    var red: UInt8
    var green: UInt8
    var blue: UInt8
    var alpha: UInt8
}

private func rgba(_ red: UInt8, _ green: UInt8, _ blue: UInt8, _ alpha: UInt8) -> RGBA {
    RGBA(red: red, green: green, blue: blue, alpha: alpha)
}
