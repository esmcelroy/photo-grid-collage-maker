import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

enum CollageRenderFormat: String, Sendable {
    case png
    case jpeg
}

enum CollageRenderError: Error, Equatable {
    case invalidProject(String)
    case missingOriginal(UUID)
    case unreadableOriginal(UUID)
    case encodingFailed
}

/// An explicit composition request. Callers pass the project snapshot, the layout
/// it already resolved, and local original-file URLs. This type does not read a
/// store or a global current project.
///
/// `compositionSize` is the editing canvas. Gap, padding, and corner radius are
/// computed there. The context then scales that composition onto `dimensions`.
/// A chosen export aspect that differs from the composition stretches; it does
/// not recrop the slots.
struct CollageRenderRequest: Sendable {
    var project: CollageProject
    var layout: GridLayout
    var originalURLs: [UUID: URL]
    var compositionSize: CGSize
    var dimensions: ExportDimensions
    var format: CollageRenderFormat
    var jpegQuality: Double = 0.92
}

/// Encodes one collage from original image files. ImageIO decodes each original
/// only while that slot is drawn. The result does not copy source metadata.
/// Callers may invoke this off the main actor; it uses no UIKit types.
enum CollageRenderer {
    static func render(_ request: CollageRenderRequest) throws -> Data {
        try request.project.validate(catalog: LayoutCatalog(layouts: [request.layout]))
        guard request.project.selectedLayoutID == request.layout.id else {
            throw CollageRenderError.invalidProject("The snapshot layout does not match the project.")
        }
        try request.dimensions.validate()
        guard request.compositionSize.width.isFinite, request.compositionSize.height.isFinite,
              request.compositionSize.width > 0, request.compositionSize.height > 0 else {
            throw CollageRenderError.invalidProject("Composition size must be finite and positive.")
        }
        guard request.format == .png || (request.jpegQuality.isFinite && (0...1).contains(request.jpegQuality)) else {
            throw CollageRenderError.invalidProject("JPEG quality must be between 0 and 1.")
        }
        for photo in request.project.photos {
            guard let url = request.originalURLs[photo.id] else {
                throw CollageRenderError.missingOriginal(photo.id)
            }
            guard url.isFileURL else {
                throw CollageRenderError.invalidProject("Originals must be local file URLs.")
            }
        }

        let geometry = try CollageGeometry(
            layout: request.layout,
            canvasSize: request.compositionSize,
            settings: request.project.settings
        )
        let scaleX = CGFloat(request.dimensions.width) / request.compositionSize.width
        let scaleY = CGFloat(request.dimensions.height) / request.compositionSize.height
        guard scaleX.isFinite, scaleY.isFinite, scaleX > 0, scaleY > 0 else {
            throw CollageRenderError.invalidProject("Export scale must be finite and positive.")
        }
        let positions = Dictionary(uniqueKeysWithValues: request.project.positions.map { ($0.area, $0) })
        let photos = Dictionary(uniqueKeysWithValues: request.project.photos.map { ($0.id, $0) })

        guard let context = bitmapContext(width: request.dimensions.width, height: request.dimensions.height) else {
            throw CollageRenderError.encodingFailed
        }
        // CoreGraphics is bottom-left. Composition geometry is top-left, matching the web.
        context.translateBy(x: 0, y: CGFloat(request.dimensions.height))
        context.scaleBy(x: 1, y: -1)
        context.scaleBy(x: scaleX, y: scaleY)
        context.interpolationQuality = .none

        let canvas = CGRect(origin: .zero, size: geometry.canvasSize)
        if request.format == .jpeg {
            // JPEG has no alpha. Fill the whole bitmap before the rounded canvas clip,
            // or pixels outside that clip stay clear and encode as black.
            context.setFillColor(CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1))
            context.fill(CGRect(x: 0, y: 0, width: request.compositionSize.width, height: request.compositionSize.height))
        }

        context.saveGState()
        context.addPath(roundedRect(canvas, radius: geometry.cornerRadius))
        context.clip()
        if case let .color(value) = request.project.settings.background {
            let color = request.format == .jpeg ? compositeOnWhite(value) : srgb(value)
            context.setFillColor(color)
            context.fill(canvas)
        }

        let captureScale = min(scaleX, scaleY)
        for cell in geometry.cells {
            guard let position = positions[cell.area], let photo = photos[position.photoID] else {
                throw CollageRenderError.invalidProject("A layout slot has no photo assignment.")
            }
            guard let url = request.originalURLs[photo.id] else {
                throw CollageRenderError.missingOriginal(photo.id)
            }
            let source = try decodeOriginal(at: url, photoID: photo.id)
            try draw(
                source: source,
                cell: cell,
                transform: position.transform,
                captureScale: captureScale,
                in: context
            )
        }
        context.restoreGState()

        guard let composed = context.makeImage() else {
            throw CollageRenderError.encodingFailed
        }
        return try encode(composed, format: request.format, jpegQuality: request.jpegQuality)
    }

    private static func draw(
        source: CGImage,
        cell: LayoutCell,
        transform: PhotoTransform,
        captureScale: CGFloat,
        in context: CGContext
    ) throws {
        let photo = try PhotoGeometry(
            imageSize: CGSize(width: source.width, height: source.height),
            cell: cell.frame,
            transform: transform
        )
        guard let cropped = rasterizeCrop(source: source, photo: photo, captureScale: captureScale) else {
            throw CollageRenderError.encodingFailed
        }

        // contentTransform already places slot-local points on the composition canvas.
        // Flip only inside the slot-sized layer; another cell-origin translation doubles the offset.
        context.saveGState()
        context.addPath(roundedRect(cell.frame, radius: cell.cornerRadius))
        context.clip()
        context.concatenate(photo.contentTransform)
        context.translateBy(x: 0, y: cell.frame.height)
        context.scaleBy(x: 1, y: -1)
        context.draw(cropped, in: CGRect(origin: .zero, size: cell.frame.size))
        context.restoreGState()
    }

    /// Slot-sized cover crop, before rotation or zoom. Convert the top-left crop
    /// rectangle to the bitmap context's bottom-left coordinates without flipping the image.
    private static func rasterizeCrop(
        source: CGImage,
        photo: PhotoGeometry,
        captureScale: CGFloat
    ) -> CGImage? {
        let width = max(1, Int(ceil(photo.contentBounds.width * captureScale)))
        let height = max(1, Int(ceil(photo.contentBounds.height * captureScale)))
        guard let context = bitmapContext(width: width, height: height) else { return nil }
        context.interpolationQuality = .none
        context.scaleBy(
            x: CGFloat(width) / photo.contentBounds.width,
            y: CGFloat(height) / photo.contentBounds.height
        )
        let imageRect = CGRect(
            x: photo.imageRect.minX,
            y: photo.contentBounds.height - photo.imageRect.maxY,
            width: photo.imageRect.width,
            height: photo.imageRect.height
        )
        context.draw(source, in: imageRect)
        return context.makeImage()
    }

    /// JPEG has no alpha. A translucent collage color is flattened onto white.
    private static func compositeOnWhite(_ color: RGBAColor) -> CGColor {
        let alpha = color.alpha
        return srgb(RGBAColor(
            red: color.red * alpha + (1 - alpha),
            green: color.green * alpha + (1 - alpha),
            blue: color.blue * alpha + (1 - alpha),
            alpha: 1
        ))
    }

    private static func srgb(_ color: RGBAColor) -> CGColor {
        CGColor(srgbRed: color.red, green: color.green, blue: color.blue, alpha: color.alpha)
    }

    private static func bitmapContext(width: Int, height: Int) -> CGContext? {
        CGContext(
            data: nil,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: 0,
            space: CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        )
    }

    private static func roundedRect(_ rect: CGRect, radius: CGFloat) -> CGPath {
        CGPath(
            roundedRect: rect,
            cornerWidth: min(radius, rect.width / 2),
            cornerHeight: min(radius, rect.height / 2),
            transform: nil
        )
    }

    private static func decodeOriginal(at url: URL, photoID: UUID) throws -> CGImage {
        guard url.isFileURL else {
            throw CollageRenderError.invalidProject("Originals must be local file URLs.")
        }
        guard FileManager.default.isReadableFile(atPath: url.path) else {
            throw CollageRenderError.missingOriginal(photoID)
        }
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              CGImageSourceGetCount(source) > 0 else {
            throw CollageRenderError.unreadableOriginal(photoID)
        }
        // Decode at the original pixel count with ImageIO applying EXIF orientation.
        // Do not copy source properties into the encoded collage.
        guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] else {
            throw CollageRenderError.unreadableOriginal(photoID)
        }
        let pixelWidth = (properties[kCGImagePropertyPixelWidth] as? Int) ?? 0
        let pixelHeight = (properties[kCGImagePropertyPixelHeight] as? Int) ?? 0
        guard pixelWidth > 0, pixelHeight > 0 else {
            throw CollageRenderError.unreadableOriginal(photoID)
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: max(pixelWidth, pixelHeight),
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            throw CollageRenderError.unreadableOriginal(photoID)
        }
        return image
    }

    private static func encode(_ image: CGImage, format: CollageRenderFormat, jpegQuality: Double) throws -> Data {
        let data = NSMutableData()
        let type: CFString = format == .png ? UTType.png.identifier as CFString : UTType.jpeg.identifier as CFString
        guard let destination = CGImageDestinationCreateWithData(data, type, 1, nil) else {
            throw CollageRenderError.encodingFailed
        }
        var properties: [CFString: Any] = [:]
        if format == .jpeg {
            properties[kCGImageDestinationLossyCompressionQuality] = jpegQuality
        }
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        guard CGImageDestinationFinalize(destination) else {
            throw CollageRenderError.encodingFailed
        }
        return data as Data
    }
}
