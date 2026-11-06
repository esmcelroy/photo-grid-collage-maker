import SwiftUI

/// One project-bound editing session. Import completion never changes another project.
struct ProjectView: View {
    @Environment(\.dismiss) private var dismiss
    @State var project: CollageProject
    let store: ProjectStore
    let catalog: LayoutCatalog
    let onImport: () -> Void
    @State private var originalURLs: [UUID: URL] = [:]
    @State private var loadingOriginals = true
    @State private var statusMessage: String?
    @State private var readError: String?
    @State private var reload = 0
    @State private var editing = false
    @State private var importing = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    Text("\(project.photos.count) of \(CollageProject.maximumPhotos) photos")
                        .font(.headline)
                        .accessibilityIdentifier("projectPhotoCount")

                    if loadingOriginals {
                        ProgressView("Loading preview")
                    } else if let readError {
                        ContentUnavailableView("Preview unavailable", systemImage: "exclamationmark.triangle", description: Text(readError))
                        Button("Try Again") { reload += 1 }
                    } else if let layout = layout {
                        CollagePreview(CollagePreviewRequest(
                            project: project, layout: layout, originalURLs: originalURLs,
                            compositionSize: CGSize(width: 400, height: 400 / layout.aspectRatio),
                            maximumPixelSize: 1200
                        ))
                        .accessibilityIdentifier("projectPreview")
                    } else {
                        ContentUnavailableView("Layout unavailable", systemImage: "rectangle.3.group")
                    }

                    if !project.photos.isEmpty {
                        Button("Edit layout and photos", systemImage: "slider.horizontal.3") { editing = true }
                            .buttonStyle(.bordered)
                            .controlSize(.large)
                            .disabled(importing || loadingOriginals || readError != nil)
                            .accessibilityIdentifier("editCollage")
                    }

                    PhotoImportButton(store: store, projectID: project.id, photoCount: project.photos.count,
                                      onPendingChange: { importing = $0 }) { outcome in
                        guard outcome.projectID == project.id else { return }
                        switch outcome.result {
                        case let .success(report):
                            project = report.project
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
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .accessibilityIdentifier("addPhotos")

                    if let statusMessage {
                        Text(statusMessage)
                            .font(.body)
                            .accessibilityIdentifier("importStatus")
                    }
                    Text("Your collage is saved on this device automatically.")
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                }
                .padding(24)
                .frame(maxWidth: 600)
                .frame(maxWidth: .infinity)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle(project.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel("Close collage")
                    .accessibilityIdentifier("closeProject")
                }
            }
            .task(id: reload) { await loadOriginals() }
            .sheet(isPresented: $editing) {
                CollageEditorView(draft: project, catalog: catalog, store: store, originalURLs: originalURLs) { saved in
                    guard saved.id == project.id else { return }
                    project = saved
                    onImport()
                }
            }
        }
    }

    private var layout: GridLayout? {
        if let id = project.selectedLayoutID { return catalog.layout(id: id) }
        return project.photos.isEmpty ? catalog.layouts(forPhotoCount: 1).first : nil
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
