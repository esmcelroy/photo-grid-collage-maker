import SwiftUI

/// One project-bound editing session. Import completion never changes another project.
///
/// The saved baseline and the draft both live here. `CollageEditorView` only edits the
/// draft through bindings, so there is no second storage path. Save writes the draft
/// and stays on this screen. Discard reverts to the baseline after confirmation.
/// Add Photos and Export stay disabled while the draft is dirty, so neither persists
/// nor drops unsaved edits.
struct ProjectView: View {
    @Environment(\.dismiss) private var dismiss
    @State var project: CollageProject
    let store: ProjectStore
    let catalog: LayoutCatalog
    let onImport: () -> Void

    @State private var draft: CollageProject
    @State private var originalURLs: [UUID: URL] = [:]
    @State private var loadingOriginals = true
    @State private var statusMessage: String?
    @State private var readError: String?
    @State private var reload = 0
    @State private var importing = false
    @State private var exporting = false
    @State private var saving = false
    @State private var saveError: String?
    @State private var confirmingDiscard = false
    @State private var confirmingLeave = false

    init(project: CollageProject, store: ProjectStore, catalog: LayoutCatalog, onImport: @escaping () -> Void) {
        self.project = project
        self.store = store
        self.catalog = catalog
        self.onImport = onImport
        _draft = State(initialValue: project)
    }

    private var isDirty: Bool { draft != project }

    var body: some View {
        VStack(spacing: 0) {
            previewPane
            if let readError {
                ContentUnavailableView(
                    "Preview unavailable", systemImage: "exclamationmark.triangle", description: Text(readError)
                )
                Button("Try Again") { reload += 1 }
                    .buttonStyle(.bordered)
                    .padding(.bottom, 16)
            }
            CollageEditorView(
                draft: $draft,
                catalog: catalog,
                originalURLs: originalURLs,
                enabled: controlsEnabled,
                onError: { saveError = $0 },
                photosSection: { photosSection }
            )
            .accessibilityIdentifier("workspaceControls")
            if isDirty { saveBar }
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(project.name)
        .navigationBarTitleDisplayMode(.inline)
        // Projects is the only back control. Hiding the system button also disables the
        // edge swipe, so a dirty draft cannot leave without the confirmation alert.
        .navigationBarBackButtonHidden(true)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    requestLeave()
                } label: {
                    Label("Projects", systemImage: "chevron.backward")
                        .labelStyle(.titleAndIcon)
                }
                .disabled(saving)
                .accessibilityIdentifier("closeProject")
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Export", systemImage: "square.and.arrow.up") {
                    requestExport()
                }
                .disabled(!canExport)
                .accessibilityIdentifier("exportCollage")
            }
        }
        .interactiveDismissDisabled(isDirty || saving)
        .task(id: reload) { await loadOriginals() }
        // The library's NavigationStack owns this destination. Do not nest another stack.
        .navigationDestination(isPresented: $exporting) {
            if let savedLayout {
                ExportView(project: project, layout: savedLayout, originalURLs: originalURLs)
            }
        }
        .alert("Discard changes?", isPresented: $confirmingDiscard) {
            Button("Keep Editing", role: .cancel) {}
                .accessibilityIdentifier("keepEditing")
            Button("Discard Changes", role: .destructive) {
                discardDraft()
            }
            .accessibilityIdentifier("discardEdits")
        } message: {
            Text("Your edits to this collage haven't been saved.")
        }
        .alert("Discard changes?", isPresented: $confirmingLeave) {
            Button("Keep Editing", role: .cancel) {}
                .accessibilityIdentifier("keepEditing")
            Button("Discard Changes", role: .destructive) {
                draft = project
                dismiss()
            }
            .accessibilityIdentifier("discardEdits")
        } message: {
            Text("Your edits to this collage haven't been saved.")
        }
        .alert(
            "Changes could not be saved",
            isPresented: Binding(get: { saveError != nil }, set: { if !$0 { saveError = nil } })
        ) {
            Button("OK", role: .cancel) { saveError = nil }
        } message: {
            Text(saveError ?? "")
        }
    }

    private var previewPane: some View {
        VStack(spacing: 6) {
            Text("\(draft.photos.count) of \(CollageProject.maximumPhotos) photos")
                .font(.subheadline)
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("projectPhotoCount")

            preview
        }
        // A container keeps projectPhotoCount and the collage preview as children.
        // Without it, SwiftUI copies projectPreview onto those elements and hides their IDs.
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("projectPreview")
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(Color(uiColor: .secondarySystemGroupedBackground))
    }

    @ViewBuilder
    private var preview: some View {
        if loadingOriginals {
            ProgressView("Loading preview")
                .frame(maxWidth: .infinity, minHeight: 112)
        } else if readError != nil {
            EmptyView()
        } else if let layout = draftLayout, !draft.photos.isEmpty {
            CollagePreview(CollagePreviewRequest(
                project: draft, layout: layout, originalURLs: originalURLs,
                compositionSize: layout.compositionSize,
                maximumPixelSize: 1200
            ))
            .frame(maxWidth: pinnedPreviewWidth, maxHeight: 168)
            .frame(maxWidth: .infinity)
        } else if draft.photos.isEmpty {
            VStack(spacing: 8) {
                Image(systemName: "photo.on.rectangle.angled")
                    .font(.title2)
                    .accessibilityHidden(true)
                Text("No photos yet")
                    .font(.headline)
                Text("Add photos to see the collage.")
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.center)
            }
            .foregroundStyle(.primary)
            .frame(maxWidth: .infinity)
        } else {
            ContentUnavailableView("Layout unavailable", systemImage: "rectangle.3.group")
                .frame(maxHeight: 120)
        }
    }

    /// Keeps the pinned preview compact without changing the composition ratio.
    private var pinnedPreviewWidth: CGFloat {
        guard let layout = draftLayout else { return 220 }
        let ratio = layout.compositionSize.width / max(layout.compositionSize.height, 1)
        return min(280, 148 * ratio)
    }

    private var photosSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Photos")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            if draft.photos.isEmpty {
                Text("Add photos to see layouts and start editing.")
                    .font(.subheadline)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            addPhotosButton
            if isDirty {
                Text("Save or discard your changes before adding photos.")
                    .font(.footnote)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("addPhotosBlocked")
            }
            if let statusMessage {
                Text(statusMessage)
                    .font(.body)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("importStatus")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var addPhotosButton: some View {
        PhotoImportButton(
            store: store, projectID: project.id, photoCount: project.photos.count,
            onPendingChange: { importing = $0 }
        ) { outcome in
            applyImport(outcome)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(isDirty || saving)
        .accessibilityIdentifier("addPhotos")
    }

    private var saveBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(saving ? "Saving…" : "Unsaved changes")
                .font(.subheadline)
                .accessibilityIdentifier("draftStatus")
            HStack(spacing: 12) {
                Button("Discard") {
                    confirmingDiscard = true
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(saving)
                .frame(maxWidth: .infinity, minHeight: 44)

                Button {
                    save()
                } label: {
                    if saving {
                        ProgressView()
                            .frame(maxWidth: .infinity, minHeight: 44)
                    } else {
                        Text("Save")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(saving)
                .accessibilityIdentifier("saveEdits")
            }
            .frame(minHeight: 44)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .fixedSize(horizontal: false, vertical: true)
        .background(Color(uiColor: .secondarySystemGroupedBackground))
    }

    private var controlsEnabled: Bool {
        !saving && !importing && readError == nil && !loadingOriginals
    }

    private var canExport: Bool {
        !project.photos.isEmpty && !importing && !loadingOriginals && readError == nil
            && savedLayout != nil && !isDirty && !saving
    }

    /// The layout the preview is showing. Follows the draft so a newly chosen layout
    /// is composed with the draft's positions, not the last saved layout.
    private var draftLayout: GridLayout? {
        guard let id = draft.selectedLayoutID else { return nil }
        return catalog.layout(id: id)
    }

    /// Export is only offered once the draft matches the saved project, so this is
    /// the same layout the preview is showing.
    private var savedLayout: GridLayout? {
        guard let id = project.selectedLayoutID else { return nil }
        return catalog.layout(id: id)
    }

    private func requestLeave() {
        guard !saving else { return }
        if isDirty {
            confirmingLeave = true
        } else {
            dismiss()
        }
    }

    private func requestExport() {
        guard canExport else { return }
        exporting = true
    }

    private func discardDraft() {
        draft = project
        statusMessage = nil
    }

    private func save() {
        guard !saving, isDirty else { return }
        saving = true
        saveError = nil
        let snapshot = draft
        let projectID = project.id
        Task {
            do {
                let saved = try await store.saveProject(snapshot)
                guard saved.id == projectID else {
                    saving = false
                    return
                }
                project = saved
                draft = saved
                statusMessage = "Saved on this device."
                onImport()
            } catch {
                saveError = "Your draft is still here. Tap Save to retry, or Discard to revert."
            }
            saving = false
        }
    }

    private func applyImport(_ outcome: PhotoImportOutcome) {
        guard outcome.projectID == project.id else { return }
        switch outcome.result {
        case let .success(report):
            // A dirty draft cannot open the picker. A result that arrives after the
            // draft diverges must not replace those edits; the photos are already stored.
            guard !isDirty else {
                statusMessage = "Imported photos were saved. Save or discard this draft, then reopen the collage to see them."
                onImport()
                return
            }
            project = report.project
            draft = report.project
            reload += 1
            statusMessage = "Imported \(report.imported.count) photos."
            if !report.failures.isEmpty {
                statusMessage = "Imported \(report.imported.count) photos. \(report.failures.count) could not be added. Choose those photos again to retry."
            }
        case .failure:
            statusMessage = "Photos could not be imported. Tap Add Photos to try again."
        }
        onImport()
    }

    private func loadOriginals() async {
        loadingOriginals = true
        readError = nil
        let snapshot = project
        var urls: [UUID: URL] = [:]
        do {
            for photo in snapshot.photos {
                do {
                    urls[photo.id] = try await store.originalURL(photoID: photo.id, in: snapshot.id)
                } catch ProjectStoreError.missingOriginal {
                    // The preview shows the missing-photo recovery state.
                }
            }
            guard !Task.isCancelled, snapshot == project else { return }
            originalURLs = urls
        } catch {
            guard !Task.isCancelled, snapshot == project else { return }
            readError = "The original photos could not be loaded. Please try again."
        }
        loadingOriginals = false
    }
}
