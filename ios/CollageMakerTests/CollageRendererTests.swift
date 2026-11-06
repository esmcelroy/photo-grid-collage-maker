import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import CollageMaker

struct CollageRendererTests {
    private let firstID = UUID(uuidString: "00000000-0000-0000-0000-00000000000A")!
    private let secondID = UUID(uuidString: "00000000-0000-0000-0000-00000000000B")!
    private let thirdID = UUID(uuidString: "00000000-0000-0000-0000-00000000000C")!

    @Test func zoomBelowOneLeavesTransparentCornersAndJpegFillsThemWhite() throws {
        let fixture = try FixtureStore()
        let photo = try fixture.writePNG(width: 40, height: 40) { _, _ in rgba(220, 10, 10, 255) }
        let request = try singlePhotoRequest(
            fixture: photo,
            photoID: firstID,
            settings: CollageSettings(gap: 0, background: .transparent, borderRadius: 0),
            composition: CGSize(width: 40, height: 40),
            dimensions: ExportDimensions(width: 40, height: 40),
            transform: PhotoTransform(scale: 0.5)
        )

        let png = try decode(CollageRenderer.render(formatted(request, .png)))
        #expect(png.format == UTType.png.identifier)
        #expect(png.width == 40 && png.height == 40)
        #expect(png.pixel(0, 0).alpha == 0)
        #expect(png.pixel(20, 20) == rgba(220, 10, 10, 255))

        let jpeg = try decode(CollageRenderer.render(formatted(request, .jpeg, quality: 1)))
        #expect(jpeg.format == UTType.jpeg.identifier)
        #expect(jpeg.pixel(0, 0).isNear(rgba(255, 255, 255, 255), tolerance: 8))
        #expect(jpeg.pixel(20, 20).isNear(rgba(220, 10, 10, 255), tolerance: 12))
    }

    @Test func opaqueGapScalesWithTheComposition() throws {
        let fixture = try FixtureStore()
        let photo = try fixture.writePNG(width: 20, height: 20) { _, _ in rgba(255, 0, 0, 255) }
        let settings = CollageSettings(
            gap: 12,
            background: .color(RGBAColor(red: 0, green: 0, blue: 1, alpha: 1)),
            borderRadius: 0
        )
        let preview = try singlePhotoRequest(
            fixture: photo,
            photoID: firstID,
            settings: settings,
            composition: CGSize(width: 400, height: 300),
            dimensions: ExportDimensions(width: 400, height: 300)
        )
        let exported = try singlePhotoRequest(
            fixture: photo,
            photoID: firstID,
            settings: settings,
            composition: CGSize(width: 400, height: 300),
            dimensions: ExportDimensions(width: 1200, height: 900)
        )

        let small = try decode(CollageRenderer.render(formatted(preview, .png)))
        let large = try decode(CollageRenderer.render(formatted(exported, .png)))
        #expect(small.width == 400 && small.height == 300)
        #expect(large.width == 1200 && large.height == 900)
        #expect(small.pixel(11, 11) == rgba(0, 0, 255, 255))
        #expect(small.pixel(12, 12) == rgba(255, 0, 0, 255))
        #expect(large.pixel(35, 35) == rgba(0, 0, 255, 255))
        #expect(large.pixel(36, 36) == rgba(255, 0, 0, 255))
    }

    @Test func mismatchedExportStretchesWithoutRecroppingTheCover() throws {
        let fixture = try FixtureStore()
        // Composition cover sees source x 0...26⅔, so its right edge is green.
        // Recropping directly to the square output would see only x 0...20 (red).
        let photo = try fixture.writePNG(width: 80, height: 20) { x, _ in
            x < 20 ? rgba(255, 0, 0, 255) : rgba(0, 255, 0, 255)
        }
        let request = try singlePhotoRequest(
            fixture: photo,
            photoID: firstID,
            settings: CollageSettings(gap: 0, background: .transparent),
            composition: CGSize(width: 400, height: 300),
            dimensions: ExportDimensions(width: 800, height: 800),
            transform: PhotoTransform(positionX: 0, positionY: 0.5)
        )

        let image = try decode(CollageRenderer.render(formatted(request, .png)))
        #expect(image.width == 800 && image.height == 800)
        #expect(image.pixel(8, 400) == rgba(255, 0, 0, 255))
        #expect(image.pixel(790, 400) == rgba(0, 255, 0, 255))
    }

    @Test func asymmetricSlotsKeepTheirOwnColorsAndCrops() throws {
        let fixture = try FixtureStore()
        let redTop = try fixture.writePNG(width: 40, height: 80) { _, y in
            y < 40 ? rgba(255, 0, 0, 255) : rgba(0, 0, 255, 255)
        }
        let green = try fixture.writePNG(width: 20, height: 20) { _, _ in rgba(0, 255, 0, 255) }
        let blue = try fixture.writePNG(width: 20, height: 20) { _, _ in rgba(0, 0, 255, 255) }
        let layout = try GridLayout(
            id: "renderer-span",
            name: "Span",
            photoCount: 3,
            rows: [1, 1],
            columns: [2, 1],
            areas: [["a", "b"], ["a", "c"]],
            aspectRatio: 4.0 / 3,
            platforms: []
        )
        let project = CollageProject(
            id: UUID(uuidString: "10000000-0000-0000-0000-0000000000AA")!,
            name: "Span",
            createdAt: Date(timeIntervalSince1970: 1),
            updatedAt: Date(timeIntervalSince1970: 2),
            photos: [
                ProjectPhoto(id: firstID, imageFilename: "a.png", pixelWidth: 40, pixelHeight: 80),
                ProjectPhoto(id: secondID, imageFilename: "b.png", pixelWidth: 20, pixelHeight: 20),
                ProjectPhoto(id: thirdID, imageFilename: "c.png", pixelWidth: 20, pixelHeight: 20),
            ],
            selectedLayoutID: layout.id,
            positions: [
                PhotoPosition(photoID: firstID, area: "a", transform: PhotoTransform(positionX: 0.5, positionY: 0)),
                PhotoPosition(photoID: secondID, area: "b"),
                PhotoPosition(photoID: thirdID, area: "c"),
            ],
            settings: CollageSettings(gap: 12, background: .color(RGBAColor(red: 1, green: 1, blue: 1)), borderRadius: 0)
        )
        let request = CollageRenderRequest(
            project: project,
            layout: layout,
            originalURLs: [firstID: redTop, secondID: green, thirdID: blue],
            compositionSize: CGSize(width: 1200, height: 900),
            dimensions: ExportDimensions(width: 1200, height: 900),
            format: .png
        )

        let image = try decode(CollageRenderer.render(request))
        // Slot A is (12, 12, 776x876) and positionY 0 shows the red top of the source.
        #expect(image.pixel(20, 20) == rgba(255, 0, 0, 255))
        // Cover scale is 776/40 = 19.4; the source color boundary is y 12 + 40*19.4 = 788.
        #expect(image.pixel(20, 700) == rgba(255, 0, 0, 255))
        #expect(image.pixel(20, 800) == rgba(0, 0, 255, 255))
        // Slot B starts at x 800, y 12. Slot C starts at x 800, y 456.
        #expect(image.pixel(810, 20) == rgba(0, 255, 0, 255))
        #expect(image.pixel(810, 470) == rgba(0, 0, 255, 255))
        #expect(image.pixel(790, 20) == rgba(255, 255, 255, 255))
    }

    @Test func cropPrecedesRotationAndSubunitZoom() throws {
        let fixture = try FixtureStore()
        let photo = try fixture.writePNG(width: 100, height: 400) { _, y in
            y < 50 ? rgba(255, 0, 0, 255) : rgba(0, 0, 255, 255)
        }
        let request = try singlePhotoRequest(
            fixture: photo,
            photoID: firstID,
            settings: CollageSettings(gap: 0, background: .color(RGBAColor(red: 0, green: 1, blue: 0, alpha: 1))),
            composition: CGSize(width: 200, height: 100),
            dimensions: ExportDimensions(width: 200, height: 100),
            transform: PhotoTransform(positionX: 0, positionY: 0, rotationDegrees: 90, scale: 0.5)
        )

        let image = try decode(CollageRenderer.render(formatted(request, .png)))
        // Layer AABB after the clockwise quarter turn and 0.5 scale is local x 75...125.
        #expect(image.pixel(70, 50) == rgba(0, 255, 0, 255))
        #expect(image.pixel(80, 50) == rgba(255, 0, 0, 255))
        #expect(image.pixel(120, 50) == rgba(255, 0, 0, 255))
        #expect(image.pixel(130, 50) == rgba(0, 255, 0, 255))
        #expect(image.pixel(100, 2) == rgba(255, 0, 0, 255))
    }

    @Test func topAndBottomPanKeepTheirSourceHalves() throws {
        let fixture = try FixtureStore()
        let photo = try fixture.writePNG(width: 20, height: 80) { _, y in
            y < 40 ? rgba(255, 0, 0, 255) : rgba(0, 0, 255, 255)
        }
        let top = try singlePhotoRequest(
            fixture: photo,
            photoID: firstID,
            settings: CollageSettings(gap: 0, background: .transparent),
            composition: CGSize(width: 40, height: 40),
            dimensions: ExportDimensions(width: 40, height: 40),
            transform: PhotoTransform(positionY: 0)
        )
        let bottom = try singlePhotoRequest(
            fixture: photo,
            photoID: firstID,
            settings: CollageSettings(gap: 0, background: .transparent),
            composition: CGSize(width: 40, height: 40),
            dimensions: ExportDimensions(width: 40, height: 40),
            transform: PhotoTransform(positionY: 1)
        )

        #expect(try decode(CollageRenderer.render(formatted(top, .png))).pixel(20, 4) == rgba(255, 0, 0, 255))
        #expect(try decode(CollageRenderer.render(formatted(bottom, .png))).pixel(20, 4) == rgba(0, 0, 255, 255))
    }

    @Test func exifOrientationsAreAppliedBeforeCover() throws {
        let fixture = try FixtureStore()
        // Stored bitmap is wide, red on the left. Orientation 6 displays it tall, red on top.
        // Orientation 2 mirrors it, so the displayed left edge is blue.
        let stored = try fixture.writePNG(width: 40, height: 10) { x, _ in
            x < 20 ? rgba(255, 0, 0, 255) : rgba(0, 0, 255, 255)
        }
        let turned = try fixture.writeJPEG(copying: stored, orientation: 6)
        let mirrored = try fixture.writeJPEG(copying: stored, orientation: 2)
        let upright = try singlePhotoRequest(
            fixture: turned,
            photoID: firstID,
            settings: CollageSettings(gap: 0, background: .transparent),
            composition: CGSize(width: 10, height: 40),
            dimensions: ExportDimensions(width: 10, height: 40),
            transform: PhotoTransform(positionX: 0.5, positionY: 0)
        )
        let flipped = try singlePhotoRequest(
            fixture: mirrored,
            photoID: firstID,
            settings: CollageSettings(gap: 0, background: .transparent),
            composition: CGSize(width: 40, height: 10),
            dimensions: ExportDimensions(width: 40, height: 10),
            transform: PhotoTransform(positionX: 0, positionY: 0.5)
        )

        let turnedImage = try decode(CollageRenderer.render(formatted(upright, .png)))
        #expect(turnedImage.pixel(5, 2).isNear(rgba(255, 0, 0, 255), tolerance: 12))
        #expect(turnedImage.pixel(5, 36).isNear(rgba(0, 0, 255, 255), tolerance: 12))
        let mirroredImage = try decode(CollageRenderer.render(formatted(flipped, .png)))
        #expect(mirroredImage.pixel(2, 5).isNear(rgba(0, 0, 255, 255), tolerance: 12))
    }

    @Test func outputOmitsSourceMetadataAndRetriesAfterABadOriginal() throws {
        let fixture = try FixtureStore()
        let photo = try fixture.writePNG(width: 8, height: 8, artist: "sentinel-artist") { _, _ in
            rgba(255, 0, 0, 255)
        }
        var request = try singlePhotoRequest(
            fixture: photo,
            photoID: firstID,
            settings: CollageSettings(),
            composition: CGSize(width: 20, height: 20),
            dimensions: ExportDimensions(width: 20, height: 20)
        )
        let encoded = try CollageRenderer.render(formatted(request, .jpeg, quality: 0.9))
        let output = try decode(encoded)
        let tiff = output.properties[kCGImagePropertyTIFFDictionary] as? [CFString: Any]
        #expect(tiff?[kCGImagePropertyTIFFArtist] == nil)
        #expect(output.properties[kCGImagePropertyGPSDictionary] == nil)

        request.dimensions = ExportDimensions(width: 8000, height: 5001)
        #expect(throws: CollageValidationError.self) {
            try CollageRenderer.render(formatted(request, .png))
        }
        request.dimensions = ExportDimensions(width: 20, height: 20)
        request.originalURLs[firstID] = URL(string: "https://example.com/photo.jpg")!
        #expect(throws: CollageRenderError.invalidProject("Originals must be local file URLs.")) {
            try CollageRenderer.render(formatted(request, .png))
        }
        request.originalURLs[firstID] = photo
        try FileManager.default.removeItem(at: photo)
        #expect(throws: CollageRenderError.missingOriginal(firstID)) {
            try CollageRenderer.render(formatted(request, .png))
        }
        let replacement = try fixture.writePNG(width: 8, height: 8) { _, _ in rgba(0, 255, 0, 255) }
        request.originalURLs[firstID] = replacement
        #expect(try decode(CollageRenderer.render(formatted(request, .png))).pixel(10, 10).green == 255)

        try Data("not an image".utf8).write(to: replacement)
        #expect(throws: CollageRenderError.unreadableOriginal(firstID)) {
            try CollageRenderer.render(formatted(request, .png))
        }
    }

    @Test(arguments: [CollageBackground.transparent, .color(RGBAColor(red: 0, green: 0, blue: 1, alpha: 0.5))])
    func roundedJpegCornersAreWhiteAndTheInnerCropStaysIntact(background: CollageBackground) throws {
        let fixture = try FixtureStore()
        let photo = try fixture.writePNG(width: 20, height: 20) { _, _ in rgba(255, 0, 0, 255) }
        let request = try singlePhotoRequest(
            fixture: photo,
            photoID: firstID,
            settings: CollageSettings(gap: 0, background: background, borderRadius: 16),
            composition: CGSize(width: 40, height: 40),
            dimensions: ExportDimensions(width: 40, height: 40)
        )
        let png = try decode(CollageRenderer.render(formatted(request, .png)))
        #expect(png.pixel(0, 0).alpha == 0)
        #expect(png.pixel(20, 20) == rgba(255, 0, 0, 255))

        let jpeg = try decode(CollageRenderer.render(formatted(request, .jpeg, quality: 1)))
        #expect(jpeg.pixel(0, 0).isNear(rgba(255, 255, 255, 255), tolerance: 8))
        #expect(jpeg.pixel(20, 20).isNear(rgba(255, 0, 0, 255), tolerance: 12))
    }

    private func singlePhotoRequest(
        fixture: URL,
        photoID: UUID,
        settings: CollageSettings,
        composition: CGSize,
        dimensions: ExportDimensions,
        transform: PhotoTransform = PhotoTransform()
    ) throws -> CollageRenderRequest {
        let layout = try GridLayout(
            id: "renderer-single",
            name: "Single",
            photoCount: 1,
            rows: [1],
            columns: [1],
            areas: [["a"]],
            aspectRatio: composition.width / composition.height,
            platforms: []
        )
        let project = CollageProject(
            id: UUID(uuidString: "10000000-0000-0000-0000-0000000000AA")!,
            name: "Render",
            createdAt: Date(timeIntervalSince1970: 1),
            updatedAt: Date(timeIntervalSince1970: 2),
            photos: [ProjectPhoto(id: photoID, imageFilename: fixture.lastPathComponent, pixelWidth: 8, pixelHeight: 8)],
            selectedLayoutID: layout.id,
            positions: [PhotoPosition(photoID: photoID, area: "a", transform: transform)],
            settings: settings
        )
        return CollageRenderRequest(
            project: project,
            layout: layout,
            originalURLs: [photoID: fixture],
            compositionSize: composition,
            dimensions: dimensions,
            format: .png
        )
    }

    private func formatted(
        _ request: CollageRenderRequest,
        _ format: CollageRenderFormat,
        quality: Double = 0.92
    ) -> CollageRenderRequest {
        var copy = request
        copy.format = format
        copy.jpegQuality = quality
        return copy
    }

    private func decode(_ data: Data) throws -> SampledImage {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
              let type = CGImageSourceGetType(source) else {
            throw CollageRenderError.encodingFailed
        }
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] ?? [:]
        return SampledImage(normalizing: image, format: type as String, properties: properties)
    }
}

private final class FixtureStore {
    let directory: URL

    init() throws {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("collage-renderer-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    func writePNG(
        width: Int,
        height: Int,
        artist: String? = nil,
        pixel: (Int, Int) -> RGBA
    ) throws -> URL {
        let url = directory.appendingPathComponent(UUID().uuidString).appendingPathExtension("png")
        try write(bytes: bytes(width: width, height: height, pixel: pixel), width: width, height: height, type: .png, to: url, orientation: nil, artist: artist)
        return url
    }

    func writeJPEG(copying png: URL, orientation: UInt32) throws -> URL {
        guard let source = CGImageSourceCreateWithURL(png as CFURL, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            throw CollageRenderError.encodingFailed
        }
        let sampled = SampledImage(normalizing: image, format: UTType.png.identifier, properties: [:])
        var samples: [UInt8] = []
        for y in 0..<sampled.height {
            for x in 0..<sampled.width {
                let pixel = sampled.pixel(x, y)
                samples.append(contentsOf: [pixel.red, pixel.green, pixel.blue, 255])
            }
        }
        let url = directory.appendingPathComponent(UUID().uuidString).appendingPathExtension("jpg")
        try write(bytes: samples, width: sampled.width, height: sampled.height, type: .jpeg, to: url, orientation: orientation, artist: "sentinel-artist")
        return url
    }

    private func write(
        bytes: [UInt8],
        width: Int,
        height: Int,
        type: UTType,
        to url: URL,
        orientation: UInt32?,
        artist: String?
    ) throws {
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let provider = CGDataProvider(data: Data(bytes) as CFData),
              let image = CGImage(
                width: width,
                height: height,
                bitsPerComponent: 8,
                bitsPerPixel: 32,
                bytesPerRow: width * 4,
                space: space,
                bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                provider: provider,
                decode: nil,
                shouldInterpolate: false,
                intent: .defaultIntent
              ),
              let destination = CGImageDestinationCreateWithURL(url as CFURL, type.identifier as CFString, 1, nil) else {
            throw CollageRenderError.encodingFailed
        }
        var properties: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: 1]
        if let orientation {
            properties[kCGImagePropertyOrientation] = orientation
        }
        if let artist {
            properties[kCGImagePropertyTIFFDictionary] = [kCGImagePropertyTIFFArtist: artist]
        }
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        guard CGImageDestinationFinalize(destination) else {
            throw CollageRenderError.encodingFailed
        }
    }

    private func bytes(width: Int, height: Int, pixel: (Int, Int) -> RGBA) -> [UInt8] {
        var bytes: [UInt8] = []
        bytes.reserveCapacity(width * height * 4)
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

private struct RGBA: Equatable {
    var red: UInt8
    var green: UInt8
    var blue: UInt8
    var alpha: UInt8

    func isNear(_ other: RGBA, tolerance: Int) -> Bool {
        abs(Int(red) - Int(other.red)) <= tolerance
            && abs(Int(green) - Int(other.green)) <= tolerance
            && abs(Int(blue) - Int(other.blue)) <= tolerance
            && abs(Int(alpha) - Int(other.alpha)) <= tolerance
    }
}

private func rgba(_ red: UInt8, _ green: UInt8, _ blue: UInt8, _ alpha: UInt8) -> RGBA {
    RGBA(red: red, green: green, blue: blue, alpha: alpha)
}

/// Samples through an explicit 8-bit sRGB RGBA bitmap. ImageIO's native layout is not assumed.
private struct SampledImage {
    let width: Int
    let height: Int
    let format: String
    let properties: [CFString: Any]
    private let bytes: [UInt8]

    init(normalizing image: CGImage, format: String, properties: [CFString: Any]) {
        width = image.width
        height = image.height
        self.format = format
        self.properties = properties
        let rowBytes = width * 4
        var buffer = [UInt8](repeating: 0, count: rowBytes * height)
        if let space = CGColorSpace(name: CGColorSpace.sRGB),
           let context = CGContext(
            data: &buffer,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: rowBytes,
            space: space,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
           ) {
            context.interpolationQuality = .none
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        bytes = buffer
    }

    func pixel(_ x: Int, _ y: Int) -> RGBA {
        let offset = y * width * 4 + x * 4
        guard bytes.indices.contains(offset + 3) else { return rgba(0, 0, 0, 0) }
        return rgba(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
    }
}
