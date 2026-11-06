import PhotosUI
import SwiftUI

/// Picker items are staged through `StagedPhotoFile`, which copies the provider file in time.
extension PhotosPickerItem: PhotoImportItem {
    func loadFile() async throws -> URL {
        guard let staged = try await loadTransferable(type: StagedPhotoFile.self) else {
            throw CocoaError(.fileReadNoSuchFile)
        }
        return staged.url
    }
}

/// The outcome of one import, tagged with the project it was started for. If the screen
/// has moved to another project by the time this arrives, the caller should not apply it
/// to the current project; the photos are already saved in `projectID`.
struct PhotoImportOutcome: Sendable {
    let projectID: UUID
    let result: Result<PhotoImportReport, any Error>
}

/// Opens the system photo picker and imports the selection into one explicit project.
///
/// Uses `PhotosPicker`, which runs out of process and needs no Photos library permission.
/// Dismissing the picker without choosing anything reports nothing. While an import is
/// pending the button is disabled, so a second selection cannot overlap it.
struct PhotoImportButton: View {
    let store: ProjectStore
    let projectID: UUID
    /// Photos already in the project; the picker offers only the remaining slots.
    let photoCount: Int
    var onPendingChange: @MainActor (Bool) -> Void = { _ in }
    let onCompletion: @MainActor (PhotoImportOutcome) -> Void

    @State private var selection: [PhotosPickerItem] = []
    /// Identifies the in-flight import, so only that import can clear the pending state.
    @State private var pendingImport: UUID?

    private var remaining: Int { max(0, CollageProject.maximumPhotos - photoCount) }

    var body: some View {
        // The picker's label closure is Sendable, so it must not read view state directly.
        let importing = pendingImport != nil
        return PhotosPicker(
            selection: $selection,
            maxSelectionCount: max(1, remaining),
            selectionBehavior: .ordered,
            matching: .images,
            preferredItemEncoding: .current
        ) {
            if importing {
                Label {
                    Text("Importing Photos…")
                } icon: {
                    ProgressView()
                }
            } else {
                Label("Add Photos", systemImage: "photo.badge.plus")
            }
        }
        // maxSelectionCount 0 would mean unlimited, so a full project disables the picker instead.
        .disabled(importing || remaining == 0)
        .accessibilityHint(remaining == 0
            ? Text("This collage already has \(CollageProject.maximumPhotos) photos.")
            : Text("Choose up to \(remaining) photos."))
        .onChange(of: selection) { _, items in
            guard !items.isEmpty else { return }
            selection = []
            guard pendingImport == nil else { return }
            start(items)
        }
    }

    private func start(_ items: [PhotosPickerItem]) {
        let token = UUID()
        pendingImport = token
        onPendingChange(true)
        let importer = PhotoImporter(store: store)
        // Captured now: a later projectID change cannot relabel this import's outcome.
        let projectID = projectID
        let onCompletion = onCompletion
        Task {
            let result: Result<PhotoImportReport, any Error>
            do {
                result = .success(try await importer.importPhotos(items, into: projectID))
            } catch {
                result = .failure(error)
            }
            if pendingImport == token {
                pendingImport = nil
                onPendingChange(false)
            }
            onCompletion(PhotoImportOutcome(projectID: projectID, result: result))
        }
    }
}
