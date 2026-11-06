import CoreGraphics
import SwiftUI

/// A named background choice. `color == nil` is the transparent background.
struct BackgroundPreset: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let color: RGBAColor?

    var background: CollageBackground { color.map(CollageBackground.color) ?? .transparent }
}

/// Value rules for the style controls, kept apart from the view so they can be tested.
enum CollageStyle {
    /// Slider maximums from the web editor (CustomizationControls.tsx); both step by 2.
    static let standardGapMaximum: Double = 40
    static let standardRadiusMaximum: Double = 32
    static let step: Double = 2
    /// The largest value project validation accepts.
    static let storedMaximum: Double = 100

    /// The web app's preset backgrounds, in its order.
    static let backgroundPresets: [BackgroundPreset] = [
        BackgroundPreset(id: "transparent", name: "Transparent", color: nil),
        preset("white", "White", 0xFFFFFF),
        preset("black", "Black", 0x000000),
        preset("cream", "Cream", 0xFAF9F6),
        preset("softPink", "Soft Pink", 0xFFE4E8),
        preset("lavender", "Lavender", 0xE6E6FA),
        preset("mint", "Mint", 0xE8F5E9),
        preset("skyBlue", "Sky Blue", 0xE3F2FD),
        preset("peach", "Peach", 0xFFE5D9),
        preset("sage", "Sage", 0xD4E7D4),
    ]

    private static func preset(_ id: String, _ name: String, _ hex: Int) -> BackgroundPreset {
        BackgroundPreset(id: id, name: name, color: RGBAColor(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        ))
    }

    /// The slider range for `value`: the web range, widened so a valid saved value above it
    /// is shown as-is instead of being clamped when the editor opens.
    static func sliderRange(for value: Double, standardMaximum: Double) -> ClosedRange<Double> {
        let upper = value.isFinite ? min(max(standardMaximum, value), storedMaximum) : standardMaximum
        return 0...upper
    }

    static func preset(matching background: CollageBackground) -> BackgroundPreset? {
        backgroundPresets.first { $0.background == background }
    }

    /// Exact stored channels as a color for the picker; transparent shows white, as on the web.
    static func cgColor(for background: CollageBackground) -> CGColor {
        guard case let .color(c) = background else { return CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1) }
        return CGColor(srgbRed: c.red, green: c.green, blue: c.blue, alpha: c.alpha)
    }

    /// Converts a picked color to sRGB, clamping wide-gamut channels into the stored 0...1 range.
    static func rgba(from color: CGColor) -> RGBAColor? {
        guard let srgb = CGColorSpace(name: CGColorSpace.sRGB),
              let converted = color.converted(to: srgb, intent: .defaultIntent, options: nil),
              let components = converted.components, components.count >= 4,
              components.allSatisfy(\.isFinite) else { return nil }
        func clamp(_ value: CGFloat) -> Double { min(max(Double(value), 0), 1) }
        return RGBAColor(
            red: clamp(components[0]), green: clamp(components[1]),
            blue: clamp(components[2]), alpha: clamp(components[3])
        )
    }

    /// The background after a picker change, or nil when the pick does not change the stored
    /// color (so presenting the picker never rewrites a saved value).
    static func background(afterPicking color: CGColor, current: CollageBackground) -> CollageBackground? {
        guard let picked = rgba(from: color) else { return nil }
        if case let .color(existing) = current {
            let tolerance = 0.5 / 255
            let same = abs(existing.red - picked.red) < tolerance && abs(existing.green - picked.green) < tolerance
                && abs(existing.blue - picked.blue) < tolerance && abs(existing.alpha - picked.alpha) < tolerance
            if same { return nil }
        }
        return .color(picked)
    }

    /// Spoken and visible status, so the choice never depends on color alone.
    static func description(of background: CollageBackground) -> String {
        if let preset = preset(matching: background) { return preset.name }
        guard case let .color(c) = background else { return "Transparent" }
        func byte(_ value: Double) -> Int { Int((value * 255).rounded()) }
        var text = "Custom " + String(format: "#%02X%02X%02X", byte(c.red), byte(c.green), byte(c.blue))
        if c.alpha < 1 { text += ", \(Int((c.alpha * 100).rounded()))% opacity" }
        return text
    }
}

/// Spacing, corner radius and background controls bound to an editor draft's settings.
/// The editor presents these in its "Style" sheet, which supplies the title.
struct CollageStyleControls: View {
    @Binding var settings: CollageSettings
    @ScaledMetric(relativeTo: .body) private var swatchDiameter: CGFloat = 24

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            styleSlider(
                "Photo spacing", value: $settings.gap,
                standardMaximum: CollageStyle.standardGapMaximum, identifier: "styleGap"
            )
            styleSlider(
                "Corner radius", value: $settings.borderRadius,
                standardMaximum: CollageStyle.standardRadiusMaximum, identifier: "styleRadius"
            )
            VStack(alignment: .leading, spacing: 12) {
                Text("Background").font(.headline).accessibilityAddTraits(.isHeader)
                HStack(spacing: 10) {
                    swatch(settings.background)
                        .frame(width: swatchDiameter, height: swatchDiameter)
                        .clipShape(Circle())
                        .overlay(Circle().strokeBorder(Color.secondary, lineWidth: 1))
                        .accessibilityHidden(true)
                    Text("Background: \(CollageStyle.description(of: settings.background))")
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("backgroundStatus")
                }
                Menu {
                    Picker("Background", selection: presetBinding) {
                        ForEach(CollageStyle.backgroundPresets) { preset in
                            Text(preset.name)
                                .tag(Optional(preset.id))
                                .accessibilityIdentifier("background.\(preset.id)")
                        }
                    }
                } label: {
                    HStack {
                        Text("Choose background preset").fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 12)
                        Image(systemName: "chevron.up.chevron.down").accessibilityHidden(true)
                    }
                    .foregroundStyle(Color.accentColor)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .accessibilityIdentifier("backgroundPresetPicker")
                ColorPicker(selection: customColorBinding, supportsOpacity: true) {
                    Text("Custom background color").fixedSize(horizontal: false, vertical: true)
                }
                .frame(minHeight: 44)
                .accessibilityIdentifier("background.custom")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func styleSlider(
        _ title: String, value: Binding<Double>, standardMaximum: Double, identifier: String
    ) -> some View {
        let points = Int(value.wrappedValue.rounded())
        return VStack(alignment: .leading) {
            Text("\(title): \(points) pt")
            Slider(
                value: value,
                in: CollageStyle.sliderRange(for: value.wrappedValue, standardMaximum: standardMaximum),
                step: CollageStyle.step
            )
            .frame(minHeight: 44)
            .accessibilityLabel(title)
            .accessibilityValue("\(points) points")
            .accessibilityIdentifier(identifier)
        }
    }

    @ViewBuilder private func swatch(_ background: CollageBackground) -> some View {
        if case .color = background {
            Color(cgColor: CollageStyle.cgColor(for: background))
        } else {
            // A checkerboard marks transparency, as in the web editor.
            Canvas { context, size in
                context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(.white))
                let tile = size.width / 5
                for row in 0..<5 {
                    for column in 0..<5 where (row + column).isMultiple(of: 2) {
                        let rect = CGRect(x: CGFloat(column) * tile, y: CGFloat(row) * tile, width: tile, height: tile)
                        context.fill(Path(rect), with: .color(Color(white: 0.8)))
                    }
                }
            }
        }
    }

    /// The matching preset's ID, or nil for a custom color (no menu checkmark).
    private var presetBinding: Binding<String?> {
        Binding(
            get: { CollageStyle.preset(matching: settings.background)?.id },
            set: { id in
                guard let preset = CollageStyle.backgroundPresets.first(where: { $0.id == id }) else { return }
                settings.background = preset.background
            })
    }

    private var customColorBinding: Binding<CGColor> {
        Binding(
            get: { CollageStyle.cgColor(for: settings.background) },
            set: { picked in
                if let background = CollageStyle.background(afterPicking: picked, current: settings.background) {
                    settings.background = background
                }
            })
    }
}
