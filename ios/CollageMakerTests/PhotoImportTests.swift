import CoreGraphics
import CoreTransferable
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import CollageMaker

/// Public-contract tests for `PhotoImporter` with images generated at runtime.
/// The real picker UI is not exercised here.
struct PhotoImportTests {
    private final class Fixture {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "PhotoImportTests-\(UUID().uuidString)", directoryHint: .isDirectory)
        let store: ProjectStore

        init() throws {
            store = ProjectStore(rootURL: root.appending(path: "Store", directoryHint: .isDirectory), catalog: try LayoutCatalog())
            try FileManager.default.createDirectory(at: itemsURL, withIntermediateDirectories: true)
        }

        deinit { try? FileManager.default.removeItem(at: root) }

        var itemsURL: URL { root.appending(path: "Items", directoryHint: .isDirectory) }
        var importer: PhotoImporter { PhotoImporter(store: store) }

        func item(_ name: String, _ data: Data?, beforeReturn: (@Sendable () async throws -> Void)? = nil) -> FakeItem {
            FakeItem(url: itemsURL.appending(path: name), data: data, beforeReturn: beforeReturn)
        }

        /// Files the importer was handed and has not deleted.
        func leftoverItemFiles() throws -> [String] {
            try FileManager.default.contentsOfDirectory(atPath: itemsURL.path(percentEncoded: false))
        }

        func storedBytes(_ photo: ProjectPhoto, in projectID: UUID) async throws -> Data {
            try Data(contentsOf: await store.originalURL(photoID: photo.id, in: projectID))
        }
    }

    /// Writes its bytes to a fresh file when loaded, like the picker staging a copy.
    struct FakeItem: PhotoImportItem {
        let url: URL
        let data: Data?
        let beforeReturn: (@Sendable () async throws -> Void)?

        func loadFile() async throws -> URL {
            guard let data else { throw CocoaError(.fileReadUnknown) }
            try data.write(to: url)
            try await beforeReturn?()
            return url
        }
    }

    static func image(_ type: UTType, width: Int, height: Int, orientation: Int? = nil) -> Data? {
        guard let context = CGContext(
            data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        context.setFillColor(CGColor(srgbRed: 0.6, green: 0.2, blue: 0.7, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        guard let image = context.makeImage() else { return nil }
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, type.identifier as CFString, 1, nil) else { return nil }
        let properties = orientation.map { [kCGImagePropertyOrientation: $0] as CFDictionary }
        CGImageDestinationAddImage(destination, image, properties)
        return CGImageDestinationFinalize(destination) ? data as Data : nil
    }

    static var heicEncodingAvailable: Bool { image(.heic, width: 8, height: 4) != nil }

    @Test func reportsOrientedPixelSizesAndStoresOriginalBytes() async throws {
        let fixture = try Fixture()
        let project = try await fixture.store.createProject()
        // EXIF 6 rotates a quarter turn; EXIF 3 is upside down and keeps the size.
        let rotated = try #require(Self.image(.jpeg, width: 40, height: 20, orientation: 6))
        let flipped = try #require(Self.image(.jpeg, width: 30, height: 12, orientation: 3))
        let png = try #require(Self.image(.png, width: 9, height: 27))

        let report = try await fixture.importer.importPhotos([
            fixture.item("rotated.jpg", rotated),
            fixture.item("flipped.jpg", flipped),
            fixture.item("plain.png", png),
        ], into: project.id)

        #expect(report.failures.isEmpty)
        #expect(report.imported.map(\.pickerIndex) == [0, 1, 2])
        #expect(report.imported.map { [$0.photo.pixelWidth, $0.photo.pixelHeight] } == [[20, 40], [30, 12], [9, 27]])
        #expect(try await fixture.storedBytes(report.imported[0].photo, in: project.id) == rotated)
        #expect(try await fixture.storedBytes(report.imported[2].photo, in: project.id) == png)
        #expect(report.project.photos == report.imported.map(\.photo))
        #expect(try fixture.leftoverItemFiles().isEmpty)
    }

    @Test(.enabled(if: PhotoImportTests.heicEncodingAvailable, "This runtime cannot encode HEIC fixtures"))
    func importsHEICUnchanged() async throws {
        let fixture = try Fixture()
        let project = try await fixture.store.createProject()
        let heic = try #require(Self.image(.heic, width: 48, height: 16, orientation: 8))
        let report = try await fixture.importer.importPhotos([fixture.item("photo.heic", heic)], into: project.id)
        let photo = try #require(report.imported.first?.photo)
        #expect(photo.pixelWidth == 16)
        #expect(photo.pixelHeight == 48)
        #expect(photo.imageFilename.hasSuffix(".heic"))
        #expect(try await fixture.storedBytes(photo, in: project.id) == heic)
    }

    @Test func keepsPickerIndicesAcrossInvalidItemsAndTheStoreLimit() async throws {
        let fixture = try Fixture()
        let project = try await fixture.store.createProject()
        let small = try #require(Self.image(.png, width: 4, height: 4))
        let existing = try await fixture.importer.importPhotos(
            (0..<14).map { fixture.item("existing-\($0).png", small) }, into: project.id
        )
        #expect(existing.imported.count == 14)

        let jpeg = try #require(Self.image(.jpeg, width: 20, height: 10))
        let gif = try #require(Self.image(.gif, width: 5, height: 5))
        let truncated = small.prefix(small.count / 2)
        // A PNG named .jpg is accepted by content and stored with its real extension.
        let report = try await fixture.importer.importPhotos([
            fixture.item("0.txt", Data("not an image".utf8)),
            fixture.item("1.jpg", jpeg),
            fixture.item("2.gif", gif),
            fixture.item("3.png", Data(truncated)),
            fixture.item("4.png", nil),
            fixture.item("5.jpg", small),
            fixture.item("6.jpg", jpeg),
        ], into: project.id)

        #expect(report.imported.map(\.pickerIndex) == [1, 5])
        #expect(report.imported.map(\.photo.pixelWidth) == [20, 4])
        #expect(report.imported[1].photo.imageFilename.hasSuffix(".png"))
        #expect(report.failures.map(\.pickerIndex) == [0, 2, 3, 4, 6])
        #expect(report.failures[0].reason == .undecodable)
        #expect(report.failures[1].reason == .unsupportedFormat)
        #expect(report.failures[2].reason == .undecodable)
        if case .unavailable = report.failures[3].reason {} else {
            Issue.record("a load error should be unavailable, got \(report.failures[3].reason)")
        }
        #expect(report.failures[4].reason == .photoLimitReached)
        #expect(try await fixture.store.loadProject(project.id).photos.count == 16)
        #expect(try fixture.leftoverItemFiles().isEmpty)
    }

    @Test func stagedPickerFilesOutliveTheProviderAndAreDeletedAfterImport() async throws {
        let fixture = try Fixture()
        let project = try await fixture.store.createProject()
        let png = try #require(Self.image(.png, width: 12, height: 6))
        let providerFile = fixture.root.appending(path: "provider.png")
        try png.write(to: providerFile)
        let provider = try #require(NSItemProvider(contentsOf: providerFile))

        let staged: StagedPhotoFile = try await withCheckedThrowingContinuation { continuation in
            _ = provider.loadTransferable(type: StagedPhotoFile.self) { continuation.resume(with: $0) }
        }
        // The provider's file may vanish once its callback returns; the staged copy must not.
        try FileManager.default.removeItem(at: providerFile)
        #expect(staged.url.deletingLastPathComponent() == PhotoImportStaging.directory)
        #expect(try Data(contentsOf: staged.url) == png)

        struct StagedItem: PhotoImportItem {
            let url: URL
            func loadFile() async throws -> URL { url }
        }
        let report = try await fixture.importer.importPhotos([StagedItem(url: staged.url)], into: project.id)
        let photo = try #require(report.imported.first?.photo)
        #expect(!FileManager.default.fileExists(atPath: staged.url.path(percentEncoded: false)))
        #expect(try await fixture.storedBytes(photo, in: project.id) == png)
    }

    @Test func cancellationBeforeCommitAddsNothingAndCleansUp() async throws {
        let fixture = try Fixture()
        let project = try await fixture.store.createProject()
        let png = try #require(Self.image(.png, width: 4, height: 4))
        let items = [
            fixture.item("a.png", png),
            fixture.item("b.png", png) { withUnsafeCurrentTask { $0?.cancel() } },
            fixture.item("c.png", png),
        ]
        let importer = fixture.importer
        let task = Task { try await importer.importPhotos(items, into: project.id) }
        await #expect(throws: CancellationError.self) { try await task.value }

        #expect(try await fixture.store.loadProject(project.id) == project)
        #expect(try fixture.leftoverItemFiles().isEmpty)
    }

    @Test func importsStayBoundToTheirOriginatingProject() async throws {
        let fixture = try Fixture()
        let store = fixture.store
        let first = try await store.createProject(name: "First")
        let second = try await store.createProject(name: "Second")
        let png = try #require(Self.image(.png, width: 4, height: 4))

        let empty = try await fixture.importer.importPhotos([FakeItem](), into: first.id)
        #expect(empty.projectID == first.id && empty.imported.isEmpty && empty.failures.isEmpty)
        #expect(empty.project == first)

        let report = try await fixture.importer.importPhotos([fixture.item("a.png", png)], into: first.id)
        #expect(report.projectID == first.id)
        #expect(report.project.id == first.id)
        #expect(try await store.loadProject(second.id) == second)

        // The destination is deleted while photos are still loading: nothing is recreated.
        let late = try await fixture.importer.importPhotos([fixture.item("late-0.png", png)], into: second.id).project
        await #expect(throws: ProjectStoreError.projectNotFound(second.id)) {
            try await fixture.importer.importPhotos([
                fixture.item("late-1.png", png) { try await store.deleteProject(late.id) },
            ], into: second.id)
        }
        #expect(try await store.listProjects().projects.map(\.id) == [first.id])
        #expect(try fixture.leftoverItemFiles().isEmpty)
        await #expect(throws: ProjectStoreError.projectNotFound(second.id)) {
            try await fixture.importer.importPhotos([fixture.item("late-2.png", png)], into: second.id)
        }
    }
}
