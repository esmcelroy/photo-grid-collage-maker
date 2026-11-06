import Foundation
import Testing
@testable import CollageMaker

/// Exercises `ProjectStore` through its public API on a real temporary directory.
/// Failures are produced with real filesystem permissions, not mocks. Sources are synthetic
/// byte files generated at runtime; the store copies bytes and never decodes them.
struct ProjectStoreTests {
    private final class Fixture {
        let root = FileManager.default.temporaryDirectory
            .appending(path: "ProjectStoreTests-\(UUID().uuidString)", directoryHint: .isDirectory)
        let catalog: LayoutCatalog

        init() throws {
            catalog = try LayoutCatalog()
            try FileManager.default.createDirectory(at: sourcesURL, withIntermediateDirectories: true)
        }

        deinit {
            // Restore write access to anything a test locked, then clean up.
            if let paths = FileManager.default.enumerator(atPath: root.path(percentEncoded: false)) {
                for case let path as String in paths {
                    try? setWritable(root.appending(path: path), true)
                }
            }
            try? FileManager.default.removeItem(at: root)
        }

        var sourcesURL: URL { root.appending(path: "Sources", directoryHint: .isDirectory) }

        /// A fresh store instance on the same root, as after an app relaunch.
        func store() -> ProjectStore {
            ProjectStore(rootURL: root.appending(path: "Store", directoryHint: .isDirectory), catalog: catalog)
        }

        func source(_ index: Int, width: Int = 400, height: Int = 300) throws -> PhotoImportSource {
            let url = sourcesURL.appending(path: "source-\(index).heic")
            try sourceBytes(index).write(to: url)
            return PhotoImportSource(fileURL: url, pixelWidth: width, pixelHeight: height)
        }

        func sourceBytes(_ index: Int) -> Data {
            Data((0..<(2048 + index)).map { UInt8(truncatingIfNeeded: $0 &* 31 &+ index) })
        }

        func setWritable(_ url: URL, _ writable: Bool) throws {
            try FileManager.default.setAttributes(
                [.posixPermissions: writable ? 0o755 : 0o555], ofItemAtPath: url.path(percentEncoded: false)
            )
        }

        func originalsFiles(_ store: ProjectStore, _ projectID: UUID) throws -> Set<String> {
            let url = store.directoryURL(for: projectID).appending(path: ProjectStore.originalsDirectoryName)
            return Set(try FileManager.default.contentsOfDirectory(atPath: url.path(percentEncoded: false)))
        }
    }

    @Test func reopenedStorePreservesProjectsOriginalsAndTransforms() async throws {
        let fixture = try Fixture()
        let store = fixture.store()
        let created = try await store.createProject(name: "  Lake weekend ")
        #expect(created.name == "Lake weekend")
        let sources = try (0..<3).map { try fixture.source($0, width: 300 + $0, height: 200) }
        let result = try await store.importPhotos(sources, into: created.id)
        #expect(result.imported.count == 3)
        #expect(result.failures.isEmpty)
        #expect(result.project.selectedLayoutID == fixture.catalog.layouts(forPhotoCount: 3).first?.id)

        var edited = result.project
        let areas = edited.positions.map(\.area)
        try edited.swapPhotos(fromArea: areas[0], toArea: areas[2])
        edited.positions[1].transform = PhotoTransform(positionX: 0.25, positionY: 0.8, rotationDegrees: 90, scale: 1.5)
        edited.settings = CollageSettings(gap: 12, background: .color(RGBAColor(red: 0.4, green: 0.2, blue: 0.6)), borderRadius: 6)
        let saved = try await store.saveProject(edited)

        let reopened = fixture.store()
        let library = try await reopened.listProjects()
        #expect(library.projects.map(\.id) == [created.id])
        #expect(library.projects.first?.photoCount == 3)
        #expect(library.unreadable.isEmpty)
        let loaded = try await reopened.loadProject(created.id)
        #expect(loaded == saved)
        #expect(loaded.positions[1].transform.rotationDegrees == 90)
        #expect(loaded.photos.map(\.pixelWidth) == [300, 301, 302])
        for (index, photo) in result.imported.enumerated() {
            let url = try await reopened.originalURL(photoID: photo.id, in: created.id)
            #expect(try Data(contentsOf: url) == fixture.sourceBytes(index), "original \(index) is byte-identical")
        }
    }

    @Test func failedWritesLeaveTheLastCommittedProjectIntact() async throws {
        let fixture = try Fixture()
        let store = fixture.store()
        let project = try await store.createProject(name: "Original")
        let committed = try await store.importPhotos([fixture.source(0)], into: project.id).project
        let committedFiles = try fixture.originalsFiles(store, project.id)
        let next = try fixture.source(1)

        // A read-only project folder lets the original copy succeed but makes the manifest
        // replacement fail, which is the case that must not leak a half-committed import.
        try fixture.setWritable(store.directoryURL(for: project.id), false)
        await #expect(throws: (any Error).self) {
            try await store.importPhotos([next], into: project.id)
        }
        await #expect(throws: (any Error).self) {
            try await store.renameProject(project.id, to: "Renamed")
        }
        try fixture.setWritable(store.directoryURL(for: project.id), true)
        // Checked before any load, which would also discard unreferenced files.
        #expect(try fixture.originalsFiles(store, project.id) == committedFiles)

        var invalid = committed
        invalid.positions[0].transform.scale = 50
        await #expect(throws: CollageValidationError.self) {
            try await store.saveProject(invalid)
        }

        let reopened = fixture.store()
        #expect(try await reopened.loadProject(project.id) == committed)
        #expect(try fixture.originalsFiles(reopened, project.id) == committedFiles)
        let retried = try await reopened.importPhotos([next], into: project.id)
        #expect(retried.project.photos.count == 2)
    }

    @Test func operationsStayBoundToTheProjectTheyName() async throws {
        let fixture = try Fixture()
        let store = fixture.store()
        let first = try await store.createProject(name: "First")
        let second = try await store.createProject(name: "Second")

        let staleSecond = try await store.loadProject(second.id)
        _ = try await store.importPhotos([fixture.source(0), fixture.source(1)], into: first.id)
        _ = try await store.importPhotos([fixture.source(2)], into: second.id)
        _ = try await store.renameProject(second.id, to: "Second, renamed")

        // A stale copy cannot drop photos imported after it was loaded.
        await #expect(throws: ProjectStoreError.photosChanged) {
            try await store.saveProject(staleSecond)
        }

        let loadedFirst = try await store.loadProject(first.id)
        let loadedSecond = try await store.loadProject(second.id)
        #expect(loadedFirst.name == "First")
        #expect(loadedFirst.photos.count == 2)
        #expect(loadedSecond.name == "Second, renamed")
        #expect(loadedSecond.photos.count == 1)
        #expect(Set(loadedFirst.photos.map(\.id)).isDisjoint(with: loadedSecond.photos.map(\.id)))

        // Late work for a deleted project fails instead of recreating it.
        try await store.deleteProject(first.id)
        await #expect(throws: ProjectStoreError.projectNotFound(first.id)) {
            try await store.importPhotos([fixture.source(3)], into: first.id)
        }
        await #expect(throws: ProjectStoreError.projectNotFound(first.id)) {
            try await store.renameProject(first.id, to: "Back")
        }
        #expect(!FileManager.default.fileExists(atPath: store.directoryURL(for: first.id).path(percentEncoded: false)))
        #expect(try await store.listProjects().projects.map(\.id) == [second.id])
        #expect(try await store.loadProject(second.id) == loadedSecond)
    }

    @Test func overlappingImportsStopAtSixteenAndReportEachSource() async throws {
        let fixture = try Fixture()
        let store = fixture.store()
        let project = try await store.createProject()

        let missing = PhotoImportSource(
            fileURL: fixture.sourcesURL.appending(path: "missing.jpg"), pixelWidth: 10, pixelHeight: 10
        )
        let rejected = try await store.importPhotos([missing, fixture.source(99, width: 0)], into: project.id)
        #expect(rejected.imported.isEmpty)
        #expect(rejected.failures.map(\.sourceIndex) == [0, 1])
        if case .unreadableSource = rejected.failures[0].reason {} else {
            Issue.record("missing source should be unreadable, got \(rejected.failures[0].reason)")
        }
        #expect(rejected.failures[1].reason == .invalidPixelSize)

        let batches = try (0..<5).map { batch in try (0..<4).map { try fixture.source(batch * 4 + $0) } }
        let results = try await withThrowingTaskGroup(of: PhotoImportResult.self) { group in
            for batch in batches {
                group.addTask { try await store.importPhotos(batch, into: project.id) }
            }
            return try await group.reduce(into: []) { $0.append($1) }
        }
        #expect(results.map(\.imported.count).reduce(0, +) == 16)
        let failures = results.flatMap(\.failures)
        #expect(failures.count == 4)
        #expect(failures.allSatisfy { $0.reason == .photoLimitReached })

        let loaded = try await store.loadProject(project.id)
        #expect(loaded.photos.count == 16)
        #expect(Set(loaded.photos.map(\.id)) == Set(results.flatMap(\.imported).map(\.id)))
        #expect(loaded.selectedLayoutID == fixture.catalog.layouts(forPhotoCount: 16).first?.id)
        #expect(try fixture.originalsFiles(store, project.id).count == 16)
    }

    @Test func importKeepsDurableCopiesOfRegularLocalFilesOnly() async throws {
        let fixture = try Fixture()
        let store = fixture.store()
        let project = try await store.createProject()
        let linkTarget = try fixture.source(0)
        let link = fixture.sourcesURL.appending(path: "link.heic")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: linkTarget.fileURL)
        let folder = fixture.sourcesURL.appending(path: "folder.jpg", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let regular = try fixture.source(1)

        let result = try await store.importPhotos([
            PhotoImportSource(fileURL: link, pixelWidth: 400, pixelHeight: 300),
            PhotoImportSource(fileURL: URL(string: "https://example.com/photo.jpg")!, pixelWidth: 400, pixelHeight: 300),
            PhotoImportSource(fileURL: folder, pixelWidth: 400, pixelHeight: 300),
            regular,
        ], into: project.id)
        #expect(result.failures.map(\.sourceIndex) == [0, 1, 2])
        #expect(result.failures.allSatisfy { if case .unreadableSource = $0.reason { true } else { false } })
        #expect(result.imported.count == 1)

        // Picker temporary files disappear after import; the committed original must not depend on them.
        for url in [linkTarget.fileURL, link, regular.fileURL] {
            try FileManager.default.removeItem(at: url)
        }
        let reopened = fixture.store()
        #expect(try await reopened.loadProject(project.id).photos == result.imported)
        let original = try await reopened.originalURL(photoID: result.imported[0].id, in: project.id)
        #expect(try Data(contentsOf: original) == fixture.sourceBytes(1))
        #expect(try fixture.originalsFiles(reopened, project.id).count == 1)
    }

    @Test func damagedProjectsAndFailedDeletesAreRecoverable() async throws {
        let fixture = try Fixture()
        let store = fixture.store()
        let healthy = try await store.createProject(name: "Healthy")
        let corrupt = try await store.createProject(name: "Corrupt")
        let photos = try await store.importPhotos([fixture.source(0), fixture.source(1)], into: healthy.id).imported
        try Data("not a manifest".utf8).write(
            to: store.directoryURL(for: corrupt.id).appending(path: ProjectStore.manifestFilename)
        )
        let missingURL = try await store.originalURL(photoID: photos[0].id, in: healthy.id)
        try FileManager.default.removeItem(at: missingURL)

        let reopened = fixture.store()
        let library = try await reopened.listProjects()
        #expect(library.projects.map(\.id) == [healthy.id])
        #expect(library.projects.first?.missingPhotoCount == 1)
        #expect(library.unreadable.map(\.id) == [corrupt.id])
        let loadError = await #expect(throws: ProjectStoreError.self) {
            try await reopened.loadProject(corrupt.id)
        }
        if case .unreadableProject(corrupt.id, _) = loadError {} else {
            Issue.record("corrupt manifest should be unreadable, got \(String(describing: loadError))")
        }
        await #expect(throws: ProjectStoreError.missingOriginal(photos[0].id)) {
            try await reopened.originalURL(photoID: photos[0].id, in: healthy.id)
        }
        _ = try await reopened.originalURL(photoID: photos[1].id, in: healthy.id)

        let repaired = try await reopened.removePhoto(photos[0].id, from: healthy.id)
        #expect(repaired.photos.map(\.id) == [photos[1].id])
        #expect(repaired.selectedLayoutID == fixture.catalog.layouts(forPhotoCount: 1).first?.id)
        try await reopened.deleteProject(corrupt.id)

        // A delete that cannot move the folder fails without losing the project.
        let projectsFolder = reopened.directoryURL(for: healthy.id).deletingLastPathComponent()
        try fixture.setWritable(projectsFolder, false)
        await #expect(throws: (any Error).self) {
            try await reopened.deleteProject(healthy.id)
        }
        try fixture.setWritable(projectsFolder, true)
        #expect(try await reopened.loadProject(healthy.id) == repaired)

        try await reopened.deleteProject(healthy.id)
        #expect(try await reopened.listProjects() == ProjectLibrary(projects: [], unreadable: []))
    }
}
