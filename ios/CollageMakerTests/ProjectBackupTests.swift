import CoreGraphics
import Foundation
import ImageIO
import Testing
import UniformTypeIdentifiers
@testable import CollageMaker

/// Duplicate, backup and restore through the public `ProjectStore` API on a real temporary
/// directory. Photos are small PNGs generated at runtime, because restore decodes every original.
struct ProjectBackupTests {
    private final class Fixture {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "ProjectBackupTests-\(UUID().uuidString)", directoryHint: .isDirectory)
        let catalog: LayoutCatalog

        init() throws {
            catalog = try LayoutCatalog()
            try FileManager.default.createDirectory(at: sourcesURL, withIntermediateDirectories: true)
        }

        deinit { try? FileManager.default.removeItem(at: root) }

        var sourcesURL: URL { root.appending(path: "Sources", directoryHint: .isDirectory) }
        var backupsURL: URL { root.appending(path: "Backups", directoryHint: .isDirectory) }

        /// A fresh store on the same roots, as after an app relaunch.
        func store() -> ProjectStore {
            ProjectStore(
                rootURL: root.appending(path: "Store", directoryHint: .isDirectory),
                catalog: catalog, temporaryBackupRoot: backupsURL
            )
        }

        /// A solid-color PNG whose size and color differ per index, so every original's bytes differ.
        func png(_ index: Int, width: Int, height: Int) throws -> PhotoImportSource {
            let pixel: [UInt8] = [UInt8(40 * index % 256), UInt8(255 - 30 * index % 256), 90, 255]
            let bytes = Array((0..<(width * height)).map { _ in pixel }.joined())
            let url = sourcesURL.appending(path: "photo-\(index).png")
            guard let provider = CGDataProvider(data: Data(bytes) as CFData),
                  let image = CGImage(
                    width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!,
                    bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                    provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent
                  ),
                  let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
                throw CocoaError(.fileWriteUnknown)
            }
            CGImageDestinationAddImage(destination, image, nil)
            guard CGImageDestinationFinalize(destination) else { throw CocoaError(.fileWriteUnknown) }
            return PhotoImportSource(fileURL: url, pixelWidth: width, pixelHeight: height)
        }

        /// A file of `bytes` zero bytes that occupies almost no disk space.
        func sparseFile(named name: String, bytes: Int) throws -> URL {
            let url = sourcesURL.appending(path: name)
            FileManager.default.createFile(atPath: url.path(percentEncoded: false), contents: nil)
            let handle = try FileHandle(forWritingTo: url)
            try handle.truncate(atOffset: UInt64(bytes))
            try handle.close()
            return url
        }

        /// A three-photo project with swapped slots, one edited transform and custom settings.
        func editedProject(in store: ProjectStore) async throws -> CollageProject {
            let created = try await store.createProject(name: "Lake weekend")
            let sources = try [png(1, width: 40, height: 30), png(2, width: 24, height: 36), png(3, width: 50, height: 20)]
            var project = try await store.importPhotos(sources, into: created.id).project
            let areas = project.positions.map(\.area)
            try project.swapPhotos(fromArea: areas[0], toArea: areas[2])
            project.positions[1].transform = PhotoTransform(positionX: 0.2, positionY: 0.9, rotationDegrees: -90, scale: 1.75)
            project.settings = CollageSettings(gap: 14, background: .color(RGBAColor(red: 0.3, green: 0.1, blue: 0.5, alpha: 0.6)), borderRadius: 10)
            return try await store.saveProject(project)
        }

        func originalBytes(_ store: ProjectStore, _ project: CollageProject, area: String) async throws -> Data {
            let photoID = try #require(project.positions.first { $0.area == area }).photoID
            return try Data(contentsOf: await store.originalURL(photoID: photoID, in: project.id))
        }

        func stagingEntries(_ store: ProjectStore) -> [String] {
            let staging = store.rootURL.appending(path: "Staging").path(percentEncoded: false)
            return (try? FileManager.default.contentsOfDirectory(atPath: staging)) ?? []
        }

        func backupEntries() -> [String] {
            (try? FileManager.default.contentsOfDirectory(atPath: backupsURL.path(percentEncoded: false))) ?? []
        }
    }

    /// The copy must be a separate project whose every slot shows the same bytes and transform.
    private func expectSameContent(
        _ copy: CollageProject, as source: CollageProject, fixture: Fixture, store: ProjectStore
    ) async throws {
        #expect(copy.id != source.id)
        #expect(Set(copy.photos.map(\.id)).isDisjoint(with: source.photos.map(\.id)))
        #expect(copy.selectedLayoutID == source.selectedLayoutID)
        #expect(copy.settings == source.settings)
        for position in source.positions {
            let copied = try #require(copy.positions.first { $0.area == position.area })
            #expect(copied.transform == position.transform)
            let sourcePhoto = try #require(source.photos.first { $0.id == position.photoID })
            let copiedPhoto = try #require(copy.photos.first { $0.id == copied.photoID })
            #expect((copiedPhoto.pixelWidth, copiedPhoto.pixelHeight) == (sourcePhoto.pixelWidth, sourcePhoto.pixelHeight))
            let expected = try await fixture.originalBytes(store, source, area: position.area)
            #expect(try await fixture.originalBytes(store, copy, area: position.area) == expected)
        }
    }

    @Test func editedProjectRoundTripsThroughBackupIntoANewIndependentProject() async throws {
        let fixture = try Fixture()
        let store = fixture.store()
        let source = try await fixture.editedProject(in: store)

        let backup = try await store.backupProject(source.id)
        #expect(backup.lastPathComponent == "Lake weekend backup.json")
        #expect(backup.path(percentEncoded: false).hasPrefix(fixture.backupsURL.path(percentEncoded: false)))

        // Restore with a fresh store instance, as after relaunch.
        let reopened = fixture.store()
        let restored = try await reopened.restoreProject(from: backup)
        #expect(restored.name == "Lake weekend")
        try await expectSameContent(restored, as: source, fixture: fixture, store: reopened)
        // Restoring twice makes two distinct projects; it never overwrites.
        let again = try await reopened.restoreProject(from: backup)
        #expect(again.id != restored.id)
        #expect(Set(again.photos.map(\.id)).isDisjoint(with: restored.photos.map(\.id)))

        // Editing or deleting the source does not touch the restored copy.
        var changed = try await reopened.loadProject(source.id)
        changed.positions[0].transform = PhotoTransform(scale: 3)
        _ = try await reopened.saveProject(changed)
        try await reopened.deleteProject(source.id)
        let reloaded = try await fixture.store().loadProject(restored.id)
        #expect(reloaded.positions == restored.positions)
        for photo in reloaded.photos {
            _ = try await reopened.originalURL(photoID: photo.id, in: restored.id)
        }
        #expect(try await reopened.listProjects().projects.count == 2)

        reopened.discardBackup(at: backup)
        #expect(!FileManager.default.fileExists(atPath: backup.path(percentEncoded: false)))
        #expect(fixture.backupEntries().isEmpty)
    }

    @Test func duplicateCopiesBytesWithNewIDsAndFitsTheName() async throws {
        let fixture = try Fixture()
        let store = fixture.store()
        let source = try await fixture.editedProject(in: store)

        let copy = try await store.duplicateProject(source.id)
        #expect(copy.name == "Lake weekend copy")
        try await expectSameContent(copy, as: source, fixture: fixture, store: store)
        try await store.deleteProject(source.id)
        let survivor = try await fixture.store().loadProject(copy.id)
        #expect(survivor == copy)

        let long = try await store.renameProject(copy.id, to: String(repeating: "n", count: 200))
        let longCopy = try await store.duplicateProject(long.id)
        #expect(longCopy.name.count == 200)
        #expect(longCopy.name.hasSuffix("n copy"))
    }

    @Test func missingOriginalsBlockBackupAndDuplicateWithoutPartialResults() async throws {
        let fixture = try Fixture()
        let store = fixture.store()
        let source = try await fixture.editedProject(in: store)
        let missing = source.photos[1]
        try FileManager.default.removeItem(at: await store.originalURL(photoID: missing.id, in: source.id))

        await #expect(throws: ProjectStoreError.missingOriginal(missing.id)) { try await store.backupProject(source.id) }
        await #expect(throws: ProjectStoreError.missingOriginal(missing.id)) { try await store.duplicateProject(source.id) }
        #expect(fixture.backupEntries().isEmpty)
        #expect(fixture.stagingEntries(store).isEmpty)
        #expect(try await store.listProjects().projects.map(\.id) == [source.id])
    }

    @Test func backupRefusesToWriteAFileRestoreWouldReject() async throws {
        let fixture = try Fixture()
        let store = fixture.store()
        let project = try await store.createProject(name: "Huge")
        // 151 MiB of original is about 201 MiB once base64-encoded: over the 200 MiB cap.
        let huge = try fixture.sparseFile(named: "huge.heic", bytes: 151 * 1024 * 1024)
        _ = try await store.importPhotos([PhotoImportSource(fileURL: huge, pixelWidth: 10, pixelHeight: 10)], into: project.id)

        await #expect(throws: ProjectBackupError.tooLarge(limit: ProjectBackup.maximumFileBytes)) {
            try await store.backupProject(project.id)
        }
        #expect(fixture.backupEntries().isEmpty)
    }

    @Test func invalidBackupsLeaveTheLibraryUnchanged() async throws {
        let fixture = try Fixture()
        let store = fixture.store()
        let source = try await fixture.editedProject(in: store)
        let backupURL = try await store.backupProject(source.id)
        let valid = try JSONDecoder().decode(ProjectBackup.self, from: Data(contentsOf: backupURL))
        let before = try await store.listProjects()

        func write(_ backup: ProjectBackup, _ name: String) throws -> URL {
            let url = fixture.sourcesURL.appending(path: name)
            try ProjectBackup.encoder.encode(backup).write(to: url)
            return url
        }
        func rebuilt(project: CollageProject? = nil, originals: [ProjectBackup.Original]? = nil) -> ProjectBackup {
            ProjectBackup(createdAt: valid.createdAt, project: project ?? valid.project, originals: originals ?? valid.originals)
        }
        let notImage = Data("not an image".utf8)
        var wrongSize = valid.project
        wrongSize.photos[0] = ProjectPhoto(
            id: wrongSize.photos[0].id, imageFilename: wrongSize.photos[0].imageFilename,
            pixelWidth: wrongSize.photos[0].pixelWidth + 1, pixelHeight: wrongSize.photos[0].pixelHeight
        )
        var badLayout = valid.project
        badLayout.positions.removeLast()
        var wrongFormat = valid
        wrongFormat.format = "com.example.other"
        var futureVersion = valid
        futureVersion.version = 2

        let cases: [(URL, ProjectBackupError)] = [
            (try fixture.sparseFile(named: "oversized.json", bytes: ProjectBackup.maximumFileBytes + 1),
             .tooLarge(limit: ProjectBackup.maximumFileBytes)),
            (try { let url = fixture.sourcesURL.appending(path: "garbage.json"); try Data("{oops".utf8).write(to: url); return url }(),
             .notABackup),
            (fixture.sourcesURL.appending(path: "absent.json"), .notABackup),
            (try write(wrongFormat, "format.json"), .notABackup),
            (try write(futureVersion, "version.json"), .unsupportedVersion(2)),
        ]
        for (url, error) in cases {
            await #expect(throws: error) { try await store.restoreProject(from: url) }
        }

        let invalid: [(String, ProjectBackup)] = [
            ("pixel size", rebuilt(project: wrongSize)),
            ("layout", rebuilt(project: badLayout)),
            ("missing original", rebuilt(originals: Array(valid.originals.dropLast()))),
            ("duplicate original", rebuilt(originals: valid.originals + [valid.originals[0]])),
            ("extra original", rebuilt(originals: valid.originals + [.init(photoID: UUID(), data: valid.originals[0].data)])),
            // The last photo is staged after two valid ones, so this also proves staging is discarded.
            ("undecodable", rebuilt(originals: valid.originals.dropLast() + [.init(photoID: valid.originals.last!.photoID, data: notImage)])),
        ]
        for (name, backup) in invalid {
            let url = try write(backup, "\(name).json")
            await #expect(throws: ProjectBackupError.self, "\(name)") { try await store.restoreProject(from: url) }
            if case .some = try? await store.restoreProject(from: url) { Issue.record("\(name) restored") }
        }

        #expect(fixture.stagingEntries(store).isEmpty)
        #expect(try await fixture.store().listProjects() == before)
        // The intact backup still restores after all those failures.
        let restored = try await store.restoreProject(from: write(valid, "valid.json"))
        try await expectSameContent(restored, as: source, fixture: fixture, store: store)
    }

    @Test func discardBackupOnlyDeletesBackupFolders() async throws {
        let fixture = try Fixture()
        let store = fixture.store()
        let project = try await store.createProject(name: "a/b:c")
        let backup = try await store.backupProject(project.id)
        #expect(backup.lastPathComponent == "a_b_c backup.json")

        let outside = fixture.sourcesURL.appending(path: "keep.json")
        try Data("{}".utf8).write(to: outside)
        store.discardBackup(at: outside)
        store.discardBackup(at: fixture.backupsURL.appending(path: "loose.json"))
        #expect(FileManager.default.fileExists(atPath: outside.path(percentEncoded: false)))
        #expect(FileManager.default.fileExists(atPath: backup.path(percentEncoded: false)))

        store.discardBackup(at: backup)
        #expect(fixture.backupEntries().isEmpty)
        #expect(FileManager.default.fileExists(atPath: fixture.backupsURL.path(percentEncoded: false)))
    }
}
