import CoreTransferable
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// One selected photo that can produce a local file.
///
/// `loadFile` must return a newly created temporary copy that nothing else uses, never a
/// source file or a durable project original: the importer takes ownership and deletes it
/// when the import ends, whether it succeeded, failed validation, threw or was cancelled.
protocol PhotoImportItem: Sendable {
    func loadFile() async throws -> URL
}

/// A picker file copied into the importer's staging folder while the provider's
/// temporary file is still valid; the provider may delete its file as soon as
/// the importing closure returns.
struct StagedPhotoFile: Transferable, Sendable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .image) { received in
            StagedPhotoFile(url: try PhotoImportStaging.stageCopy(of: received.file))
        }
    }
}

/// Temporary files owned by the importer, in a folder unique to this app launch.
/// Folders left by earlier launches (for example after a crash) are removed on first use.
enum PhotoImportStaging {
    static let directory: URL = {
        let parent = FileManager.default.temporaryDirectory
            .appending(path: "PhotoImportStaging", directoryHint: .isDirectory)
        let current = parent.appending(path: UUID().uuidString, directoryHint: .isDirectory)
        let stale = (try? FileManager.default.contentsOfDirectory(at: parent, includingPropertiesForKeys: nil)) ?? []
        for entry in stale { try? FileManager.default.removeItem(at: entry) }
        try? FileManager.default.createDirectory(at: current, withIntermediateDirectories: true)
        return current
    }()

    static func stageCopy(of file: URL) throws -> URL {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let ext = file.pathExtension
        let destination = directory.appending(path: ext.isEmpty ? UUID().uuidString : "\(UUID().uuidString).\(ext)")
        try FileManager.default.copyItem(at: file, to: destination)
        return destination
    }
}

struct ImportedPhoto: Equatable, Sendable {
    /// Position of the item in the selection passed to `importPhotos`.
    let pickerIndex: Int
    let photo: ProjectPhoto
}

struct PhotoImportItemFailure: Equatable, Sendable {
    enum Reason: Error, Equatable, Sendable {
        /// The picker could not provide a file.
        case unavailable(String)
        /// Readable, but not JPEG, PNG or HEIC/HEIF.
        case unsupportedFormat
        /// Not a decodable, complete image.
        case undecodable
        case photoLimitReached
        /// The store refused the file (for example an invalid pixel size or unreadable copy).
        case notSaved(String)
    }

    let pickerIndex: Int
    let reason: Reason
}

/// The result of one import, always bound to the project it was started for.
struct PhotoImportReport: Sendable {
    let projectID: UUID
    /// The committed project after the import.
    let project: CollageProject
    /// Committed photos, in picker order.
    let imported: [ImportedPhoto]
    /// Items that were not imported, in picker order.
    let failures: [PhotoImportItemFailure]
}

/// Loads, validates and stores selected photos one at a time, off the main actor.
/// Original bytes are stored unchanged; validation decodes only a small thumbnail.
struct PhotoImporter: Sendable {
    static let supportedTypes: [UTType] = [.jpeg, .png, .heic, .heif]
    /// Longest edge of the thumbnail decoded to prove each file is a complete image.
    static let validationPixelSize = 256

    let store: ProjectStore

    /// Imports `items` into `projectID`.
    ///
    /// Throws `ProjectStoreError` if the project is missing or the store write fails, and
    /// `CancellationError` if the task is cancelled before anything is committed; in both cases
    /// nothing is added. Once the store commits, the report is returned even if the task was
    /// cancelled meanwhile. Every file returned by `loadFile` is deleted before this returns.
    @concurrent
    func importPhotos(_ items: [some PhotoImportItem], into projectID: UUID) async throws -> PhotoImportReport {
        var project = try await store.loadProject(projectID)
        guard !items.isEmpty else {
            return PhotoImportReport(projectID: projectID, project: project, imported: [], failures: [])
        }

        var stagedFiles: [URL] = []
        defer {
            for file in stagedFiles { try? FileManager.default.removeItem(at: file) }
        }
        var sources: [PhotoImportSource] = []
        var sourcePickerIndices: [Int] = []
        var failures: [PhotoImportItemFailure] = []

        for (index, item) in items.enumerated() {
            try Task.checkCancellation()
            let file: URL
            do {
                file = try await item.loadFile()
            } catch {
                try Task.checkCancellation()
                failures.append(PhotoImportItemFailure(pickerIndex: index, reason: .unavailable(error.localizedDescription)))
                continue
            }
            stagedFiles.append(file)
            try Task.checkCancellation()
            switch Self.inspect(file) {
            case let .success(size):
                let typed = Self.renamedForType(file, size.type)
                if typed != file { stagedFiles.append(typed) }
                sources.append(PhotoImportSource(fileURL: typed, pixelWidth: size.width, pixelHeight: size.height))
                sourcePickerIndices.append(index)
            case let .failure(reason):
                failures.append(PhotoImportItemFailure(pickerIndex: index, reason: reason))
            }
        }

        try Task.checkCancellation()
        var imported: [ImportedPhoto] = []
        if !sources.isEmpty {
            let result = try await store.importPhotos(sources, into: projectID)
            project = result.project
            var failedSources = Set<Int>()
            for failure in result.failures {
                failedSources.insert(failure.sourceIndex)
                let reason: PhotoImportItemFailure.Reason = switch failure.reason {
                case .photoLimitReached: .photoLimitReached
                case .invalidPixelSize: .notSaved("Invalid pixel size.")
                case let .unreadableSource(message): .notSaved(message)
                }
                failures.append(PhotoImportItemFailure(pickerIndex: sourcePickerIndices[failure.sourceIndex], reason: reason))
            }
            // The store reports committed photos in source order.
            let committedIndices = sources.indices.filter { !failedSources.contains($0) }
            imported = zip(committedIndices, result.imported).map {
                ImportedPhoto(pickerIndex: sourcePickerIndices[$0], photo: $1)
            }
        }
        failures.sort { $0.pickerIndex < $1.pickerIndex }
        return PhotoImportReport(projectID: projectID, project: project, imported: imported, failures: failures)
    }

    /// Oriented pixel size, after proving the file is a complete JPEG, PNG or HEIC image.
    static func inspect(_ file: URL) -> Result<(width: Int, height: Int, type: UTType), PhotoImportItemFailure.Reason> {
        let noCache = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithURL(file as CFURL, noCache) else { return .failure(.undecodable) }
        guard let typeID = CGImageSourceGetType(source) else { return .failure(.undecodable) }
        guard let type = UTType(typeID as String), supportedTypes.contains(where: type.conforms(to:)) else {
            return .failure(.unsupportedFormat)
        }
        guard CGImageSourceGetCount(source) > 0,
              CGImageSourceGetStatusAtIndex(source, 0) == .statusComplete,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, noCache) as? [CFString: Any],
              let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue,
              let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue,
              width > 0, height > 0 else {
            return .failure(.undecodable)
        }
        // Decode a bounded thumbnail from the full image (not an embedded preview).
        let thumbnailOptions = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: validationPixelSize,
        ] as CFDictionary
        guard CGImageSourceCreateThumbnailAtIndex(source, 0, thumbnailOptions) != nil else {
            return .failure(.undecodable)
        }
        // EXIF orientations 5–8 rotate the image a quarter turn.
        let orientation = (properties[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1
        let swapped = (5...8).contains(orientation)
        return .success((swapped ? height : width, swapped ? width : height, type))
    }

    /// Gives the staged file the extension of its actual format, so the stored original's
    /// name matches its bytes. Falls back to the original name if the move fails.
    private static func renamedForType(_ file: URL, _ type: UTType) -> URL {
        guard let ext = type.preferredFilenameExtension, file.pathExtension.lowercased() != ext else { return file }
        let typed = file.deletingPathExtension().appendingPathExtension(ext)
        do {
            try FileManager.default.moveItem(at: file, to: typed)
            return typed
        } catch {
            return file
        }
    }
}
