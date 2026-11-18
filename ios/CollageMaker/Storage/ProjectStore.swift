import Foundation
import UniformTypeIdentifiers

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
///
/// Project backup files (`backupProject`) are the app's own versioned JSON format with every
/// original embedded; see `ProjectBackup`. They are not compatible with web app backups.
actor ProjectStore {
    static let manifestFilename = "project.json"
    static let originalsDirectoryName = "Originals"
    static let defaultProjectName = "Untitled collage"
    static let maximumNameLength = 200

    nonisolated let rootURL: URL
    /// Where `backupProject` writes files for sharing or exporting, one folder per backup.
    nonisolated let temporaryBackupRoot: URL
    private let catalog: LayoutCatalog
    private let fileManager = FileManager.default

    init(
        rootURL: URL,
        catalog: LayoutCatalog,
        temporaryBackupRoot: URL = FileManager.default.temporaryDirectory
            .appending(path: "CollageBackups", directoryHint: .isDirectory)
    ) {
        self.rootURL = rootURL
        self.catalog = catalog
        self.temporaryBackupRoot = temporaryBackupRoot
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

    // MARK: - Copies and backups

    /// Adds a copy of a project named "<name> copy" (shortened to fit 200 characters). The copy
    /// has new project and photo IDs and keeps the layout, slot assignments, transforms, settings
    /// and original bytes. Originals are copied as bytes, not decoded. If any original is
    /// missing, this throws `missingOriginal` and adds nothing.
    func duplicateProject(_ projectID: UUID) throws -> CollageProject {
        let source = try readManifest(projectID)
        for photo in source.photos where !isRegularFile(originalURL(projectID, photo)) {
            throw ProjectStoreError.missingOriginal(photo.id)
        }
        return try publishCopy(of: source, named: Self.copyName(for: source.name)) { photo, newID, originals in
            let filename = "\(newID.uuidString).\(Self.fileExtension(of: URL(filePath: photo.imageFilename)))"
            let destination = originals.appending(path: filename)
            try fileManager.copyItem(at: originalURL(projectID, photo), to: destination)
            guard isRegularFile(destination) else { throw ProjectStoreError.missingOriginal(photo.id) }
            return filename
        }
    }

    /// Writes a self-contained backup of one project to a new uniquely named folder under
    /// `temporaryBackupRoot` and returns the `.json` file. Pass it to `discardBackup(at:)` once
    /// it has been shared or exported.
    ///
    /// Throws `missingOriginal` if an original is missing, and `ProjectBackupError.tooLarge`
    /// (checked from file sizes before any original is read) if the file would exceed
    /// `ProjectBackup.maximumFileBytes`, so it never writes a backup that restore would refuse.
    func backupProject(_ projectID: UUID) throws -> URL {
        let project = try readManifest(projectID)
        var sources: [(photoID: UUID, url: URL)] = []
        var payloadBytes = 0
        for photo in project.photos {
            let url = originalURL(projectID, photo)
            guard isRegularFile(url), let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize else {
                throw ProjectStoreError.missingOriginal(photo.id)
            }
            payloadBytes += (size + 2) / 3 * 4
            sources.append((photo.id, url))
        }

        let limit = ProjectBackup.maximumFileBytes
        let createdAt = Date()
        // With empty data the encoding is exactly the backup minus its base64 payloads.
        let envelope = try ProjectBackup.encoder.encode(ProjectBackup(
            createdAt: createdAt, project: project,
            originals: sources.map { ProjectBackup.Original(photoID: $0.photoID, data: Data()) }
        ))
        guard envelope.count + payloadBytes <= limit else { throw ProjectBackupError.tooLarge(limit: limit) }

        let originals = try sources.map { source in
            do {
                return ProjectBackup.Original(photoID: source.photoID, data: try Data(contentsOf: source.url))
            } catch {
                throw ProjectStoreError.missingOriginal(source.photoID)
            }
        }
        let data = try ProjectBackup.encoder.encode(
            ProjectBackup(createdAt: createdAt, project: project, originals: originals)
        )
        // An original could have grown since its size was read.
        guard data.count <= limit else { throw ProjectBackupError.tooLarge(limit: limit) }

        let directory = temporaryBackupRoot.appending(path: UUID().uuidString, directoryHint: .isDirectory)
        let file = directory.appending(path: Self.backupFilename(for: project.name))
        do {
            try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
            try data.write(to: file, options: .atomic)
        } catch {
            try? fileManager.removeItem(at: directory)
            throw error
        }
        return file
    }

    /// Deletes a file returned by `backupProject`, with its folder. URLs that are not
    /// in a backup folder directly under `temporaryBackupRoot` are ignored.
    nonisolated func discardBackup(at url: URL) {
        let directory = url.standardizedFileURL.deletingLastPathComponent()
        guard url.isFileURL, UUID(uuidString: directory.lastPathComponent) != nil,
              directory.deletingLastPathComponent().pathComponents
                == temporaryBackupRoot.standardizedFileURL.pathComponents else { return }
        try? FileManager.default.removeItem(at: directory)
    }

    /// Restores a backup file as a new project, with new project and photo IDs. The backup's
    /// name, layout, slot assignments, transforms, settings and original bytes are kept.
    ///
    /// Opens security-scoped URLs itself, so a `fileImporter` URL can be passed directly. The file
    /// size is checked before reading, then the envelope, project, photo list and every original
    /// (a complete JPEG, PNG or HEIC whose oriented pixel size matches the manifest) are
    /// validated while the project is staged. Only a fully valid project is published, so any
    /// failure leaves the library unchanged. Throws `ProjectBackupError` for an invalid backup.
    func restoreProject(from url: URL) throws -> CollageProject {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let backup = try Self.decodeBackup(Self.readBackupFile(url))
        let project = backup.project
        do {
            try project.validate(catalog: catalog)
        } catch {
            throw ProjectBackupError.invalid("The backup's project is invalid: \(error)")
        }
        guard let name = try? Self.validatedName(project.name) else {
            throw ProjectBackupError.invalid("The backup's project name is invalid.")
        }
        var bytes: [UUID: Data] = [:]
        for original in backup.originals {
            guard bytes.updateValue(original.data, forKey: original.photoID) == nil else {
                throw ProjectBackupError.invalid("A photo's original appears more than once.")
            }
        }
        guard Set(bytes.keys) == Set(project.photos.map(\.id)) else {
            throw ProjectBackupError.invalid("The backup's originals don't match its photos.")
        }

        return try publishCopy(of: project, named: name) { photo, newID, originals in
            guard let data = bytes[photo.id] else {
                throw ProjectBackupError.invalid("The backup's originals don't match its photos.")
            }
            let staged = originals.appending(path: newID.uuidString)
            try data.write(to: staged)
            guard case let .success(image) = PhotoImporter.inspect(staged) else {
                throw ProjectBackupError.invalid("A photo is not a readable JPEG, PNG or HEIC image.")
            }
            guard image.width == photo.pixelWidth, image.height == photo.pixelHeight else {
                throw ProjectBackupError.invalid("A photo's pixel size doesn't match its image.")
            }
            // Name the restored file by its actual format, as import does.
            let filename = "\(newID.uuidString).\(image.type.preferredFilenameExtension ?? "img")"
            try fileManager.moveItem(at: staged, to: originals.appending(path: filename))
            return filename
        }
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

    /// Stages a new project with new project and photo IDs that keeps `source`'s layout, slot
    /// areas, transforms, settings and pixel sizes, then publishes it with one directory move.
    /// `storeOriginal` writes one photo's bytes into the staged Originals folder and returns the
    /// file name it used. Any failure removes the staging folder, so nothing partial is published.
    private func publishCopy(
        of source: CollageProject,
        named name: String,
        storeOriginal: (_ photo: ProjectPhoto, _ newID: UUID, _ originals: URL) throws -> String
    ) throws -> CollageProject {
        try prepareDirectories()
        let id = UUID()
        let now = Date()
        let staging = stagingURL.appending(path: id.uuidString, directoryHint: .isDirectory)
        let originals = staging.appending(path: Self.originalsDirectoryName, directoryHint: .isDirectory)
        do {
            try fileManager.createDirectory(at: originals, withIntermediateDirectories: true)
            var newIDs: [UUID: UUID] = [:]
            var photos: [ProjectPhoto] = []
            for photo in source.photos {
                let newID = UUID()
                let filename = try storeOriginal(photo, newID, originals)
                newIDs[photo.id] = newID
                photos.append(ProjectPhoto(
                    id: newID, imageFilename: filename, pixelWidth: photo.pixelWidth, pixelHeight: photo.pixelHeight
                ))
            }
            let positions = try source.positions.map { position in
                guard let photoID = newIDs[position.photoID] else {
                    throw CollageValidationError.invalid("A layout slot names an unknown photo.")
                }
                return PhotoPosition(photoID: photoID, area: position.area, transform: position.transform)
            }
            let project = CollageProject(
                id: id, name: name, createdAt: now, updatedAt: now, photos: photos,
                selectedLayoutID: source.selectedLayoutID, positions: positions, settings: source.settings
            )
            try write(project, to: staging.appending(path: Self.manifestFilename))
            try fileManager.moveItem(at: staging, to: directoryURL(for: id))
            return project
        } catch {
            try? fileManager.removeItem(at: staging)
            throw error
        }
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

    private static func copyName(for name: String) -> String {
        let suffix = " copy"
        var base = name
        while base.count + suffix.count > maximumNameLength { base.removeLast() }
        return base.trimmingCharacters(in: .whitespaces) + suffix
    }

    /// "<name> backup.json" with path separators, reserved and control characters replaced and
    /// leading dots removed. The name is cut to 200 UTF-8 bytes to stay within file name limits.
    private static func backupFilename(for name: String) -> String {
        let reserved = "/\\:*?\"<>|".unicodeScalars
        var base = String(String.UnicodeScalarView(name.unicodeScalars.map { scalar in
            CharacterSet.controlCharacters.contains(scalar) || reserved.contains(scalar) ? "_" : scalar
        }))
        while base.hasPrefix(".") { base.removeFirst() }
        while base.utf8.count > 200 { base.removeLast() }
        base = base.trimmingCharacters(in: .whitespaces)
        return "\(base.isEmpty ? "Collage" : base) backup.json"
    }

    /// Reads at most `ProjectBackup.maximumFileBytes`, refusing larger files before decoding.
    private static func readBackupFile(_ url: URL) throws -> Data {
        let limit = ProjectBackup.maximumFileBytes
        guard url.isFileURL,
              let values = try? url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey]),
              values.isRegularFile == true else {
            throw ProjectBackupError.notABackup
        }
        if let size = values.fileSize, size > limit { throw ProjectBackupError.tooLarge(limit: limit) }
        let data: Data
        do {
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            // One byte past the limit detects a file that grew after its size was read.
            data = try handle.read(upToCount: limit + 1) ?? Data()
        } catch {
            throw ProjectBackupError.notABackup
        }
        guard data.count <= limit else { throw ProjectBackupError.tooLarge(limit: limit) }
        return data
    }

    private static func decodeBackup(_ data: Data) throws -> ProjectBackup {
        struct Header: Decodable {
            let format: String?
            let version: Int?
        }
        let decoder = JSONDecoder()
        // Decode the whole backup once; the header alone only classifies a failure.
        let backup = try? decoder.decode(ProjectBackup.self, from: data)
        let header = backup.map { Header(format: $0.format, version: $0.version) }
            ?? (try? decoder.decode(Header.self, from: data))
        guard let header, header.format == ProjectBackup.formatIdentifier else {
            throw ProjectBackupError.notABackup
        }
        guard header.version == ProjectBackup.currentVersion else {
            throw ProjectBackupError.unsupportedVersion(header.version ?? 0)
        }
        guard let backup else { throw ProjectBackupError.invalid("The backup's contents are damaged.") }
        return backup
    }

    private static func fileExtension(of url: URL) -> String {
        let ext = url.pathExtension.lowercased()
        let safe = (1...8).contains(ext.count) && ext.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber) }
        return safe ? ext : "dat"
    }
}
