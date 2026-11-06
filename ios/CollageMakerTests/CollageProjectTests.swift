import Foundation
import Testing
@testable import CollageMaker

struct CollageProjectTests {
    private func project() -> CollageProject {
        let first = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
        let second = UUID(uuidString: "00000000-0000-0000-0000-000000000002")!
        return CollageProject(
            id: UUID(uuidString: "10000000-0000-0000-0000-000000000001")!, name: "Two photos",
            createdAt: Date(timeIntervalSince1970: 1000), updatedAt: Date(timeIntervalSince1970: 2000),
            photos: [
                ProjectPhoto(id: first, imageFilename: "one.jpg", pixelWidth: 1000, pixelHeight: 400),
                ProjectPhoto(id: second, imageFilename: "two.png", pixelWidth: 300, pixelHeight: 600),
            ],
            selectedLayoutID: "2-left-large",
            positions: [
                PhotoPosition(photoID: first, area: "a", transform: PhotoTransform(positionX: 0, positionY: 1, rotationDegrees: 90, scale: 0.5)),
                PhotoPosition(photoID: second, area: "b"),
            ],
            settings: CollageSettings(gap: 12, background: .color(RGBAColor(red: 0.2, green: 0.4, blue: 0.8, alpha: 0.6)), borderRadius: 16)
        )
    }

    @Test func versionOneManifestRoundTripPreservesIDsSettingsAndTransforms() throws {
        let original = project()
        let catalog = try LayoutCatalog()
        try original.validate(catalog: catalog)
        let decoded = try JSONDecoder().decode(CollageProject.self, from: JSONEncoder().encode(original))
        try decoded.validate(catalog: catalog)
        #expect(decoded == original)
        #expect(decoded.version == 1)
        #expect(decoded.photos[0].pixelWidth == 1000)
        #expect(decoded.positions[0].transform == PhotoTransform(positionX: 0, positionY: 1, rotationDegrees: 90, scale: 0.5))
    }

    @Test func swappingPreservesSlotTransformsAndCanBeReversed() throws {
        var swapped = project()
        let original = swapped
        try swapped.swapPhotos(fromArea: "a", toArea: "b")
        #expect(swapped.positions[0].photoID == original.photos[1].id)
        #expect(swapped.positions[1].photoID == original.photos[0].id)
        #expect(swapped.positions[0].transform == PhotoTransform(positionX: 0, positionY: 1, rotationDegrees: 90, scale: 0.5))
        #expect(swapped.positions[1].transform == PhotoTransform())
        try swapped.validate(catalog: LayoutCatalog())
        try swapped.swapPhotos(fromArea: "b", toArea: "a")
        #expect(swapped == original)
        #expect(throws: CollageValidationError.self) {
            try swapped.swapPhotos(fromArea: "a", toArea: "missing")
        }
        #expect(swapped == original)
    }

    @Test func layoutChangesResetAssignmentsButReselectionPreservesEdits() throws {
        let catalog = try LayoutCatalog()
        var value = project()
        let original = value
        try value.selectLayout(#require(catalog.layout(id: "2-left-large")))
        #expect(value == original)
        try value.swapPhotos(fromArea: "a", toArea: "b")
        try value.selectLayout(#require(catalog.layout(id: "2-vertical")))
        #expect(value.selectedLayoutID == "2-vertical")
        #expect(value.positions == [PhotoPosition(photoID: original.photos[0].id, area: "a"),
                                    PhotoPosition(photoID: original.photos[1].id, area: "b")])
        #expect(value.settings == original.settings)
        try value.validate(catalog: catalog)
        let unchanged = value
        #expect(throws: CollageValidationError.self) {
            try value.selectLayout(#require(catalog.layout(id: "1-single")))
        }
        #expect(value == unchanged)
    }

    @Test func emptyProjectsAndSixteenPhotosAreValidButSeventeenAreNot() throws {
        let catalog = try LayoutCatalog()
        var value = CollageProject(id: UUID(), name: "", createdAt: .now, updatedAt: .now)
        try value.validate(catalog: catalog)
        value.photos = (1...16).map { ProjectPhoto(id: UUID(), imageFilename: "\($0).jpg", pixelWidth: 300, pixelHeight: 200) }
        try value.validate(catalog: catalog)
        value.selectedLayoutID = "16-grid-4x4"
        value.positions = zip(value.photos, "abcdefghijklmnop").map { PhotoPosition(photoID: $0.id, area: String($1)) }
        try value.validate(catalog: catalog)
        value.photos.append(ProjectPhoto(id: UUID(), imageFilename: "17.jpg", pixelWidth: 300, pixelHeight: 200))
        #expect(throws: CollageValidationError.self) { try value.validate(catalog: catalog) }
    }

    @Test func rejectsBrokenManifestReferencesVersionsPathsAndTransforms() throws {
        let catalog = try LayoutCatalog()
        var invalid: [CollageProject] = []
        var value = project()
        value.version = 2
        invalid.append(value)
        value = project()
        value.positions[1].photoID = value.positions[0].photoID
        invalid.append(value)
        value = project()
        value.positions[1] = PhotoPosition(photoID: value.photos[1].id, area: "a")
        invalid.append(value)
        value = project()
        value.selectedLayoutID = "1-single"
        invalid.append(value)
        value = project()
        value.photos[0] = ProjectPhoto(id: value.photos[0].id, imageFilename: "../outside.jpg", pixelWidth: 1, pixelHeight: 1)
        invalid.append(value)
        value = project()
        value.positions[0].transform.positionX = 1.01
        invalid.append(value)
        value = project()
        value.positions[0].transform.scale = 0
        invalid.append(value)
        value = project()
        value.settings.gap = .infinity
        invalid.append(value)
        for manifest in invalid {
            #expect(throws: CollageValidationError.self) { try manifest.validate(catalog: catalog) }
        }
    }

    @Test(arguments: [
        (1, 1, true), (8192, 1, true), (8193, 1, false),
        (8000, 5000, true), (8000, 5001, false),
        (0, 100, false), (100, -1, false), (Int.max, Int.max, false),
    ])
    func exportLimitsMatchTheWebContract(width: Int, height: Int, valid: Bool) throws {
        let dimensions = ExportDimensions(width: width, height: height)
        if valid {
            try dimensions.validate()
        } else {
            #expect(throws: CollageValidationError.self) { try dimensions.validate() }
        }
    }
}
