import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import CollageMaker

struct CollageExporterTests {
    private let redID = UUID(uuidString: "00000000-0000-0000-0000-0000000000E1")!
    private let blueID = UUID(uuidString: "00000000-0000-0000-0000-0000000000E2")!

    @Test func presetsMatchTheWebLongestEdgeRounding() {
        let web = ExportPreset.all.first { $0.id == "web" }!
        let social = ExportPreset.all.first { $0.id == "social" }!
        let print = ExportPreset.all.first { $0.id == "print" }!
        #expect(web.dimensions(aspectRatio: 4.0 / 3) == ExportDimensions(width: 1920, height: 1440))
        #expect(web.dimensions(aspectRatio: 0.75) == ExportDimensions(width: 1440, height: 1920))
        // 1080 × 0.5625 = 607.5; JavaScript Math.round gives 608.
        #expect(social.dimensions(aspectRatio: 0.5625) == ExportDimensions(width: 608, height: 1080))
        // 2400 / (16 / 9) = 1350 exactly.
        #expect(print.dimensions(aspectRatio: 16.0 / 9) == ExportDimensions(width: 2400, height: 1350))
    }

    @Test func typedSizesFollowTheExportLimits() throws {
        func error(_ width: String, _ height: String) -> String? {
            if case let .failure(.invalidSize(message)) = ExportDimensions.parse(width: width, height: height) { return message }
            return nil
        }
        #expect(try ExportDimensions.parse(width: " 8192 ", height: "4882").get() == ExportDimensions(width: 8192, height: 4882))
        // 8192 × 4883 = 40,001,536 pixels, just over the limit.
        #expect(error("8192", "4883") == "Export size must be 40 megapixels or smaller.")
        #expect(error("8193", "1") == "Each dimension must be 8192 px or smaller.")
        #expect(error("0", "100") == "Width and height must be at least 1 pixel.")
        #expect(error("12.5", "100") == "Width and height must be whole pixels.")
        #expect(error("", "100") == "Width and height must be whole pixels.")
    }

    @Test func filenamesCannotEscapeTheExportDirectory() {
        #expect(CollageExporter.filename("../a/b:c", format: .png) == "_a_b_c.png")
        #expect(CollageExporter.filename("  ...  ", format: .jpeg) == "Collage.jpg")
        #expect(CollageExporter.filename("Trip.jpg", format: .jpeg) == "Trip.jpg")
        #expect(CollageExporter.filename("Trip.jpg", format: .png) == "Trip.jpg.png")
        #expect(CollageExporter.filename(String(repeating: "x", count: 300), format: .png).count == 204)
    }

    @Test func pngExportHasExactSizeTransparencyAndUnevenSlots() async throws {
        let fixture = try Fixture()
        let exporter = CollageExporter(temporaryRoot: fixture.directory.appending(path: "exports"))
        let request = try fixture.request(redID: redID, blueID: blueID, format: .png, size: ExportDimensions(width: 600, height: 400))

        let result = try await exporter.export(request)
        #expect(result.fileURL.lastPathComponent == "Trip.png")
        #expect(result.fileURL.path.hasPrefix(exporter.temporaryRoot.path))
        let image = try Decoded(contentsOf: result.fileURL)
        #expect(image.type == UTType.png.identifier)
        #expect(image.width == 600 && image.height == 400)
        #expect(image.byteCount == result.byteCount)
        // Columns are 2:1, so the red slot ends at x 400 of 600.
        #expect(image.pixel(390, 200) == [255, 0, 0, 255])
        #expect(image.pixel(410, 200) == [0, 0, 255, 255])
        // A 16-point radius on the 400-point canvas is 24 px here; the corner stays transparent.
        #expect(image.pixel(1, 1)[3] == 0)
    }

    @Test func jpegExportFillsTransparencyWhiteAndHonorsQuality() async throws {
        let fixture = try Fixture()
        let exporter = CollageExporter(temporaryRoot: fixture.directory.appending(path: "exports"))
        var request = try fixture.request(redID: redID, blueID: blueID, format: .jpeg, size: ExportDimensions(width: 301, height: 217))
        request.jpegQuality = 1

        let best = try await exporter.export(request)
        let image = try Decoded(contentsOf: best.fileURL)
        #expect(best.fileURL.lastPathComponent == "Trip.jpg")
        #expect(image.type == UTType.jpeg.identifier)
        #expect(image.width == 301 && image.height == 217)
        #expect(image.pixel(0, 0).prefix(3).allSatisfy { $0 >= 245 })

        request.jpegQuality = 0.1
        let small = try await exporter.export(request)
        #expect(small.byteCount < best.byteCount)
        // Each export keeps its own directory, so the earlier file is not overwritten.
        #expect(small.fileURL != best.fileURL)
        #expect(FileManager.default.fileExists(atPath: best.fileURL.path))

        exporter.discard(best)
        #expect(!FileManager.default.fileExists(atPath: best.directory.path))
        #expect(FileManager.default.fileExists(atPath: small.fileURL.path))
        exporter.discardAll()
        #expect(!FileManager.default.fileExists(atPath: exporter.temporaryRoot.path))
    }

    @Test func failuresLeaveNoFileAndRetrySucceeds() async throws {
        let fixture = try Fixture()
        let exporter = CollageExporter(temporaryRoot: fixture.directory.appending(path: "exports"))
        var request = try fixture.request(redID: redID, blueID: blueID, format: .png, size: ExportDimensions(width: 60, height: 40))
        let good = request.originalURLs[blueID]!

        request.dimensions = ExportDimensions(width: 0, height: 40)
        await #expect(throws: CollageExportError.invalidSize("Width and height must be at least 1 pixel.")) {
            try await exporter.export(request)
        }
        request.dimensions = ExportDimensions(width: 60, height: 40)

        request.originalURLs[blueID] = fixture.directory.appending(path: "missing.png")
        await #expect(throws: CollageExportError.missingPhoto) { try await exporter.export(request) }

        let corrupt = fixture.directory.appending(path: "corrupt.png")
        try Data("not an image".utf8).write(to: corrupt)
        request.originalURLs[blueID] = corrupt
        await #expect(throws: CollageExportError.unreadablePhoto) { try await exporter.export(request) }

        let cancelled = request
        let outcome = await Task {
            withUnsafeCurrentTask { $0?.cancel() }
            return try await exporter.export(cancelled)
        }.result
        #expect(throws: CancellationError.self) { try outcome.get() }
        #expect(try exportedFiles(in: exporter).isEmpty)

        request.originalURLs[blueID] = good
        let retried = try await exporter.export(request)
        #expect(try Decoded(contentsOf: retried.fileURL).width == 60)
        #expect(try exportedFiles(in: exporter) == [retried.fileURL.resolvingSymlinksInPath()])
    }

    @Test func sixteenCameraOriginalsReopenAndExportEverySlot() async throws {
        let fixture = try Fixture()
        let catalog = try LayoutCatalog()
        let root = fixture.directory.appending(path: "store")
        let store = ProjectStore(rootURL: root, catalog: catalog)
        let project = try await store.createProject(name: "Sixteen camera originals")
        // Distinct row/column colors make a missing, duplicated or transposed slot fail.
        let colors = (0..<16).map { index in
            [40 + (index / 4) * 55, 35 + (index % 4) * 55, 120]
        }
        let items = try colors.map { CameraItem(original: try fixture.cameraJPEG($0)) }
        let importer = PhotoImporter(store: store)
        let imported = try await importer.importPhotos(items, into: project.id)
        #expect(imported.imported.count == 16)
        #expect(imported.failures.isEmpty)
        #expect(imported.imported.allSatisfy { $0.photo.pixelWidth == 3024 && $0.photo.pixelHeight == 4032 })
        let overflow = try await importer.importPhotos([items[0]], into: project.id)
        #expect(overflow.imported.isEmpty)
        #expect(overflow.failures.map(\.reason) == [.photoLimitReached])

        let reopenedStore = ProjectStore(rootURL: root, catalog: catalog)
        var reopened = try await reopenedStore.loadProject(project.id)
        #expect(reopened.photos == imported.imported.map(\.photo))
        #expect(reopened.selectedLayoutID == "16-grid-4x4")
        reopened.settings = CollageSettings(gap: 0, background: .transparent, borderRadius: 16)
        reopened = try await reopenedStore.saveProject(reopened)
        let layout = try #require(catalog.layout(id: "16-grid-4x4"))
        var originals: [UUID: URL] = [:]
        for photo in reopened.photos {
            originals[photo.id] = try await reopenedStore.originalURL(photoID: photo.id, in: reopened.id)
        }
        let exporter = CollageExporter(temporaryRoot: fixture.directory.appending(path: "exports"))
        // Exercise the near-40 MP boundary, not only a tiny sixteen-slot bitmap.
        let size = ExportDimensions(width: 8192, height: 4882)
        for format in [CollageRenderFormat.png, .jpeg] {
            let started = Date()
            let result = try await exporter.export(CollageExportRequest(
                project: reopened, layout: layout, originalURLs: originals,
                dimensions: size, format: format, jpegQuality: 0.9, filename: reopened.name
            ))
            try autoreleasepool {
                let image = try Decoded(contentsOf: result.fileURL)
                #expect(image.width == 8192 && image.height == 4882)
                #expect(image.type == (format == .png ? UTType.png.identifier : UTType.jpeg.identifier))
                for index in 0..<16 {
                    // Independent centers of the 4×4 grid; never ask production geometry.
                    let pixel = image.pixel((index % 4) * 2048 + 1024, Int((Double(index / 4) + 0.5) * 1220.5))
                    for channel in 0..<3 {
                        #expect(abs(Int(pixel[channel]) - colors[index][channel]) <= 8, "slot \(index), channel \(channel)")
                    }
                    #expect(pixel[3] == 255)
                }
                if format == .png {
                    #expect(image.pixel(0, 0)[3] == 0)
                } else {
                    #expect(image.pixel(0, 0).prefix(3).allSatisfy { $0 >= 245 })
                }
                print("16-photo stress: \(format.rawValue), 8192×4882, \(result.byteCount) bytes, \(Date().timeIntervalSince(started)) seconds including decode")
            }
            exporter.discard(result)
            #expect(!FileManager.default.fileExists(atPath: result.fileURL.path))
        }
    }

    private func exportedFiles(in exporter: CollageExporter) throws -> [URL] {
        guard let items = FileManager.default.enumerator(at: exporter.temporaryRoot, includingPropertiesForKeys: [.isRegularFileKey]) else {
            return []
        }
        return try items.compactMap { $0 as? URL }.filter {
            try $0.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true
        }.map { $0.resolvingSymlinksInPath() }
    }
}

/// Supplies a fresh, importer-owned staging copy, just like the system picker provider.
private struct CameraItem: PhotoImportItem {
    let original: URL

    func loadFile() async throws -> URL {
        let staged = original.deletingLastPathComponent().appending(path: "staged-\(UUID().uuidString).jpg")
        try FileManager.default.copyItem(at: original, to: staged)
        return staged
    }
}

private final class Fixture {
    let directory: URL

    init() throws {
        directory = FileManager.default.temporaryDirectory
            .appending(path: "collage-exporter-\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    deinit { try? FileManager.default.removeItem(at: directory) }

    /// Two solid photos in a 2:1 column layout with a 16-point radius and transparent background.
    func request(redID: UUID, blueID: UUID, format: CollageRenderFormat, size: ExportDimensions) throws -> CollageExportRequest {
        let layout = try GridLayout(
            id: "export-uneven", name: "Uneven", photoCount: 2,
            rows: [1], columns: [2, 1], areas: [["a", "b"]], aspectRatio: 1.5, platforms: []
        )
        let project = CollageProject(
            id: UUID(uuidString: "20000000-0000-0000-0000-0000000000EE")!,
            name: "Trip",
            createdAt: Date(timeIntervalSince1970: 1),
            updatedAt: Date(timeIntervalSince1970: 2),
            photos: [
                ProjectPhoto(id: redID, imageFilename: "red.png", pixelWidth: 16, pixelHeight: 16),
                ProjectPhoto(id: blueID, imageFilename: "blue.png", pixelWidth: 16, pixelHeight: 16),
            ],
            selectedLayoutID: layout.id,
            positions: [PhotoPosition(photoID: redID, area: "a"), PhotoPosition(photoID: blueID, area: "b")],
            settings: CollageSettings(gap: 0, background: .transparent, borderRadius: 16)
        )
        return CollageExportRequest(
            project: project, layout: layout,
            originalURLs: [redID: try solidPNG([255, 0, 0, 255]), blueID: try solidPNG([0, 0, 255, 255])],
            dimensions: size, format: format, jpegQuality: 0.9, filename: project.name
        )
    }

    /// A synthetic twelve-megapixel original; generated one at a time, never retained decoded.
    func cameraJPEG(_ rgb: [Int]) throws -> URL {
        try autoreleasepool {
            let url = directory.appending(path: "\(UUID().uuidString).jpg")
            guard let context = CGContext(
                data: nil, width: 3024, height: 4032, bitsPerComponent: 8, bytesPerRow: 0,
                space: CGColorSpace(name: CGColorSpace.sRGB)!,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { throw CollageExportError.writeFailed }
            context.setFillColor(CGColor(srgbRed: Double(rgb[0]) / 255, green: Double(rgb[1]) / 255, blue: Double(rgb[2]) / 255, alpha: 1))
            context.fill(CGRect(x: 0, y: 0, width: 3024, height: 4032))
            guard let image = context.makeImage(),
                  let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
                throw CollageExportError.writeFailed
            }
            CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.95] as CFDictionary)
            guard CGImageDestinationFinalize(destination) else { throw CollageExportError.writeFailed }
            return url
        }
    }

    private func solidPNG(_ rgba: [UInt8]) throws -> URL {
        let side = 16
        let bytes = Array((0..<(side * side)).map { _ in rgba }.joined())
        let url = directory.appending(path: "\(UUID().uuidString).png")
        guard let provider = CGDataProvider(data: Data(bytes) as CFData),
              let image = CGImage(
                width: side, height: side, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: side * 4,
                space: CGColorSpace(name: CGColorSpace.sRGB)!,
                bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent
              ),
              let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
            throw CollageExportError.writeFailed
        }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { throw CollageExportError.writeFailed }
        return url
    }
}

/// Decodes an exported file into explicit 8-bit sRGB RGBA samples.
private struct Decoded {
    let type: String
    let width: Int
    let height: Int
    let byteCount: Int
    private let samples: [UInt8]

    init(contentsOf url: URL) throws {
        let data = try Data(contentsOf: url)
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let type = CGImageSourceGetType(source),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
            throw CollageExportError.unreadablePhoto
        }
        self.type = type as String
        width = image.width
        height = image.height
        byteCount = data.count
        var buffer = [UInt8](repeating: 0, count: width * height * 4)
        guard let context = CGContext(
            data: &buffer, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { throw CollageExportError.unreadablePhoto }
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        samples = buffer
    }

    /// Top-left origin, matching the composition.
    func pixel(_ x: Int, _ y: Int) -> [UInt8] {
        let offset = (y * width + x) * 4
        return Array(samples[offset..<(offset + 4)])
    }
}
