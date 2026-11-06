import Foundation

/// A collage layout: fractional row and column tracks plus named areas, one per photo.
///
/// Generated from the web app's `GRID_LAYOUTS` by `ios/scripts/generate-layouts.mjs`;
/// `"."` marks an empty cell, matching CSS `grid-template-areas`.
struct GridLayout: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let name: String
    let photoCount: Int
    /// Relative `fr` sizes, top to bottom.
    let rows: [Double]
    /// Relative `fr` sizes, left to right.
    let columns: [Double]
    /// `areas[row][column]` names the area covering each grid cell.
    let areas: [[String]]
    /// Width divided by height.
    let aspectRatio: Double
    let platforms: [String]

    static let emptyCell = "."

    /// Area names in first-appearance, row-major order, excluding empty cells.
    /// The web app assigns photos to areas in this order.
    var areaNames: [String] {
        var seen = Set<String>()
        var names: [String] = []
        for name in areas.joined() where name != Self.emptyCell && seen.insert(name).inserted {
            names.append(name)
        }
        return names
    }

    /// Creates a layout, throwing `LayoutValidationError` unless the track counts match the
    /// area grid, every named area is a filled rectangle, and the named areas equal `photoCount`.
    init(
        id: String,
        name: String,
        photoCount: Int,
        rows: [Double],
        columns: [Double],
        areas: [[String]],
        aspectRatio: Double,
        platforms: [String]
    ) throws {
        self.id = id
        self.name = name
        self.photoCount = photoCount
        self.rows = rows
        self.columns = columns
        self.areas = areas
        self.aspectRatio = aspectRatio
        self.platforms = platforms
        try validate()
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(
            id: container.decode(String.self, forKey: .id),
            name: container.decode(String.self, forKey: .name),
            photoCount: container.decode(Int.self, forKey: .photoCount),
            rows: container.decode([Double].self, forKey: .rows),
            columns: container.decode([Double].self, forKey: .columns),
            areas: container.decode([[String]].self, forKey: .areas),
            aspectRatio: container.decode(Double.self, forKey: .aspectRatio),
            platforms: container.decode([String].self, forKey: .platforms)
        )
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, photoCount, rows, columns, areas, aspectRatio, platforms
    }

    private func validate() throws {
        func fail(_ reason: String) -> LayoutValidationError {
            LayoutValidationError(layoutID: id, reason: reason)
        }

        guard !id.isEmpty else { throw fail("id is empty") }
        guard !rows.isEmpty, !columns.isEmpty else { throw fail("rows and columns must not be empty") }
        guard (rows + columns).allSatisfy({ $0.isFinite && $0 > 0 }) else {
            throw fail("track sizes must be positive and finite")
        }
        guard aspectRatio.isFinite, aspectRatio > 0 else { throw fail("aspectRatio must be positive and finite") }
        guard areas.count == rows.count else {
            throw fail("\(areas.count) area rows for \(rows.count) row tracks")
        }

        var bounds: [String: (minRow: Int, maxRow: Int, minColumn: Int, maxColumn: Int, cells: Int)] = [:]
        for (row, names) in areas.enumerated() {
            guard names.count == columns.count else {
                throw fail("area row \(row) has \(names.count) cells for \(columns.count) column tracks")
            }
            for (column, name) in names.enumerated() where name != Self.emptyCell {
                guard !name.isEmpty else { throw fail("area row \(row) has an empty name") }
                if let b = bounds[name] {
                    bounds[name] = (
                        min(b.minRow, row), max(b.maxRow, row),
                        min(b.minColumn, column), max(b.maxColumn, column), b.cells + 1
                    )
                } else {
                    bounds[name] = (row, row, column, column, 1)
                }
            }
        }

        guard bounds.count == photoCount, photoCount >= 1 else {
            throw fail("\(bounds.count) named areas for photoCount \(photoCount)")
        }
        for (name, b) in bounds where (b.maxRow - b.minRow + 1) * (b.maxColumn - b.minColumn + 1) != b.cells {
            throw fail("area \"\(name)\" is not a filled rectangle")
        }
    }
}

struct LayoutValidationError: Error, Equatable, CustomStringConvertible {
    let layoutID: String
    let reason: String

    var description: String { "Layout \"\(layoutID)\": \(reason)" }
}

enum LayoutCatalogError: Error, Equatable {
    case resourceMissing
    case unsupportedSchemaVersion(Int)
    case duplicateLayoutID(String)
}

/// The layouts shipped in `layouts.json`, in the web catalog's order.
/// For each photo count, the first layout is the default the web app selects.
struct LayoutCatalog: Sendable {
    static let schemaVersion = 1

    let layouts: [GridLayout]

    init(layouts: [GridLayout]) throws {
        var seen = Set<String>()
        for layout in layouts where !seen.insert(layout.id).inserted {
            throw LayoutCatalogError.duplicateLayoutID(layout.id)
        }
        self.layouts = layouts
    }

    /// Decodes a generated catalog document (`{ "schemaVersion": 1, "layouts": [...] }`).
    init(data: Data) throws {
        let document = try JSONDecoder().decode(Document.self, from: data)
        guard document.schemaVersion == Self.schemaVersion else {
            throw LayoutCatalogError.unsupportedSchemaVersion(document.schemaVersion)
        }
        try self.init(layouts: document.layouts)
    }

    /// Loads `layouts.json` from `bundle`.
    init(bundle: Bundle = .main) throws {
        guard let url = bundle.url(forResource: "layouts", withExtension: "json") else {
            throw LayoutCatalogError.resourceMissing
        }
        try self.init(data: Data(contentsOf: url))
    }

    func layouts(forPhotoCount count: Int) -> [GridLayout] {
        layouts.filter { $0.photoCount == count }
    }

    func layout(id: String) -> GridLayout? {
        layouts.first { $0.id == id }
    }

    private struct Document: Decodable {
        let schemaVersion: Int
        let layouts: [GridLayout]
    }
}
