import CoreGraphics
import Foundation
import Testing
@testable import CollageMaker

/// Value rules behind the editor's spacing, radius and background controls.
/// Expected preset values are the web hex codes from CustomizationControls.tsx.
struct CollageStyleControlsTests {
    @Test func presetsMatchTheWebPaletteWithTransparencyKeptDistinct() throws {
        let presets = CollageStyle.backgroundPresets
        #expect(presets.map(\.name) == [
            "Transparent", "White", "Black", "Cream", "Soft Pink",
            "Lavender", "Mint", "Sky Blue", "Peach", "Sage",
        ])
        #expect(Set(presets.map(\.id)).count == presets.count)
        #expect(presets[0].background == .transparent)
        #expect(presets.dropFirst().allSatisfy { $0.color?.alpha == 1 })
        // #E6E6FA and #D4E7D4, channel by channel.
        let lavender = try #require(presets.first { $0.id == "lavender" }?.color)
        #expect(lavender == RGBAColor(red: 230.0 / 255, green: 230.0 / 255, blue: 250.0 / 255))
        let sage = try #require(presets.first { $0.id == "sage" }?.color)
        #expect(sage == RGBAColor(red: 212.0 / 255, green: 231.0 / 255, blue: 212.0 / 255))
        for preset in presets {
            try CollageSettings(background: preset.background).validate()
        }
    }

    @Test func slidersShowSavedValuesAboveTheWebRangeWithoutClamping() {
        #expect(CollageStyle.sliderRange(for: 8, standardMaximum: 40) == 0...40)
        #expect(CollageStyle.sliderRange(for: 40, standardMaximum: 40) == 0...40)
        #expect(CollageStyle.sliderRange(for: 64, standardMaximum: 40) == 0...64)
        #expect(CollageStyle.sliderRange(for: 33, standardMaximum: 32) == 0...33)
        #expect(CollageStyle.sliderRange(for: 100, standardMaximum: 32) == 0...100)
    }

    @Test func customColorsKeepTheirChannelsAndAlpha() throws {
        let saved = CollageBackground.color(RGBAColor(red: 0.2, green: 0.4, blue: 0.8, alpha: 0.6))
        let shown = CollageStyle.cgColor(for: saved)
        // Presenting the stored color back to the picker must not rewrite it.
        #expect(CollageStyle.background(afterPicking: shown, current: saved) == nil)
        #expect(CollageStyle.description(of: saved) == "Custom #3366CC, 60% opacity")

        let picked = CGColor(srgbRed: 0.1, green: 0.5, blue: 0.3, alpha: 0.25)
        let changed = try #require(CollageStyle.background(afterPicking: picked, current: saved))
        guard case let .color(color) = changed else {
            Issue.record("a picked color must not become transparent")
            return
        }
        #expect(abs(color.red - 0.1) < 1e-6 && abs(color.green - 0.5) < 1e-6)
        #expect(abs(color.blue - 0.3) < 1e-6 && abs(color.alpha - 0.25) < 1e-6)

        // Picking from transparent always produces a color, even white.
        let white = CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1)
        #expect(CollageStyle.background(afterPicking: white, current: .transparent) == .color(RGBAColor(red: 1, green: 1, blue: 1)))
    }

    @Test func wideGamutPicksAreClampedIntoValidSettings() throws {
        let p3 = try #require(CGColorSpace(name: CGColorSpace.displayP3))
        let vividRed = try #require(CGColor(colorSpace: p3, components: [1, 0, 0, 1]))
        let background = try #require(CollageStyle.background(afterPicking: vividRed, current: .transparent))
        try CollageSettings(background: background).validate()
        guard case let .color(color) = background else {
            Issue.record("expected a color")
            return
        }
        #expect(color.red == 1)
        #expect(color.green == 0)
    }

    @Test func statusNamesEveryChoiceInWords() {
        #expect(CollageStyle.description(of: .transparent) == "Transparent")
        #expect(CollageStyle.description(of: .color(RGBAColor(red: 1, green: 1, blue: 1))) == "White")
        #expect(CollageStyle.description(of: .color(RGBAColor(red: 1, green: 1, blue: 1, alpha: 0.5))) == "Custom #FFFFFF, 50% opacity")
        #expect(CollageStyle.description(of: .color(RGBAColor(red: 0.5, green: 0, blue: 0.5))) == "Custom #800080")
    }
}
