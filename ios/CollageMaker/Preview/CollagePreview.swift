import CoreGraphics
import Foundation
import ImageIO
import SwiftUI

/// An explicit preview request. The view does not read a store or a current project.
/// `compositionSize` is the same editing canvas the renderer uses, so gaps, padding,
/// and cover crops stay in that space while SwiftUI scales the view.
struct CollagePreviewRequest: Equatable, Sendable {
    static let maximumAllowedPixelSize = 1600

    var project: CollageProject
    var layout: GridLayout
    var originalURLs: [UUID: URL]
    var compositionSize: CGSize
    var maximumPixelSize: Int = 512
}

enum CollagePreviewPhase: Equatable, Sendable {
    case empty
    case loading
    case ready
    case missingPhoto(UUID)
    case invalid(String)
}

enum CollagePreviewError: Error, Equatable {
    case missingOriginal
    case unreadableOriginal
    case invalidRequest(String)
}

/// Read-only composition. Photos are decorative. Loading, missing, and invalid
/// states are visible and do not keep imagery from an earlier request.
struct CollagePreview: View {
    private let request: CollagePreviewRequest
    @State private var model = CollagePreviewModel()

    init(_ request: CollagePreviewRequest) {
        self.request = request
    }

    var body: some View {
        ZStack {
            switch model.phase {
            case .empty:
                status("No photos yet", systemImage: "photo.on.rectangle.angled")
            case .loading:
                status("Loading preview", systemImage: "clock")
            case .missingPhoto:
                status("A photo is missing", systemImage: "exclamationmark.triangle")
            case .invalid(let message):
                status(message, systemImage: "exclamationmark.triangle")
            case .ready:
                composition
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .aspectRatio(request.compositionSize.width / max(request.compositionSize.height, 1), contentMode: .fit)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabel)
        .task(id: request) {
            await model.load(request)
        }
    }

    private var accessibilityLabel: String {
        switch model.phase {
        case .empty:
            return "Empty collage preview"
        case .loading:
            return "Loading collage preview"
        case .ready:
            return "Collage preview, \(request.project.photos.count) photos"
        case .missingPhoto:
            return "Collage preview, a photo is missing"
        case .invalid:
            return "Collage preview is unavailable"
        }
    }

    @ViewBuilder
    private var composition: some View {
        if let geometry = model.geometry {
            Canvas { context, size in
                let scale = CGSize(
                    width: size.width / geometry.canvasSize.width,
                    height: size.height / geometry.canvasSize.height
                )
                var canvas = context
                canvas.scaleBy(x: scale.width, y: scale.height)
                let bounds = CGRect(origin: .zero, size: geometry.canvasSize)
                canvas.clip(to: Path(roundedRect(bounds, radius: geometry.cornerRadius)))
                if case let .color(color) = request.project.settings.background {
                    canvas.fill(Path(bounds), with: .color(Color(
                        red: color.red, green: color.green, blue: color.blue, opacity: color.alpha
                    )))
                }
                for cell in geometry.cells {
                    draw(cell, in: &canvas)
                }
            }
            .accessibilityHidden(true)
        }
    }

    private func draw(_ cell: LayoutCell, in context: inout GraphicsContext) {
        guard let image = model.images[cell.area],
              let position = model.positions[cell.area] else {
            return
        }
        let photo = try? PhotoGeometry(
            imageSize: CGSize(width: image.width, height: image.height),
            cell: CGRect(origin: .zero, size: cell.frame.size),
            transform: position.transform
        )
        guard let photo else { return }
        // Destination clip first. Inside it, move to the cell and apply the slot-local
        // rotation and zoom. The inner layer clips the cover to the slot-sized bounds
        // before that transform, so overflow is cropped rather than merely resolved.
        var slot = context
        slot.clip(to: Path(roundedRect(cell.frame, radius: cell.cornerRadius)))
        slot.translateBy(x: cell.frame.minX, y: cell.frame.minY)
        slot.concatenate(photo.contentTransform)
        slot.drawLayer { layer in
            var cropped = layer
            cropped.clip(to: Path(photo.contentBounds))
            cropped.draw(Image(decorative: image, scale: 1), in: photo.imageRect)
        }
    }

    private func status(_ title: String, systemImage: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: systemImage)
                .font(.largeTitle)
                .accessibilityHidden(true)
            Text(title)
                .font(.headline)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(24)
        .accessibilityIdentifier("collagePreviewStatus")
    }

    private func roundedRect(_ rect: CGRect, radius: CGFloat) -> CGPath {
        CGPath(
            roundedRect: rect,
            cornerWidth: min(radius, rect.width / 2),
            cornerHeight: min(radius, rect.height / 2),
            transform: nil
        )
    }
}

@MainActor
@Observable
private final class CollagePreviewModel {
    var phase: CollagePreviewPhase = .empty
    var geometry: CollageGeometry?
    var images: [String: CGImage] = [:]
    var positions: [String: PhotoPosition] = [:]
    private var generation = 0
    private var cachedProjectID: UUID?
    private var cachedURLs: [UUID: URL] = [:]
    private var cachedPixelSize = 0
    private var cachedImages: [UUID: CGImage] = [:]

    func load(_ request: CollagePreviewRequest) async {
        generation += 1
        let current = generation
        // Editing only changes geometry. Reuse bounded thumbnails, never originals,
        // while keeping the cache isolated to this project and exact source URLs.
        if cachedProjectID != request.project.id || cachedURLs != request.originalURLs ||
            cachedPixelSize != request.maximumPixelSize {
            cachedImages = [:]
        }
        images = [:]
        positions = [:]
        geometry = nil

        let resolved = CollagePreviewLoader.phase(for: request)
        guard resolved == .loading else {
            phase = resolved
            return
        }
        phase = .loading
        guard let geometry = try? CollageGeometry(
            layout: request.layout,
            canvasSize: request.compositionSize,
            settings: request.project.settings
        ) else {
            phase = .invalid("The collage layout cannot be previewed.")
            return
        }

        let photos = Dictionary(uniqueKeysWithValues: request.project.photos.map { ($0.id, $0) })
        let assignments = Dictionary(uniqueKeysWithValues: request.project.positions.map { ($0.area, $0) })
        var loaded: [String: CGImage] = [:]
        for cell in geometry.cells {
            guard let position = assignments[cell.area], let photo = photos[position.photoID] else {
                phase = .invalid("A layout slot has no photo assignment.")
                return
            }
            guard let url = request.originalURLs[photo.id], url.isFileURL else {
                phase = .missingPhoto(photo.id)
                return
            }
            do {
                let image: CGImage
                if let cached = cachedImages[photo.id] {
                    image = cached
                } else {
                    image = try await Task.detached(priority: .userInitiated) {
                        try CollagePreviewLoader.downsample(at: url, maximumPixelSize: request.maximumPixelSize)
                    }.value
                }
                guard current == generation, !Task.isCancelled else { return }
                loaded[cell.area] = image
            } catch CollagePreviewError.missingOriginal {
                guard current == generation else { return }
                phase = .missingPhoto(photo.id)
                return
            } catch {
                guard current == generation else { return }
                phase = .invalid("A photo could not be read.")
                return
            }
        }
        guard current == generation, !Task.isCancelled else { return }
        self.geometry = geometry
        self.positions = assignments
        self.images = loaded
        cachedProjectID = request.project.id
        cachedURLs = request.originalURLs
        cachedPixelSize = request.maximumPixelSize
        cachedImages = Dictionary(uniqueKeysWithValues: assignments.compactMap { area, position in
            loaded[area].map { (position.photoID, $0) }
        })
        phase = .ready
    }
}

enum CollagePreviewLoader {
    static func phase(for request: CollagePreviewRequest) -> CollagePreviewPhase {
        guard request.compositionSize.width.isFinite, request.compositionSize.height.isFinite,
              request.compositionSize.width > 0, request.compositionSize.height > 0,
              (1...CollagePreviewRequest.maximumAllowedPixelSize).contains(request.maximumPixelSize) else {
            return .invalid("Preview size must be finite and positive.")
        }
        // An empty project is empty even when it has no layout yet. Do not validate
        // it into an error, and do not touch the filesystem on this path.
        guard request.project.photos.isEmpty == false else {
            return .empty
        }
        do {
            try request.project.validate(catalog: LayoutCatalog(layouts: [request.layout]))
        } catch let error as CollageValidationError {
            return .invalid(message(error))
        } catch {
            return .invalid("The collage preview is unavailable.")
        }
        guard request.project.selectedLayoutID == request.layout.id else {
            return .invalid("The snapshot layout does not match the project.")
        }
        for photo in request.project.photos {
            guard let url = request.originalURLs[photo.id] else {
                return .missingPhoto(photo.id)
            }
            guard url.isFileURL else {
                return .invalid("Originals must be local file URLs.")
            }
        }
        return .loading
    }

    /// Orientation-correct downsample. The longest side is at most `maximumPixelSize`.
    static func downsample(at url: URL, maximumPixelSize: Int) throws -> CGImage {
        guard url.isFileURL else {
            throw CollagePreviewError.invalidRequest("Originals must be local file URLs.")
        }
        guard (1...CollagePreviewRequest.maximumAllowedPixelSize).contains(maximumPixelSize) else {
            throw CollagePreviewError.invalidRequest("Preview pixel size must be between 1 and 1600.")
        }
        guard FileManager.default.isReadableFile(atPath: url.path) else {
            throw CollagePreviewError.missingOriginal
        }
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              CGImageSourceGetCount(source) > 0 else {
            throw CollagePreviewError.unreadableOriginal
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maximumPixelSize,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            throw CollagePreviewError.unreadableOriginal
        }
        return image
    }

    private static func message(_ error: CollageValidationError) -> String {
        switch error {
        case let .invalid(message):
            return message
        }
    }
}

private extension Image {
    init(decorative image: CGImage, scale: CGFloat) {
        self.init(decorative: image, scale: scale, orientation: .up)
    }
}
