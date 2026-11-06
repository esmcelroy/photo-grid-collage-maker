import Foundation

/// A picker file the importer has already copied to a local URL, plus its oriented pixel size.
/// The store copies the bytes unchanged; it never decodes or re-encodes originals.
struct PhotoImportSource: Equatable, Sendable {
    let fileURL: URL
    let pixelWidth: Int
    let pixelHeight: Int
}

struct PhotoImportFailure: Equatable, Sendable {
    enum Reason: Equatable, Sendable {
        case photoLimitReached
        case invalidPixelSize
        case unreadableSource(String)
    }

    /// Index into the `sources` array passed to `importPhotos`.
    let sourceIndex: Int
    let reason: Reason
}

struct PhotoImportResult: Sendable {
    /// The committed project after the import.
    let project: CollageProject
    /// Photos that were copied and committed, in source order.
    let imported: [ProjectPhoto]
    let failures: [PhotoImportFailure]
}

struct ProjectSummary: Equatable, Identifiable, Sendable {
    let id: UUID
    let name: String
    let createdAt: Date
    let updatedAt: Date
    let photoCount: Int
    /// Photos whose original file is missing; the project still loads and can remove them.
    let missingPhotoCount: Int
}

/// A project folder whose manifest could not be read or validated. It can still be deleted.
struct UnreadableProject: Equatable, Identifiable, Sendable {
    let id: UUID
    let reason: String
}

struct ProjectLibrary: Equatable, Sendable {
    /// Most recently updated first.
    let projects: [ProjectSummary]
    let unreadable: [UnreadableProject]
}

enum ProjectStoreError: Error, Equatable, Sendable {
    case projectNotFound(UUID)
    case unreadableProject(UUID, reason: String)
    case photoNotFound(UUID)
    case missingOriginal(UUID)
    case invalidName
    /// `save` cannot add or remove photos; use `importPhotos` or `removePhoto`.
    case photosChanged
}

/// Local, on-device project persistence.
///
/// Layout under `rootURL`:
/// - `Projects/<project UUID>/project.json`: the versioned `CollageProject` manifest.
/// - `Projects/<project UUID>/Originals/<photo UUID>.<ext>`: byte-for-byte copies of imported files.
/// - `Staging/` and `Trash/`: transient folders for atomic creation and deletion.
///
/// Every operation names its project explicitly; there is no active-project state. Each method
/// runs to completion without suspending, so calls on one store are serialized. Use one store
/// instance per root.
///
/// Manifests are replaced atomically, after any new originals are in place, and new originals
/// never reuse an existing file name. A failed write therefore leaves the last committed manifest
/// and its originals intact. Files are removed only after a manifest that no longer references
/// them has been committed.
///
/// Backup policy is not decided: files in Application Support are included in device backups
/// unless excluded, and this store does not exclude them.
actor ProjectStore {
    static let manifestFilename = "project.json"
    static let originalsDirectoryName = "Originals"
    static let defaultProjectName = "Untitled collage"
    static let maximumNameLength = 200

    nonisolated let rootURL: URL
    private let catalog: LayoutCatalog
    private let fileManager = FileManager.default

    init(rootURL: URL, catalog: LayoutCatalog) {
        self.rootURL = rootURL
        self.catalog = catalog
    }

    /// The production root: `Application Support/CollageProjects` in the app container.
    static func applicationSupportRootURL() throws -> URL {
        try FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appending(path: "CollageProjects", directoryHint: .isDirectory)
    }

    /// The folder holding a project's manifest and originals.
    nonisolated func directoryURL(for projectID: UUID) -> URL {
        projectsURL.appending(path: projectID.uuidString, directoryHint: .isDirectory)
    }

    // MARK: - Library

    func createProject(name: String = ProjectStore.defaultProjectName) throws -> CollageProject {
        let name = try Self.validatedName(name)
        try prepareDirectories()
        let now = Date()
        let project = CollageProject(id: UUID(), name: name, createdAt: now, updatedAt: now)
        let staging = stagingURL.appending(path: project.id.uuidString, directoryHint: .isDirectory)
        do {
            try fileManager.createDirectory(
                at: staging.appending(path: Self.originalsDirectoryName, directoryHint: .isDirectory),
                withIntermediateDirectories: true
            )
            try write(project, to: staging.appending(path: Self.manifestFilename))
            // The project appears in the library only once it is complete.
            try fileManager.moveItem(at: staging, to: directoryURL(for: project.id))
        } catch {
            try? fileManager.removeItem(at: staging)
            throw error
        }
        return project
    }

    /// Lists readable projects and reports damaged ones separately, so one bad folder
    /// never hides the rest of the library.
    func listProjects() throws -> ProjectLibrary {
        try prepareDirectories()
        // No operation is in flight while this runs, so leftovers are safe to discard.
        removeContents(of: stagingURL)
        removeContents(of: trashURL)

        var projects: [ProjectSummary] = []
        var unreadable: [UnreadableProject] = []
        let entries = try fileManager.contentsOfDirectory(
            at: projectsURL, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]
        )
        for entry in entries {
            guard let id = UUID(uuidString: entry.lastPathComponent) else { continue }
            do {
                let project = try readManifest(id)
                let missing = project.photos.filter { !isRegularFile(originalURL(project.id, $0)) }.count
                projects.append(ProjectSummary(
                    id: id, name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt,
                    photoCount: project.photos.count, missingPhotoCount: missing
                ))
            } catch let ProjectStoreError.unreadableProject(_, reason) {
                unreadable.append(UnreadableProject(id: id, reason: reason))
            } catch ProjectStoreError.projectNotFound {
                continue
            }
        }
        projects.sort { ($0.updatedAt, $0.id.uuidString) > ($1.updatedAt, $1.id.uuidString) }
        unreadable.sort { $0.id.uuidString < $1.id.uuidString }
        return ProjectLibrary(projects: projects, unreadable: unreadable)
    }

    func loadProject(_ projectID: UUID) throws -> CollageProject {
        let project = try readManifest(projectID)
        removeUnreferencedOriginals(of: project)
        return project
    }

    func renameProject(_ projectID: UUID, to name: String) throws -> CollageProject {
        var project = try readManifest(projectID)
        project.name = try Self.validatedName(name)
        project.updatedAt = Date()
        try write(project)
        return project
    }

    /// Saves layout, slot assignments, transforms, settings and name. The photo list must match
    /// the stored one, so a stale copy cannot drop photos imported since it was loaded.
    func saveProject(_ project: CollageProject) throws -> CollageProject {
        var stored = try readManifest(project.id)
        guard stored.photos == project.photos else { throw ProjectStoreError.photosChanged }
        stored.name = try Self.validatedName(project.name)
        stored.selectedLayoutID = project.selectedLayoutID
        stored.positions = project.positions
        stored.settings = project.settings
        stored.updatedAt = Date()
        try write(stored)
        return stored
    }

    /// Removes the project from the library. Works for unreadable projects too.
    /// Confirmation is the caller's responsibility.
    func deleteProject(_ projectID: UUID) throws {
        let directory = directoryURL(for: projectID)
        guard fileManager.fileExists(atPath: directory.path(percentEncoded: false)) else {
            throw ProjectStoreError.projectNotFound(projectID)
        }
        try prepareDirectories()
        let trashed = trashURL.appending(path: "\(projectID.uuidString)-\(UUID().uuidString)")
        try fileManager.moveItem(at: directory, to: trashed)
        // Already gone from the library; anything left behind is purged by `listProjects`.
        try? fileManager.removeItem(at: trashed)
    }

    // MARK: - Photos

    /// The durable original for a photo, for decoding by preview or export.
    /// The URL stays valid until the photo or its project is removed.
    func originalURL(photoID: UUID, in projectID: UUID) throws -> URL {
        let project = try readManifest(projectID)
        guard let photo = project.photos.first(where: { $0.id == photoID }) else {
            throw ProjectStoreError.photoNotFound(photoID)
        }
        let url = originalURL(projectID, photo)
        guard isRegularFile(url) else { throw ProjectStoreError.missingOriginal(photoID) }
        return url
    }

    /// Copies sources into the project and commits them in one manifest write.
    ///
    /// Sources beyond the 16-photo limit fail with `.photoLimitReached`. Because the store is
    /// serialized, overlapping imports into one project can never exceed the limit. Only
    /// committed photos are reported as imported; if the manifest write fails, this throws and
    /// the copies are removed.
    ///
    /// Adding photos changes the photo count, so like the web editor this selects the first
    /// layout for the new count and assigns photos to its areas in order, resetting transforms.
    func importPhotos(_ sources: [PhotoImportSource], into projectID: UUID) throws -> PhotoImportResult {
        var project = try readManifest(projectID)
        let originals = directoryURL(for: projectID)
            .appending(path: Self.originalsDirectoryName, directoryHint: .isDirectory)
        try fileManager.createDirectory(at: originals, withIntermediateDirectories: true)

        var imported: [ProjectPhoto] = []
        var copies: [URL] = []
        var failures: [PhotoImportFailure] = []
        for (index, source) in sources.enumerated() {
            guard project.photos.count + imported.count < CollageProject.maximumPhotos else {
                failures.append(PhotoImportFailure(sourceIndex: index, reason: .photoLimitReached))
                continue
            }
            guard source.pixelWidth > 0, source.pixelHeight > 0 else {
                failures.append(PhotoImportFailure(sourceIndex: index, reason: .invalidPixelSize))
                continue
            }
            // copyItem would copy a symlink as a link, leaving the original dependent on its target.
            guard isRegularFile(source.fileURL) else {
                failures.append(PhotoImportFailure(
                    sourceIndex: index, reason: .unreadableSource("Source is not a regular local file.")
                ))
                continue
            }
            let photoID = UUID()
            let filename = "\(photoID.uuidString).\(Self.fileExtension(of: source.fileURL))"
            let destination = originals.appending(path: filename)
            do {
                try fileManager.copyItem(at: source.fileURL, to: destination)
                // Guards against the source being replaced between the check and the copy.
                guard isRegularFile(destination) else { throw CocoaError(.fileReadCorruptFile) }
                copies.append(destination)
                imported.append(ProjectPhoto(
                    id: photoID, imageFilename: filename,
                    pixelWidth: source.pixelWidth, pixelHeight: source.pixelHeight
                ))
            } catch {
                try? fileManager.removeItem(at: destination)
                failures.append(PhotoImportFailure(
                    sourceIndex: index, reason: .unreadableSource(error.localizedDescription)
                ))
            }
        }
        guard !imported.isEmpty else {
            return PhotoImportResult(project: project, imported: [], failures: failures)
        }

        project.photos += imported
        project.updatedAt = Date()
        do {
            try assignDefaultLayout(to: &project)
            try write(project)
        } catch {
            for copy in copies { try? fileManager.removeItem(at: copy) }
            throw error
        }
        return PhotoImportResult(project: project, imported: imported, failures: failures)
    }

    /// Removes one photo. Its original is deleted only after the new manifest is committed.
    /// The photo count changes, so the default layout for the new count is selected.
    func removePhoto(_ photoID: UUID, from projectID: UUID) throws -> CollageProject {
        var project = try readManifest(projectID)
        guard let index = project.photos.firstIndex(where: { $0.id == photoID }) else {
            throw ProjectStoreError.photoNotFound(photoID)
        }
        let removed = project.photos.remove(at: index)
        project.updatedAt = Date()
        try assignDefaultLayout(to: &project)
        try write(project)
        try? fileManager.removeItem(at: originalURL(projectID, removed))
        return project
    }

    // MARK: - Private

    private nonisolated var projectsURL: URL { rootURL.appending(path: "Projects", directoryHint: .isDirectory) }
    private nonisolated var stagingURL: URL { rootURL.appending(path: "Staging", directoryHint: .isDirectory) }
    private nonisolated var trashURL: URL { rootURL.appending(path: "Trash", directoryHint: .isDirectory) }

    private func originalURL(_ projectID: UUID, _ photo: ProjectPhoto) -> URL {
        directoryURL(for: projectID)
            .appending(path: Self.originalsDirectoryName, directoryHint: .isDirectory)
            .appending(path: photo.imageFilename)
    }

    private func prepareDirectories() throws {
        for url in [projectsURL, stagingURL, trashURL] {
            try fileManager.createDirectory(at: url, withIntermediateDirectories: true)
        }
    }

    private func readManifest(_ projectID: UUID) throws -> CollageProject {
        let directory = directoryURL(for: projectID)
        guard fileManager.fileExists(atPath: directory.path(percentEncoded: false)) else {
            throw ProjectStoreError.projectNotFound(projectID)
        }
        do {
            let data = try Data(contentsOf: directory.appending(path: Self.manifestFilename))
            let project = try JSONDecoder().decode(CollageProject.self, from: data)
            guard project.id == projectID else {
                throw CollageValidationError.invalid("Manifest ID does not match its folder.")
            }
            try project.validate(catalog: catalog)
            return project
        } catch {
            throw ProjectStoreError.unreadableProject(projectID, reason: String(describing: error))
        }
    }

    /// Validates, then atomically replaces the manifest (write to a temporary file, then rename).
    private func write(_ project: CollageProject, to url: URL? = nil) throws {
        try project.validate(catalog: catalog)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(project)
        try data.write(
            to: url ?? directoryURL(for: project.id).appending(path: Self.manifestFilename),
            options: .atomic
        )
    }

    private func assignDefaultLayout(to project: inout CollageProject) throws {
        guard !project.photos.isEmpty else {
            project.selectedLayoutID = nil
            project.positions = []
            return
        }
        guard let layout = catalog.layouts(forPhotoCount: project.photos.count).first else {
            throw CollageValidationError.invalid("No layout for \(project.photos.count) photos.")
        }
        project.selectedLayoutID = layout.id
        project.positions = zip(layout.areaNames, project.photos).map { area, photo in
            PhotoPosition(photoID: photo.id, area: area)
        }
    }

    /// Discards originals left by an import interrupted before its manifest was committed.
    private func removeUnreferencedOriginals(of project: CollageProject) {
        let originals = directoryURL(for: project.id)
            .appending(path: Self.originalsDirectoryName, directoryHint: .isDirectory)
        let referenced = Set(project.photos.map(\.imageFilename))
        let files = (try? fileManager.contentsOfDirectory(at: originals, includingPropertiesForKeys: nil)) ?? []
        for file in files where !referenced.contains(file.lastPathComponent) {
            try? fileManager.removeItem(at: file)
        }
    }

    private func removeContents(of directory: URL) {
        let entries = (try? fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        for entry in entries { try? fileManager.removeItem(at: entry) }
    }

    /// True only for a local URL naming a regular file itself, so symbolic links (even to regular
    /// files), directories and devices are rejected. Reads only the two type resource keys; no
    /// file-timestamp required-reason API is used.
    private func isRegularFile(_ url: URL) -> Bool {
        guard url.isFileURL else { return false }
        var url = url
        url.removeAllCachedResourceValues()
        guard let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey]) else {
            return false
        }
        return values.isRegularFile == true && values.isSymbolicLink != true
    }

    private static func validatedName(_ name: String) throws -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= maximumNameLength else { throw ProjectStoreError.invalidName }
        return trimmed
    }

    private static func fileExtension(of url: URL) -> String {
        let ext = url.pathExtension.lowercased()
        let safe = (1...8).contains(ext.count) && ext.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber) }
        return safe ? ext : "dat"
    }
}
