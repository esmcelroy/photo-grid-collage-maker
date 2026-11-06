import CoreGraphics
import Foundation

struct LayoutCell: Equatable, Sendable {
    let area: String
    let frame: CGRect
    let cornerRadius: CGFloat
}

/// Composition-space geometry shared by preview and export. Compute once at the
/// editing canvas size, then scale the whole result (including gaps and radii).
/// Coordinates use a top-left origin, with positive y downwards.
struct CollageGeometry: Equatable, Sendable {
    let canvasSize: CGSize
    let cornerRadius: CGFloat
    let cells: [LayoutCell]

    init(layout: GridLayout, canvasSize: CGSize, settings: CollageSettings) throws {
        try settings.validate()
        guard canvasSize.width.isFinite, canvasSize.height.isFinite,
              canvasSize.width > 0, canvasSize.height > 0 else {
            throw CollageValidationError.invalid("Canvas dimensions must be finite and positive.")
        }
        let gap = CGFloat(settings.gap)
        let padding: CGFloat = settings.background == .transparent ? 0 : gap
        let width = canvasSize.width - 2 * padding - CGFloat(layout.columns.count - 1) * gap
        let height = canvasSize.height - 2 * padding - CGFloat(layout.rows.count - 1) * gap
        guard width > 0, height > 0 else {
            throw CollageValidationError.invalid("Gaps leave no room for photos.")
        }
        let columnUnit = width / layout.columns.reduce(0, +)
        let rowUnit = height / layout.rows.reduce(0, +)
        var cells: [LayoutCell] = []
        for area in layout.areaNames {
            var occupiedRows: [Int] = []
            var occupiedColumns: [Int] = []
            for (row, names) in layout.areas.enumerated() {
                for (column, name) in names.enumerated() where name == area {
                    occupiedRows.append(row)
                    occupiedColumns.append(column)
                }
            }
            // GridLayout validation guarantees nonempty, rectangular areas.
            let firstRow = occupiedRows.min()!
            let lastRow = occupiedRows.max()!
            let firstColumn = occupiedColumns.min()!
            let lastColumn = occupiedColumns.max()!
            let frame = CGRect(
                x: padding + layout.columns.prefix(firstColumn).reduce(0, +) * columnUnit + CGFloat(firstColumn) * gap,
                y: padding + layout.rows.prefix(firstRow).reduce(0, +) * rowUnit + CGFloat(firstRow) * gap,
                width: layout.columns[firstColumn...lastColumn].reduce(0, +) * columnUnit + CGFloat(lastColumn - firstColumn) * gap,
                height: layout.rows[firstRow...lastRow].reduce(0, +) * rowUnit + CGFloat(lastRow - firstRow) * gap
            )
            cells.append(LayoutCell(area: area, frame: frame, cornerRadius: min(CGFloat(settings.borderRadius), min(frame.width, frame.height) / 2)))
        }
        self.canvasSize = canvasSize
        self.cornerRadius = min(CGFloat(settings.borderRadius), min(canvasSize.width, canvasSize.height) / 2)
        self.cells = cells
    }

    private init(canvasSize: CGSize, cornerRadius: CGFloat, cells: [LayoutCell]) {
        self.canvasSize = canvasSize
        self.cornerRadius = cornerRadius
        self.cells = cells
    }

    func scaled(by scale: CGFloat) throws -> CollageGeometry {
        guard scale.isFinite, scale > 0,
              (canvasSize.width * scale).isFinite, (canvasSize.height * scale).isFinite else {
            throw CollageValidationError.invalid("Canvas scale must be finite and positive.")
        }
        return CollageGeometry(
            canvasSize: CGSize(width: canvasSize.width * scale, height: canvasSize.height * scale),
            cornerRadius: cornerRadius * scale,
            cells: cells.map {
                LayoutCell(area: $0.area, frame: $0.frame.applying(CGAffineTransform(scaleX: scale, y: scale)), cornerRadius: $0.cornerRadius * scale)
            }
        )
    }
}

/// The image is aspect-filled and clipped to contentBounds BEFORE this layer is
/// rotated/zoomed with contentTransform. The result must then be clipped to the
/// destination cell (and its corner radius). This double clipping matches CSS's
/// replaced-image element; drawing the unbounded original after rotation does not.
struct PhotoGeometry: Equatable, Sendable {
    let imageRect: CGRect
    let contentBounds: CGRect
    let contentTransform: CGAffineTransform

    init(imageSize: CGSize, cell: CGRect, transform: PhotoTransform) throws {
        try transform.validate()
        guard [imageSize.width, imageSize.height, cell.width, cell.height].allSatisfy({ $0.isFinite && $0 > 0 }),
              cell.origin.x.isFinite, cell.origin.y.isFinite else {
            throw CollageValidationError.invalid("Photo and cell dimensions must be finite and positive.")
        }
        let cover = max(cell.width / imageSize.width, cell.height / imageSize.height)
        let width = imageSize.width * cover
        let height = imageSize.height * cover
        imageRect = CGRect(
            x: (cell.width - width) * transform.positionX,
            y: (cell.height - height) * transform.positionY,
            width: width, height: height
        )
        contentBounds = CGRect(origin: .zero, size: cell.size)
        let radians = transform.rotationDegrees * .pi / 180
        let a = cos(radians) * transform.scale
        let b = sin(radians) * transform.scale
        let c = -b
        let d = a
        contentTransform = CGAffineTransform(
            a: a, b: b, c: c, d: d,
            tx: cell.midX - a * cell.width / 2 - c * cell.height / 2,
            ty: cell.midY - b * cell.width / 2 - d * cell.height / 2
        )
    }
}
