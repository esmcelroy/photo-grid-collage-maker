import Foundation

enum CollageValidationError: Error, Equatable {
    case invalid(String)
}

struct RGBAColor: Codable, Equatable, Sendable {
    var red: Double
    var green: Double
    var blue: Double
    var alpha: Double = 1
}

enum CollageBackground: Codable, Equatable, Sendable {
    case transparent
    case color(RGBAColor)
}

struct CollageSettings: Codable, Equatable, Sendable {
    var gap: Double = 8
    var background: CollageBackground = .transparent
    var borderRadius: Double = 0

    func validate() throws {
        guard gap.isFinite, (0...100).contains(gap),
              borderRadius.isFinite, (0...100).contains(borderRadius) else {
            throw CollageValidationError.invalid("Gap and radius must be between 0 and 100.")
        }
        if case let .color(color) = background {
            guard [color.red, color.green, color.blue, color.alpha].allSatisfy({
                $0.isFinite && (0...1).contains($0)
            }) else {
                throw CollageValidationError.invalid("Color channels must be between 0 and 1.")
            }
        }
    }
}

/// Position fractions have CSS object-position semantics, not image-center coordinates.
/// Rotation is clockwise in the top-left-origin composition coordinate system.
struct PhotoTransform: Codable, Equatable, Sendable {
    var positionX: Double = 0.5
    var positionY: Double = 0.5
    var rotationDegrees: Double = 0
    var scale: Double = 1

    func validate() throws {
        guard positionX.isFinite, (0...1).contains(positionX),
              positionY.isFinite, (0...1).contains(positionY),
              rotationDegrees.isFinite, (-360...360).contains(rotationDegrees),
              scale.isFinite, (0.1...10).contains(scale) else {
            throw CollageValidationError.invalid("Invalid photo position, rotation or scale.")
        }
    }
}

struct ProjectPhoto: Codable, Equatable, Identifiable, Sendable {
    let id: UUID
    /// Basename of a durable, project-owned original. Never a temporary picker URL.
    let imageFilename: String
    /// Pixel dimensions after applying the original's image orientation.
    let pixelWidth: Int
    let pixelHeight: Int
}

struct PhotoPosition: Codable, Equatable, Sendable {
    var photoID: UUID
    let area: String
    var transform: PhotoTransform = PhotoTransform()
}

/// Versioned manifest value; it contains no image bytes or absolute file paths.
/// Decode first, then validate against the current catalog before accepting a manifest.
struct CollageProject: Codable, Equatable, Identifiable, Sendable {
    static let currentVersion = 1
    static let maximumPhotos = 16

    var version: Int = currentVersion
    let id: UUID
    var name: String
    let createdAt: Date
    var updatedAt: Date
    var photos: [ProjectPhoto] = []
    var selectedLayoutID: String?
    var positions: [PhotoPosition] = []
    var settings = CollageSettings()

    func validate(catalog: LayoutCatalog) throws {
        guard version == Self.currentVersion else {
            throw CollageValidationError.invalid("Unsupported project version.")
        }
        guard name.count <= 200, createdAt.timeIntervalSince1970.isFinite,
              updatedAt.timeIntervalSince1970.isFinite,
              photos.count <= Self.maximumPhotos,
              Set(photos.map(\.id)).count == photos.count,
              Set(photos.map(\.imageFilename)).count == photos.count else {
            throw CollageValidationError.invalid("Invalid project metadata or photo count.")
        }
        for photo in photos {
            guard !photo.imageFilename.isEmpty, photo.imageFilename != ".",
                  photo.imageFilename != "..",
                  !photo.imageFilename.contains("/"), !photo.imageFilename.contains("\\"),
                  !photo.imageFilename.contains("\0"),
                  photo.pixelWidth > 0, photo.pixelHeight > 0 else {
                throw CollageValidationError.invalid("Photos need local basenames and positive pixel dimensions.")
            }
        }
        try settings.validate()
        guard let selectedLayoutID else {
            guard positions.isEmpty else {
                throw CollageValidationError.invalid("Photo positions require a layout.")
            }
            return
        }
        guard let layout = catalog.layout(id: selectedLayoutID),
              layout.photoCount == photos.count,
              positions.count == photos.count,
              Set(positions.map(\.area)) == Set(layout.areaNames),
              Set(positions.map(\.photoID)) == Set(photos.map(\.id)) else {
            throw CollageValidationError.invalid("Layout slots must assign every photo exactly once.")
        }
        for position in positions {
            try position.transform.validate()
        }
    }

    /// Match the web editor: a new layout assigns photos in import order and resets transforms.
    mutating func selectLayout(_ layout: GridLayout) throws {
        guard layout.photoCount == photos.count else {
            throw CollageValidationError.invalid("The layout must match the photo count.")
        }
        guard selectedLayoutID != layout.id else { return }
        selectedLayoutID = layout.id
        positions = zip(photos, layout.areaNames).map { PhotoPosition(photoID: $0.id, area: $1) }
    }

    /// Match the web editor: swap photo assignments, keeping transforms with their slots.
    mutating func swapPhotos(fromArea: String, toArea: String) throws {
        guard fromArea != toArea else { return }
        guard let from = positions.firstIndex(where: { $0.area == fromArea }),
              let to = positions.firstIndex(where: { $0.area == toArea }) else {
            throw CollageValidationError.invalid("Cannot swap missing photo slots.")
        }
        let photoID = positions[from].photoID
        positions[from].photoID = positions[to].photoID
        positions[to].photoID = photoID
    }
}

struct ExportDimensions: Codable, Equatable, Sendable {
    let width: Int
    let height: Int

    func validate() throws {
        // Check each side first so multiplication cannot overflow on untrusted input.
        guard (1...8192).contains(width), (1...8192).contains(height),
              width * height <= 40_000_000 else {
            throw CollageValidationError.invalid("Export must fit within 8192 pixels per side and 40 megapixels.")
        }
    }
}
