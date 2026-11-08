import SwiftUI

/// Exports one project snapshot at an exact pixel size, then offers the system share sheet.
/// The snapshot is fixed when the sheet opens, so later edits can't change a pending export.
struct ExportView: View {
    @Environment(\.dismiss) private var dismiss
    let project: CollageProject
    let layout: GridLayout
    let originalURLs: [UUID: URL]
    let exporter: CollageExporter

    @State private var width: String
    @State private var height: String
    @State private var format: CollageRenderFormat = .png
    @State private var quality = 90.0
    @State private var pending: Task<Void, Never>?
    @State private var exported: ExportedCollage?
    @State private var errorMessage: String?
    @FocusState private var focusedField: Field?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private enum Field { case width, height }

    init(project: CollageProject, layout: GridLayout, originalURLs: [UUID: URL], exporter: CollageExporter = CollageExporter()) {
        self.project = project
        self.layout = layout
        self.originalURLs = originalURLs
        self.exporter = exporter
        let initial = ExportPreset.all[0].dimensions(aspectRatio: layout.aspectRatio)
        _width = State(initialValue: String(initial.width))
        _height = State(initialValue: String(initial.height))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    sizeSection
                    formatSection
                }
                .disabled(pending != nil)
                .padding(24)
                .frame(maxWidth: 600)
                .frame(maxWidth: .infinity)
            }
            // Pinned so creating and sharing never scroll the options away.
            .safeAreaInset(edge: .bottom) {
                VStack(alignment: .leading, spacing: 8) { exportSection }
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .frame(maxWidth: 600)
                    .frame(maxWidth: .infinity)
                    .background(Color(uiColor: .systemGroupedBackground))
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Export")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color(uiColor: .systemGroupedBackground), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    // Closing during an export cancels it; the exporter deletes any partial file.
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel(pending == nil ? "Close" : "Cancel export")
                    .accessibilityIdentifier("closeExport")
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedField = nil }
                }
            }
            .onAppear {
                // No share sheet can be using a file yet, so clear anything an earlier session left.
                exporter.discardAll()
            }
            .onDisappear {
                pending?.cancel()
                discardExport()
            }
            .onChange(of: optionsKey) { discardExport() }
        }
    }

    private var sizeSection: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(ExportPreset.all) { preset in
                    let size = preset.dimensions(aspectRatio: layout.aspectRatio)
                    let selected = parsedDimensions == size
                    Button {
                        width = String(size.width)
                        height = String(size.height)
                        errorMessage = nil
                    } label: {
                        HStack {
                            // Large text puts the size under the name instead of wrapping both.
                            let stacked = dynamicTypeSize.isAccessibilitySize
                            (stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4)) : AnyLayout(HStackLayout())) {
                                Text(preset.label).font(.body.weight(.semibold))
                                if !stacked { Spacer() }
                                Text(verbatim: "\(size.width) × \(size.height)")
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: "checkmark")
                                .opacity(selected ? 1 : 0)
                                .accessibilityHidden(true)
                        }
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text(verbatim: "\(preset.label), \(size.width) by \(size.height) pixels"))
                    .accessibilityAddTraits(selected ? .isSelected : [])
                    .accessibilityIdentifier("exportPreset.\(preset.id)")
                }
                Divider()
                // Large text moves the fields under their label; the same views stay on screen.
                let row = dynamicTypeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 8))
                row {
                    Text("Custom")
                        .frame(maxWidth: .infinity, alignment: .leading)
                    HStack(spacing: 8) {
                        pixelField("Width", text: $width, field: .width, identifier: "exportWidth")
                        Text(verbatim: "×").accessibilityHidden(true)
                        pixelField("Height", text: $height, field: .height, identifier: "exportHeight")
                        Text("px").accessibilityHidden(true)
                    }
                }
                if let note = sizeNote {
                    Text(note)
                        .font(.footnote)
                        .accessibilityIdentifier("exportSizeNote")
                }
            }
        } label: {
            Text("Size").font(.headline)
        }
    }

    /// A visibly editable number field; VoiceOver hears which dimension it sets.
    private func pixelField(_ label: String, text: Binding<String>, field: Field, identifier: String) -> some View {
        TextField(label, text: text)
            .keyboardType(.numberPad)
            .multilineTextAlignment(.center)
            .focused($focusedField, equals: field)
            .padding(.horizontal, 10)
            .frame(minWidth: 80, minHeight: 44)
            .fixedSize(horizontal: true, vertical: false)
            .background(Color(uiColor: .tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))
            .accessibilityLabel("\(label) in pixels")
            .accessibilityIdentifier(identifier)
    }

    private var formatSection: some View {
        GroupBox {
            VStack(alignment: .leading, spacing: 12) {
                Picker("Format", selection: $format) {
                    Text("PNG").tag(CollageRenderFormat.png)
                    Text("JPEG").tag(CollageRenderFormat.jpeg)
                }
                .pickerStyle(.segmented)
                .frame(minHeight: 44)
                .accessibilityIdentifier("exportFormat")
                Text(format == .png
                     ? "Lossless. Transparent areas stay transparent."
                     : "Smaller file. Transparent areas become white.")
                    .font(.footnote)
                if format == .jpeg {
                    // Large text stacks the label so the slider keeps a usable width.
                    let layout = dynamicTypeSize.isAccessibilitySize
                        ? AnyLayout(VStackLayout(alignment: .leading)) : AnyLayout(HStackLayout(spacing: 12))
                    layout {
                        Text(verbatim: "Quality \(Int(quality))%")
                            .monospacedDigit()
                            .accessibilityHidden(true)
                        Slider(value: $quality, in: 10...100, step: 5) {
                            Text("JPEG quality")
                        }
                        .frame(minHeight: 44)
                        .accessibilityValue("\(Int(quality)) percent")
                        .accessibilityIdentifier("exportQuality")
                    }
                }
            }
        } label: {
            Text("Format").font(.headline)
        }
    }

    /// One primary action at a time: Create Image, then Share once that file is ready.
    /// Changing an option discards the file and brings Create Image back.
    @ViewBuilder
    private var exportSection: some View {
        if let errorMessage {
            Label(errorMessage, systemImage: "exclamationmark.triangle")
                .font(.body)
                .accessibilityIdentifier("exportError")
        }

        if let exported {
            Text(verbatim: "Ready: \(exported.fileURL.lastPathComponent), \(exported.dimensions.width) × \(exported.dimensions.height) px, \(Int64(exported.byteCount).formatted(.byteCount(style: .file)))")
                .font(.body)
                .accessibilityIdentifier("exportStatus")
            ShareLink(item: exported.fileURL) {
                Label("Share", systemImage: "square.and.arrow.up")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .accessibilityIdentifier("exportShare")
        } else {
            Button(action: startExport) {
                HStack {
                    if pending != nil { ProgressView() }
                    Text(pending == nil ? "Create Image" : "Creating Image…")
                }
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .accessibilityIdentifier("exportCreate")
        }
    }

    private var parsedDimensions: ExportDimensions? {
        try? ExportDimensions.parse(width: width, height: height).get()
    }

    /// A note when a valid typed size will stretch the layout. Invalid sizes are reported on Create.
    private var sizeNote: String? {
        guard let size = parsedDimensions else { return nil }
        let ratio = Double(size.width) / Double(size.height)
        guard abs(ratio - layout.aspectRatio) / layout.aspectRatio > 0.01 else { return nil }
        return "This size doesn't match the layout's shape, so the collage will be stretched."
    }

    /// Changing any option invalidates a file made with the previous options.
    private var optionsKey: String { "\(width)|\(height)|\(format)|\(quality)" }

    private func startExport() {
        guard pending == nil else { return }
        focusedField = nil
        errorMessage = nil
        let dimensions: ExportDimensions
        switch ExportDimensions.parse(width: width, height: height) {
        case let .success(value): dimensions = value
        case let .failure(error):
            errorMessage = error.message
            return
        }
        discardExport()
        let request = CollageExportRequest(
            project: project, layout: layout, originalURLs: originalURLs,
            dimensions: dimensions, format: format, jpegQuality: quality / 100,
            // The share sheet's Save to Files lets people rename; the project name is the default.
            filename: project.name
        )
        let exporter = exporter
        pending = Task {
            defer { pending = nil }
            do {
                let result = try await exporter.export(request)
                // The sheet closed while encoding finished; nobody will share this file.
                guard !Task.isCancelled else { return exporter.discard(result) }
                exported = result
            } catch is CancellationError {
            } catch let error as CollageExportError {
                errorMessage = error.message
            } catch {
                errorMessage = CollageExportError.renderFailed.message
            }
        }
    }

    private func discardExport() {
        if let exported { exporter.discard(exported) }
        exported = nil
    }
}
