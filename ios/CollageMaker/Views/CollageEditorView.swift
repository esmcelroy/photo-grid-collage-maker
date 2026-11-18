import SwiftUI

/// Inline Photos, Layout and Style controls for one draft. Persistence stays in `ProjectView`:
/// this view writes only through `draft`. Selecting a photo reveals that photo's crop,
/// rotation, zoom and swap controls; Layout and Style stay open below it.
struct CollageEditorView<Photos: View>: View {
    @Binding var draft: CollageProject
    let catalog: LayoutCatalog
    let originalURLs: [UUID: URL]
    let enabled: Bool
    let onError: (String) -> Void
    @ViewBuilder let photosSection: () -> Photos

    @State private var selectedArea = ""
    @State private var swapArea = ""
    /// Set only by a photo-strip tap, so the slot menu and sliders do not jump the scroll.
    @State private var photoSectionRequest = 0
    @ScaledMetric(relativeTo: .body) private var thumbnailSide: CGFloat = 56
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private enum WorkspaceScroll: Hashable { case photoControls }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    section { photosSection() }
                    if let layout = currentLayout, !draft.positions.isEmpty {
                        photoStrip(layout)
                            .padding(.horizontal, 16)
                            .padding(.bottom, 12)
                    }
                    Divider()
                    section { layoutSection }
                    Divider()
                    section { styleSection }
                    if showsPhotoControls {
                        Divider()
                        section { photoSection }
                            .id(WorkspaceScroll.photoControls)
                    }
                }
                .buttonStyle(.plain)
                .frame(maxWidth: 600)
                .frame(maxWidth: .infinity)
            }
            .onChange(of: photoSectionRequest) {
                withAnimation {
                    proxy.scrollTo(WorkspaceScroll.photoControls, anchor: .top)
                }
            }
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .font(.body)
        .disabled(!enabled)
        .onAppear { alignSelection() }
        .onChange(of: draft.selectedLayoutID) { alignSelection() }
        .onChange(of: draft.photos.map(\.id)) { alignSelection() }
        .onChange(of: selectedArea) { swapArea = "" }
    }

    private func section<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(.horizontal, 16)
            .padding(.vertical, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var layoutSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Layout")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            if draft.photos.isEmpty {
                Text("Layouts appear after you add photos.")
                    .font(.subheadline)
                    .foregroundStyle(.primary)
            } else if let current = currentLayout {
                LayoutChoiceGrid(
                    layouts: catalog.layouts(forPhotoCount: draft.photos.count),
                    selection: current.id,
                    onSelect: selectLayout
                )
                Text("Changing layout resets photo positions, rotation and zoom.")
                    .font(.footnote)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text("This collage's layout is unavailable.")
                    .font(.subheadline)
                    .foregroundStyle(.primary)
            }
        }
    }

    private var styleSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Style")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            CollageStyleControls(settings: $draft.settings)
        }
    }

    private var showsPhotoControls: Bool {
        currentLayout != nil && !draft.positions.isEmpty
    }

    @ViewBuilder
    private var photoSection: some View {
        if let layout = currentLayout {
            VStack(alignment: .leading, spacing: 16) {
                Text("Photo")
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("photoControls")
                Text(selectedArea.isEmpty
                    ? "Choose a photo above to adjust its crop, rotation and zoom. Layout and Style stay open."
                    : "Slot adjustments stay with the slot when photos are swapped.")
                    .font(.footnote)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)

                Menu {
                    Picker("Slot", selection: $selectedArea) {
                        ForEach(layout.areaNames, id: \.self) { area in
                            Text(slotLabel(area, in: layout)).tag(area)
                        }
                    }
                } label: {
                    controlLabel(
                        selectedArea.isEmpty ? "Choose a slot" : slotLabel(selectedArea, in: layout),
                        systemImage: "chevron.up.chevron.down"
                    )
                }
                .accessibilityIdentifier("slotPicker")

                if let index = draft.positions.firstIndex(where: { $0.area == selectedArea }) {
                    cropControls(index)
                    if layout.areaNames.count > 1 {
                        swapControls(layout)
                    }
                }
            }
        }
    }

    private func photoStrip(_ layout: GridLayout) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(layout.areaNames, id: \.self) { area in
                    Button {
                        selectedArea = area
                        photoSectionRequest += 1
                    } label: {
                        thumbnail(for: area, in: layout)
                            .frame(width: thumbnailSide, height: thumbnailSide)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .overlay {
                                RoundedRectangle(cornerRadius: 8)
                                    .strokeBorder(
                                        selectedArea == area ? Color.accentColor : Color.secondary.opacity(0.4),
                                        lineWidth: selectedArea == area ? 3 : 1
                                    )
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(slotLabel(area, in: layout))
                    .accessibilityAddTraits(selectedArea == area ? .isSelected : [])
                    .accessibilityIdentifier("photoSlot.\(area)")
                }
            }
            .padding(.vertical, 4)
        }
        .accessibilityIdentifier("photoStrip")
    }

    @ViewBuilder
    private func thumbnail(for area: String, in layout: GridLayout) -> some View {
        let photoID = draft.positions.first(where: { $0.area == area })?.photoID
        if let photoID, let url = originalURLs[photoID] {
            // Shared preview downsampler. Never the full original.
            SlotThumbnail(url: url)
        } else {
            Image(systemName: "photo")
                .font(.title2)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color(uiColor: .tertiarySystemFill))
                .accessibilityHidden(true)
        }
    }

    private func cropControls(_ index: Int) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            axisSlider(
                "Horizontal position",
                value: transformBinding(index, \.positionX),
                percent: draft.positions[index].transform.positionX
            )
            axisSlider(
                "Vertical position",
                value: transformBinding(index, \.positionY),
                percent: draft.positions[index].transform.positionY
            )
            Stepper(value: transformBinding(index, \.scale), in: 0.5...3, step: 0.05) {
                Text("Zoom: \(Int((draft.positions[index].transform.scale * 100).rounded()))%")
            }
            .accessibilityIdentifier("photoZoom")
            Text("Rotation: \(Int(draft.positions[index].transform.rotationDegrees))°")
                .accessibilityIdentifier("photoRotation")
            rotationButtons(index)
            Button {
                draft.positions[index].transform = PhotoTransform()
            } label: {
                controlLabel("Reset photo adjustments", systemImage: "arrow.counterclockwise")
            }
            .accessibilityIdentifier("resetPhoto")
        }
    }

    /// Side by side at normal sizes. Accessibility sizes get the full width so the
    /// labels stay on whole words instead of wrapping into single letters.
    private func rotationButtons(_ index: Int) -> some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(spacing: 12))
        return layout {
            Button {
                rotate(index, by: -90)
            } label: {
                controlLabel("Rotate counterclockwise", systemImage: "rotate.left")
            }
            .accessibilityIdentifier("rotateCounterclockwise")
            Button {
                rotate(index, by: 90)
            } label: {
                controlLabel("Rotate clockwise", systemImage: "rotate.right")
            }
            .accessibilityIdentifier("rotateClockwise")
        }
    }

    private func axisSlider(_ title: String, value: Binding<Double>, percent: Double) -> some View {
        let points = Int((percent * 100).rounded())
        return VStack(alignment: .leading) {
            Text("\(title): \(points)%")
            Slider(value: value, in: 0...1, step: 0.01)
                .frame(minHeight: 44)
                .accessibilityLabel(title)
                .accessibilityValue("\(points) percent")
        }
    }

    private func swapControls(_ layout: GridLayout) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Swap photos")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            Menu {
                Picker("Swap with", selection: $swapArea) {
                    Text("Choose a slot").tag("")
                    ForEach(layout.areaNames.filter { $0 != selectedArea }, id: \.self) { area in
                        Text(slotLabel(area, in: layout)).tag(area)
                    }
                }
            } label: {
                controlLabel(
                    swapArea.isEmpty ? "Choose a slot" : slotLabel(swapArea, in: layout),
                    systemImage: "chevron.up.chevron.down"
                )
            }
            .accessibilityIdentifier("swapPicker")
            Button {
                do {
                    try draft.swapPhotos(fromArea: selectedArea, toArea: swapArea)
                    swapArea = ""
                } catch {
                    onError("Those slots could not be swapped. Choose another slot.")
                }
            } label: {
                controlLabel("Swap photos", systemImage: "arrow.left.arrow.right")
            }
            .disabled(swapArea.isEmpty || swapArea == selectedArea)
            .accessibilityIdentifier("swapPhotos")
            Text("Swapping keeps rotation, zoom and position with each slot.")
                .font(.footnote)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func controlLabel(_ title: String, systemImage: String) -> some View {
        HStack {
            Text(title).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 12)
            Image(systemName: systemImage)
                .accessibilityHidden(true)
        }
        .foregroundStyle(Color.accentColor)
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
    }

    private var currentLayout: GridLayout? {
        guard let id = draft.selectedLayoutID else { return nil }
        return catalog.layout(id: id)
    }

    private func selectLayout(_ layout: GridLayout) {
        do {
            try draft.selectLayout(layout)
            selectedArea = ""
            swapArea = ""
        } catch {
            onError("That layout could not be selected.")
        }
    }

    private func alignSelection() {
        guard let layout = currentLayout else {
            selectedArea = ""
            swapArea = ""
            return
        }
        if !layout.areaNames.contains(selectedArea) {
            selectedArea = ""
            swapArea = ""
        }
    }

    private func slotLabel(_ area: String, in layout: GridLayout) -> String {
        let slot = (layout.areaNames.firstIndex(of: area) ?? 0) + 1
        let photoID = draft.positions.first(where: { $0.area == area })?.photoID
        let photo = draft.photos.firstIndex(where: { $0.id == photoID }).map { $0 + 1 } ?? slot
        return "Slot \(slot) · Photo \(photo)"
    }

    private func transformBinding(_ index: Int, _ key: WritableKeyPath<PhotoTransform, Double>) -> Binding<Double> {
        Binding(
            get: { draft.positions[index].transform[keyPath: key] },
            set: { draft.positions[index].transform[keyPath: key] = $0 }
        )
    }

    private func rotate(_ index: Int, by degrees: Double) {
        draft.positions[index].transform.rotationDegrees =
            (draft.positions[index].transform.rotationDegrees + degrees).truncatingRemainder(dividingBy: 360)
    }
}

/// A square slot thumbnail from `CollagePreviewLoader.downsample`, off the main actor.
private struct SlotThumbnail: View {
    let url: URL
    @State private var image: CGImage?

    var body: some View {
        Group {
            if let image {
                Image(decorative: image, scale: 1)
                    .resizable()
                    .scaledToFill()
            } else {
                Color(uiColor: .tertiarySystemFill)
            }
        }
        .task(id: url) {
            image = nil
            let source = url
            let decoded = try? await Task.detached(priority: .utility) {
                try CollagePreviewLoader.downsample(at: source, maximumPixelSize: 256)
            }.value
            guard !Task.isCancelled else { return }
            image = decoded
        }
    }
}

/// Visual layout choices drawn from catalog track geometry, not sample HTML shapes.
struct LayoutChoiceGrid: View {
    let layouts: [GridLayout]
    let selection: String
    let onSelect: (GridLayout) -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private var columns: [GridItem] {
        let count = dynamicTypeSize.isAccessibilitySize ? 2 : 3
        return Array(repeating: GridItem(.flexible(), spacing: 8), count: count)
    }

    var body: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            ForEach(layouts) { layout in
                Button {
                    onSelect(layout)
                } label: {
                    VStack(spacing: 6) {
                        LayoutThumbnail(layout: layout)
                            .frame(height: dynamicTypeSize.isAccessibilitySize ? 44 : 52)
                            .padding(.horizontal, 8)
                            .padding(.top, 8)
                        Text(layout.name)
                            .font(.subheadline)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 4)
                            .padding(.bottom, 8)
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .strokeBorder(
                                selection == layout.id ? Color.accentColor : Color.secondary.opacity(0.35),
                                lineWidth: selection == layout.id ? 2 : 1
                            )
                    )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(layout.name)
                .accessibilityAddTraits(selection == layout.id ? .isSelected : [])
                .accessibilityIdentifier("layout.\(layout.id)")
            }
        }
        .accessibilityIdentifier("layoutPicker")
    }
}

/// A miniature of one catalog layout. Cell frames come from `CollageGeometry`.
struct LayoutThumbnail: View {
    let layout: GridLayout

    var body: some View {
        Canvas { context, size in
            let settings = CollageSettings(gap: 6, background: .color(RGBAColor(red: 1, green: 1, blue: 1)), borderRadius: 2)
            guard let geometry = try? CollageGeometry(layout: layout, canvasSize: layout.compositionSize, settings: settings) else {
                return
            }
            let scale = min(size.width / geometry.canvasSize.width, size.height / geometry.canvasSize.height)
            let origin = CGPoint(
                x: (size.width - geometry.canvasSize.width * scale) / 2,
                y: (size.height - geometry.canvasSize.height * scale) / 2
            )
            for (index, cell) in geometry.cells.enumerated() {
                let frame = CGRect(
                    x: origin.x + cell.frame.minX * scale,
                    y: origin.y + cell.frame.minY * scale,
                    width: cell.frame.width * scale,
                    height: cell.frame.height * scale
                )
                let fill = index.isMultiple(of: 2) ? Color.accentColor.opacity(0.55) : Color.accentColor.opacity(0.28)
                context.fill(Path(roundedRect: frame, cornerRadius: cell.cornerRadius * scale), with: .color(fill))
            }
        }
        .aspectRatio(layout.aspectRatio, contentMode: .fit)
        .accessibilityHidden(true)
    }
}
