import CoreGraphics
import Foundation
import Testing
@testable import CollageMaker

struct CollageGeometryTests {
    @Test func unequalTracksAndSpansPreserveGapsAndConditionalPadding() throws {
        let layout = try GridLayout(
            id: "asymmetric", name: "Asymmetric", photoCount: 3,
            rows: [1, 1], columns: [2, 1],
            areas: [["a", "b"], ["a", "c"]], aspectRatio: 4.0 / 3, platforms: []
        )
        let opaque = CollageSettings(gap: 12, background: .color(RGBAColor(red: 1, green: 1, blue: 1)), borderRadius: 20)
        let geometry = try CollageGeometry(layout: layout, canvasSize: CGSize(width: 1200, height: 900), settings: opaque)
        // 1164 available horizontal units, split 2:1. The spanning cell includes
        // both 432-high rows AND the 12-unit gap, rather than subtracting it twice.
        #expect(geometry.cells == [
            LayoutCell(area: "a", frame: CGRect(x: 12, y: 12, width: 776, height: 876), cornerRadius: 20),
            LayoutCell(area: "b", frame: CGRect(x: 800, y: 12, width: 388, height: 432), cornerRadius: 20),
            LayoutCell(area: "c", frame: CGRect(x: 800, y: 456, width: 388, height: 432), cornerRadius: 20),
        ])
        var transparent = opaque
        transparent.background = .transparent
        let unpadded = try CollageGeometry(layout: layout, canvasSize: CGSize(width: 1200, height: 900), settings: transparent)
        #expect(unpadded.cells[0].frame == CGRect(x: 0, y: 0, width: 792, height: 900))
        #expect(unpadded.cells[2].frame == CGRect(x: 804, y: 456, width: 396, height: 444))

        // Explicit alpha-zero color still has CSS non-"transparent" padding semantics.
        var alphaZero = opaque
        alphaZero.background = .color(RGBAColor(red: 0, green: 0, blue: 0, alpha: 0))
        #expect(try CollageGeometry(layout: layout, canvasSize: geometry.canvasSize, settings: alphaZero).cells == geometry.cells)

        let exported = try geometry.scaled(by: 2.5)
        #expect(exported.canvasSize == CGSize(width: 3000, height: 2250))
        #expect(exported.cornerRadius == 50)
        #expect(exported.cells[2] == LayoutCell(area: "c", frame: CGRect(x: 2000, y: 1140, width: 970, height: 1080), cornerRadius: 50))
    }

    @Test func emptyGridCellsStayEmptyAndRadiusDoesNotShrinkSlots() throws {
        let plus = try #require(LayoutCatalog().layout(id: "5-plus"))
        let geometry = try CollageGeometry(layout: plus, canvasSize: CGSize(width: 100, height: 100), settings: CollageSettings(gap: 0, borderRadius: 100))
        #expect(geometry.cells.map(\.area) == ["a", "b", "c", "d", "e"])
        #expect(geometry.cells[0] == LayoutCell(area: "a", frame: CGRect(x: 25, y: 0, width: 50, height: 25), cornerRadius: 12.5))
        #expect(geometry.cells[2] == LayoutCell(area: "c", frame: CGRect(x: 25, y: 25, width: 50, height: 50), cornerRadius: 25))
        #expect(geometry.cornerRadius == 50)
    }

    @Test func coverPositionUsesOverflowFractionForBothImageOrientations() throws {
        let landscape = try PhotoGeometry(
            imageSize: CGSize(width: 800, height: 200),
            cell: CGRect(x: 30, y: 70, width: 200, height: 100),
            transform: PhotoTransform(positionX: 0.25, positionY: 0.75)
        )
        #expect(landscape.imageRect == CGRect(x: -50, y: 0, width: 400, height: 100))
        #expect(landscape.contentBounds == CGRect(x: 0, y: 0, width: 200, height: 100))
        #expect(CGPoint(x: 0, y: 0).applying(landscape.contentTransform) == CGPoint(x: 30, y: 70))
        let portrait = try PhotoGeometry(
            imageSize: CGSize(width: 100, height: 400),
            cell: CGRect(x: 0, y: 0, width: 200, height: 100),
            transform: PhotoTransform(positionX: 0.1, positionY: 0.75)
        )
        #expect(portrait.imageRect == CGRect(x: 0, y: -525, width: 200, height: 800))
    }

    @Test func cropPrecedesClockwiseRotationAndZoomAroundSlotCenter() throws {
        let photo = try PhotoGeometry(
            imageSize: CGSize(width: 100, height: 400),
            cell: CGRect(x: 30, y: 70, width: 200, height: 100),
            transform: PhotoTransform(positionX: 0, positionY: 0, rotationDegrees: 90, scale: 0.5)
        )
        // Cover first shows y=0...50 of the original. Zoom must not change that crop.
        #expect(photo.imageRect == CGRect(x: 0, y: 0, width: 200, height: 800))
        let topLeft = CGPoint.zero.applying(photo.contentTransform)
        let bottomRight = CGPoint(x: 200, y: 100).applying(photo.contentTransform)
        #expect(abs(topLeft.x - 155) < 1e-9)
        #expect(abs(topLeft.y - 70) < 1e-9)
        #expect(abs(bottomRight.x - 105) < 1e-9)
        #expect(abs(bottomRight.y - 170) < 1e-9)
        let center = CGPoint(x: 100, y: 50).applying(photo.contentTransform)
        #expect(abs(center.x - 130) < 1e-9 && abs(center.y - 120) < 1e-9)

        // A quarter-turn does NOT recalculate aspect-fill to cover the empty corners.
        let turned = try PhotoGeometry(
            imageSize: CGSize(width: 400, height: 200), cell: photo.contentBounds,
            transform: PhotoTransform(rotationDegrees: 90)
        )
        #expect(turned.imageRect == CGRect(x: 0, y: 0, width: 200, height: 100))
        let rotatedBounds = turned.contentBounds.applying(turned.contentTransform)
        #expect(abs(rotatedBounds.width - 100) < 1e-9)
        #expect(abs(rotatedBounds.height - 200) < 1e-9)
    }

    @Test func fineRotationSupportsNegativeAnglesAndNonUnitZoom() throws {
        let photo = try PhotoGeometry(
            imageSize: CGSize(width: 500, height: 300),
            cell: CGRect(x: 10, y: 20, width: 200, height: 100),
            transform: PhotoTransform(rotationDegrees: -30, scale: 2)
        )
        // Point (200,50) is 100 right of center: rotate -30°, double, translate.
        let point = CGPoint(x: 200, y: 50).applying(photo.contentTransform)
        #expect(abs(point.x - 283.2050807568877) < 1e-9)
        #expect(abs(point.y - (-30)) < 1e-9)
    }

    @Test func rejectsUnrenderableGeometry() throws {
        let layout = try #require(LayoutCatalog().layout(id: "2-horizontal"))
        #expect(throws: CollageValidationError.self) {
            try CollageGeometry(layout: layout, canvasSize: CGSize(width: 8, height: 10), settings: CollageSettings(gap: 8))
        }
        #expect(throws: CollageValidationError.self) {
            try PhotoGeometry(imageSize: .zero, cell: CGRect(x: 0, y: 0, width: 10, height: 20), transform: PhotoTransform())
        }
        #expect(throws: CollageValidationError.self) {
            try PhotoGeometry(imageSize: CGSize(width: 10, height: 20), cell: CGRect(x: 0, y: 0, width: 10, height: 20), transform: PhotoTransform(scale: .nan))
        }
    }
}
