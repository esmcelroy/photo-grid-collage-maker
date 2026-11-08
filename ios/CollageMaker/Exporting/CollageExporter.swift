import CoreGraphics
import Foundation

extension GridLayout {
    /// The editing canvas shared by the preview, the editor and export. Gap and corner
    /// radius are measured on this canvas and scale with the exported pixel size.
    var compositionSize: CGSize { CGSize(width: 400, height: 400 / aspectRatio) }
}

/// Output-size presets and rules ported from `src/lib/export-dimensions.ts`.
struct ExportPreset: Identifiable, Equatable, Sendable {
    let id: String
    let label: String
    let longestEdge: Int

    static let all = [
        ExportPreset(id: "web", label: "Web HD", longestEdge: 1920),
        ExportPreset(id: "social", label: "Social", longestEdge: 1080),
        ExportPreset(id: "print", label: "Print", longestEdge: 2400),
    ]

    /// The longest edge gets the preset size; the other edge keeps the layout's proportions.
    func dimensions(aspectRatio: Double) -> ExportDimensions {
        let edge = Double(longestEdge)
        if aspectRatio >= 1 {
            return ExportDimensions(width: longestEdge, height: max(1, Int((edge / aspectRatio).rounded())))
        }
        return ExportDimensions(width: max(1, Int((edge * aspectRatio).rounded())), height: longestEdge)
    }
}

extension ExportDimensions {
    /// Parses typed sizes. Non-integer text fails with the web app's whole-pixel message.
    static func parse(width: String, height: String) -> Result<ExportDimensions, CollageExportError> {
        guard let width = Int(width.trimmingCharacters(in: .whitespaces)),
              let height = Int(height.trimmingCharacters(in: .whitespaces)) else {
            return .failure(.invalidSize("Width and height must be whole pixels."))
        }
        let dimensions = ExportDimensions(width: width, height: height)
        return dimensions.exportError.map { .failure($0) } ?? .success(dimensions)
    }

    /// The first rule from `validateExportDimensions` that these dimensions break.
    var exportError: CollageExportError? {
        if width < 1 || height < 1 { return .invalidSize("Width and height must be at least 1 pixel.") }
        if width > 8192 || height > 8192 { return .invalidSize("Each dimension must be 8192 px or smaller.") }
        // Both sides are at most 8192 here, so the product cannot overflow.
        if width * height > 40_000_000 { return .invalidSize("Export size must be 40 megapixels or smaller.") }
        return nil
    }
}

enum CollageExportError: Error, Equatable {
    case invalidSize(String)
    case missingPhoto
    case unreadablePhoto
    case renderFailed
    case writeFailed

    var message: String {
        switch self {
        case let .invalidSize(message): message
        case .missingPhoto: "An original photo is missing, so this collage can't be exported."
        case .unreadablePhoto: "An original photo couldn't be read. Try again, or replace that photo."
        case .renderFailed: "The collage couldn't be rendered. Try a smaller size."
        case .writeFailed: "The export couldn't be saved. Free up some storage and try again."
        }
    }
}

/// One exported file. The exporter owns `directory` and deletes it through `discard`.
struct ExportedCollage: Identifiable, Equatable, Sendable {
    let id: UUID
    let fileURL: URL
    let dimensions: ExportDimensions
    let byteCount: Int
    var directory: URL { fileURL.deletingLastPathComponent() }
}

struct CollageExportRequest: Sendable {
    var project: CollageProject
    var layout: GridLayout
    var originalURLs: [UUID: URL]
    var dimensions: ExportDimensions
    var format: CollageRenderFormat
    /// 0...1; ignored for PNG.
    var jpegQuality: Double
    var filename: String
}

/// Renders a project snapshot to a temporary file for sharing. Each export gets its own
/// directory under `temporaryRoot`, so a shared file is never overwritten by a later export.
struct CollageExporter: Sendable {
    let temporaryRoot: URL

    init(temporaryRoot: URL = FileManager.default.temporaryDirectory
        .appending(path: "CollageExports", directoryHint: .isDirectory)) {
        self.temporaryRoot = temporaryRoot
    }

    /// Renders off the caller's actor; `CollageRenderer` decodes one original at a time.
    /// Cancellation before this returns leaves no file behind and throws `CancellationError`.
    @concurrent
    func export(_ request: CollageExportRequest) async throws -> ExportedCollage {
        if let error = request.dimensions.exportError { throw error }
        try Task.checkCancellation()
        let data: Data
        do {
            data = try CollageRenderer.render(CollageRenderRequest(
                project: request.project,
                layout: request.layout,
                originalURLs: request.originalURLs,
                compositionSize: request.layout.compositionSize,
                dimensions: request.dimensions,
                format: request.format,
                jpegQuality: request.jpegQuality
            ))
        } catch CollageRenderError.missingOriginal {
            throw CollageExportError.missingPhoto
        } catch CollageRenderError.unreadableOriginal {
            throw CollageExportError.unreadablePhoto
        } catch {
            throw CollageExportError.renderFailed
        }
        try Task.checkCancellation()

        let id = UUID()
        let directory = temporaryRoot.appending(path: id.uuidString, directoryHint: .isDirectory)
        let file = directory.appending(path: Self.filename(request.filename, format: request.format))
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try data.write(to: file, options: .atomic)
        } catch {
            try? FileManager.default.removeItem(at: directory)
            throw CollageExportError.writeFailed
        }
        guard !Task.isCancelled else {
            try? FileManager.default.removeItem(at: directory)
            throw CancellationError()
        }
        return ExportedCollage(id: id, fileURL: file, dimensions: request.dimensions, byteCount: data.count)
    }

    /// Mirrors the web sanitizer: no path separators or reserved characters, no leading dots,
    /// at most 200 characters, and exactly one extension for the chosen format.
    static func filename(_ raw: String, format: CollageRenderFormat) -> String {
        let reserved = Set("/\\:*?\"<>|")
        var name = String(raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .unicodeScalars
            .filter { !CharacterSet.controlCharacters.contains($0) }
            .map { reserved.contains(Character($0)) ? "_" : Character($0) })
        while name.hasPrefix(".") { name.removeFirst() }
        name = String(name.prefix(200)).trimmingCharacters(in: .whitespaces)
        if name.isEmpty { name = "Collage" }
        let ext = format == .png ? ".png" : ".jpg"
        return name.lowercased().hasSuffix(ext) ? name : name + ext
    }

    func discard(_ export: ExportedCollage) {
        try? FileManager.default.removeItem(at: export.directory)
    }

    /// Removes every export file, including ones left by an interrupted earlier session.
    /// Call only when no share sheet is using a file.
    func discardAll() {
        try? FileManager.default.removeItem(at: temporaryRoot)
    }
}
