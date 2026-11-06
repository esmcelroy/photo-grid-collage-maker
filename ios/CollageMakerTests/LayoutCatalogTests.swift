import Foundation
import Testing
@testable import CollageMaker

/// Contract tests for the bundled layout catalog generated from `src/lib/layouts.ts`.
/// Expected values are copied from the web source, not derived from the Swift model.
struct LayoutCatalogTests {
    private let catalog: LayoutCatalog

    init() throws {
        catalog = try LayoutCatalog()
    }

    @Test func everyPhotoCountFromOneToSixteenHasLayouts() {
        for count in 1...16 {
            let layouts = catalog.layouts(forPhotoCount: count)
            #expect(layouts.count >= 4, "photo count \(count)")
            #expect(layouts.allSatisfy { $0.photoCount == count && $0.areaNames.count == count })
        }
        #expect(catalog.layouts(forPhotoCount: 0).isEmpty)
        #expect(catalog.layouts(forPhotoCount: 17).isEmpty)
        #expect(Set(catalog.layouts.map(\.id)).count == catalog.layouts.count)
    }

    @Test func keepsWebCatalogOrderForDefaultLayouts() {
        // The web app selects the first layout for the current photo count.
        #expect(catalog.layouts(forPhotoCount: 1).first?.id == "1-single")
        #expect(catalog.layouts(forPhotoCount: 2).first?.id == "2-horizontal")
        #expect(catalog.layouts(forPhotoCount: 16).first?.id == "16-grid-4x4")
    }

    @Test func parsesTemplateWithoutSlashAsOneRow() throws {
        let layout = try #require(catalog.layout(id: "2-horizontal"))
        #expect(layout.name == "Side by Side")
        #expect(layout.rows == [1])
        #expect(layout.columns == [1, 1])
        #expect(layout.areas == [["a", "b"]])
        #expect(abs(layout.aspectRatio - 16.0 / 9.0) < 1e-12)
        #expect(layout.platforms == ["youtube", "facebook", "twitter", "linkedin"])
    }

    @Test func preservesUnequalTracksSpansAndEmptyCells() throws {
        let hero = try #require(catalog.layout(id: "16-hero-grid"))
        #expect(hero.rows == [2, 1, 1, 1, 1])
        #expect(hero.columns == [1, 1, 1, 1])
        #expect(hero.areas.first == ["a", "a", "b", "b"])
        #expect(hero.areas.last == ["o", "o", "p", "p"])
        #expect(hero.aspectRatio == 0.75)
        #expect(hero.platforms == ["instagram"])
        #expect(hero.areaNames == "abcdefghijklmnop".map(String.init))

        let plus = try #require(catalog.layout(id: "5-plus"))
        #expect(plus.rows == [1, 2, 1])
        #expect(plus.columns == [1, 2, 1])
        #expect(plus.areas == [[".", "a", "."], ["b", "c", "d"], [".", "e", "."]])
        #expect(plus.areaNames == ["a", "b", "c", "d", "e"])

        #expect(catalog.layout(id: "missing-layout") == nil)
    }

    @Test(arguments: [
        // Non-rectangular area "a".
        #"{"id":"x","name":"X","photoCount":2,"rows":[1,1],"columns":[1,1],"areas":[["a","a"],["a","b"]],"aspectRatio":1,"platforms":[]}"#,
        // Named areas do not match photoCount.
        #"{"id":"x","name":"X","photoCount":3,"rows":[1],"columns":[1,1],"areas":[["a","b"]],"aspectRatio":1,"platforms":[]}"#,
        // Column track count does not match the area row.
        #"{"id":"x","name":"X","photoCount":2,"rows":[1],"columns":[1,1,1],"areas":[["a","b"]],"aspectRatio":1,"platforms":[]}"#,
        // Row track count does not match the area rows.
        #"{"id":"x","name":"X","photoCount":2,"rows":[1,1],"columns":[1,1],"areas":[["a","b"]],"aspectRatio":1,"platforms":[]}"#,
    ])
    func rejectsInvalidLayouts(json: String) {
        #expect(throws: LayoutValidationError.self) {
            try JSONDecoder().decode(GridLayout.self, from: Data(json.utf8))
        }
    }

    @Test func rejectsDuplicateIDsAndUnknownSchema() {
        let layout = #"{"id":"dup","name":"D","photoCount":1,"rows":[1],"columns":[1],"areas":[["a"]],"aspectRatio":1,"platforms":[]}"#
        #expect(throws: LayoutCatalogError.duplicateLayoutID("dup")) {
            try LayoutCatalog(data: Data(#"{"schemaVersion":1,"layouts":[\#(layout),\#(layout)]}"#.utf8))
        }
        #expect(throws: LayoutCatalogError.unsupportedSchemaVersion(2)) {
            try LayoutCatalog(data: Data(#"{"schemaVersion":2,"layouts":[]}"#.utf8))
        }
    }
}
