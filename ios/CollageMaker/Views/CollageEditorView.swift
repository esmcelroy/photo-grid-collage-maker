import SwiftUI

/// An explicit draft: Cancel never writes, and Save dismisses only after persistence succeeds.
struct CollageEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State var draft: CollageProject
    let catalog: LayoutCatalog
    let store: ProjectStore
    let originalURLs: [UUID: URL]
    let onSave: (CollageProject) -> Void
    @State private var selectedArea = ""
    @State private var swapArea = ""
    @State private var saving = false
    @State private var saveError: String?
    @State private var showingStyle = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    if let layout = catalog.layout(id: draft.selectedLayoutID ?? "") {
                        CollagePreview(
                            CollagePreviewRequest(
                                project: draft, layout: layout, originalURLs: originalURLs,
                                compositionSize: CGSize(width: 400, height: 400 / layout.aspectRatio),
                                maximumPixelSize: 1200
                            )
                        )
                        .frame(maxHeight: 260)
                        .accessibilityIdentifier("editorPreview")
                        GroupBox {
                            VStack(alignment: .leading, spacing: 16) {
                                Text("Layout").font(.headline).accessibilityAddTraits(.isHeader)
                                Menu {
                                    Picker("Layout", selection: layoutBinding) {
                                        ForEach(catalog.layouts(forPhotoCount: draft.photos.count)) { layout in
                                            Text(layout.name).tag(layout.id)
                                        }
                                    }
                                } label: {
                                    controlLabel(layout.name, systemImage: "chevron.down")
                                }
                                .accessibilityIdentifier("layoutPicker")
                                Text("Changing layout resets photo positions, rotation and zoom.")
                                    .font(.footnote)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        GroupBox {
                            VStack(alignment: .leading, spacing: 20) {
                                Text("Photo slot").font(.headline).accessibilityAddTraits(.isHeader)
                                Menu {
                                    Picker("Slot", selection: $selectedArea) {
                                        ForEach(layout.areaNames, id: \.self) { area in
                                            Text(slotLabel(area, in: layout)).tag(area)
                                        }
                                    }
                                } label: {
                                    controlLabel(slotLabel(selectedArea, in: layout), systemImage: "chevron.down")
                                }
                                .accessibilityIdentifier("slotPicker")
                                if let index = draft.positions.firstIndex(where: { $0.area == selectedArea }) {
                                    VStack(alignment: .leading) {
                                        Text(
                                            "Horizontal position: \(Int((draft.positions[index].transform.positionX * 100).rounded()))%"
                                        )
                                        Slider(value: transformBinding(index, \.positionX), in: 0...1, step: 0.01)
                                            .accessibilityLabel("Horizontal position")
                                            .accessibilityValue(
                                                "\(Int((draft.positions[index].transform.positionX * 100).rounded())) percent"
                                            )
                                    }
                                    VStack(alignment: .leading) {
                                        Text(
                                            "Vertical position: \(Int((draft.positions[index].transform.positionY * 100).rounded()))%"
                                        )
                                        Slider(value: transformBinding(index, \.positionY), in: 0...1, step: 0.01)
                                            .accessibilityLabel("Vertical position")
                                            .accessibilityValue(
                                                "\(Int((draft.positions[index].transform.positionY * 100).rounded())) percent"
                                            )
                                    }
                                    Stepper(value: transformBinding(index, \.scale), in: 0.5...3, step: 0.05) {
                                        Text("Zoom: \(Int((draft.positions[index].transform.scale * 100).rounded()))%")
                                    }
                                    .accessibilityIdentifier("photoZoom")
                                    Text("Rotation: \(Int(draft.positions[index].transform.rotationDegrees))°")
                                        .accessibilityIdentifier("photoRotation")
                                    Button {
                                        rotate(index, by: 90)
                                    } label: {
                                        controlLabel("Rotate clockwise", systemImage: "rotate.right")
                                    }
                                    Button {
                                        rotate(index, by: -90)
                                    } label: {
                                        controlLabel("Rotate counterclockwise", systemImage: "rotate.left")
                                    }
                                    Button {
                                        draft.positions[index].transform = PhotoTransform()
                                    } label: {
                                        controlLabel("Reset photo adjustments", systemImage: "arrow.counterclockwise")
                                    }
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        if layout.areaNames.count > 1 {
                            GroupBox {
                                VStack(alignment: .leading, spacing: 16) {
                                    Text("Swap photos").font(.headline).accessibilityAddTraits(.isHeader)
                                    Menu {
                                        Picker("Swap with", selection: $swapArea) {
                                            Text("Choose a slot").tag("")
                                            ForEach(layout.areaNames.filter { $0 != selectedArea }, id: \.self) {
                                                area in
                                                Text(slotLabel(area, in: layout)).tag(area)
                                            }
                                        }
                                    } label: {
                                        controlLabel(
                                            swapArea.isEmpty ? "Choose a slot" : slotLabel(swapArea, in: layout),
                                            systemImage: "chevron.down")
                                    }
                                    .accessibilityIdentifier("swapPicker")
                                    Button {
                                        do { try draft.swapPhotos(fromArea: selectedArea, toArea: swapArea) } catch {
                                            saveError = "Those slots could not be swapped. Choose another slot."
                                        }
                                    } label: {
                                        controlLabel("Swap photos", systemImage: "arrow.left.arrow.right")
                                    }
                                    .disabled(swapArea.isEmpty || swapArea == selectedArea)
                                    .buttonStyle(ReadableEditorButtonStyle())
                                    .saturation(swapArea.isEmpty || swapArea == selectedArea ? 0 : 1)
                                    Text("Swapping keeps rotation, zoom and position with each slot.")
                                        .font(.footnote)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                    GroupBox {
                        Button {
                            showingStyle = true
                        } label: {
                            controlLabel("Edit style", systemImage: "chevron.right")
                        }
                        .accessibilityIdentifier("editStyle")
                    }
                }
                .buttonStyle(.plain)
                .padding(24)
                .frame(maxWidth: 600)
                .frame(maxWidth: .infinity)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .font(.body)
            .disabled(saving)
            .navigationTitle("Edit collage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color(uiColor: .systemGroupedBackground), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel("Cancel")
                    .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        save()
                    } label: {
                        Group {
                            if saving { ProgressView() } else { Image(systemName: "checkmark") }
                        }
                        .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel(saving ? "Saving changes" : "Save changes")
                    .disabled(saving)
                    .accessibilityIdentifier("saveEdits")
                }
            }
            .interactiveDismissDisabled(saving)
            .sheet(isPresented: $showingStyle) {
                // Edits the same draft; only the editor's Save persists them.
                NavigationStack {
                    ScrollView {
                        CollageStyleControls(settings: $draft.settings)
                            .padding(24)
                    }
                    .background(Color(uiColor: .systemGroupedBackground))
                    .navigationTitle("Style")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button {
                                showingStyle = false
                            } label: {
                                Image(systemName: "checkmark")
                                    .frame(minWidth: 44, minHeight: 44)
                            }
                            .accessibilityLabel("Done")
                            .accessibilityIdentifier("closeStyle")
                        }
                    }
                }
                .presentationDetents([.medium, .large])
            }
            .onAppear { selectedArea = draft.positions.first?.area ?? "" }
            .onChange(of: selectedArea) { swapArea = "" }
            .alert(
                "Changes could not be applied",
                isPresented: Binding(
                    get: { saveError != nil },
                    set: { if !$0 { saveError = nil } }
                )
            ) {
                Button("OK", role: .cancel) { saveError = nil }
            } message: {
                Text(saveError ?? "")
            }
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

    private var layoutBinding: Binding<String> {
        Binding(
            get: { draft.selectedLayoutID ?? "" },
            set: { id in
                guard let layout = catalog.layout(id: id) else { return }
                do {
                    try draft.selectLayout(layout)
                    selectedArea = layout.areaNames.first ?? ""
                    swapArea = ""
                } catch { saveError = "That layout could not be selected." }
            })
    }

    private func slotLabel(_ area: String, in layout: GridLayout) -> String {
        let slot = (layout.areaNames.firstIndex(of: area) ?? 0) + 1
        let photoID = draft.positions.first(where: { $0.area == area })?.photoID
        let photo = draft.photos.firstIndex(where: { $0.id == photoID }).map { $0 + 1 } ?? slot
        return "Slot \(slot) · Photo \(photo)"
    }

    private func transformBinding(_ index: Int, _ key: WritableKeyPath<PhotoTransform, Double>)
        -> Binding<Double>
    {
        Binding(
            get: { draft.positions[index].transform[keyPath: key] },
            set: {
                draft.positions[index].transform[keyPath: key] = $0
            })
    }

    private func rotate(_ index: Int, by degrees: Double) {
        draft.positions[index].transform.rotationDegrees =
            (draft.positions[index].transform.rotationDegrees + degrees).truncatingRemainder(
                dividingBy: 360)
    }

    private func save() {
        guard !saving else { return }
        saving = true
        saveError = nil
        let snapshot = draft
        Task {
            do {
                let saved = try await store.saveProject(snapshot)
                onSave(saved)
                dismiss()
            } catch {
                saveError =
                    "Your draft is still here. Use the checkmark to retry saving, or the close button to discard changes."
                saving = false
            }
        }
    }
}

/// Keep disabled text legible; semantic disabled state is still provided by Button.
private struct ReadableEditorButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? 0.8 : 1)
    }
}
