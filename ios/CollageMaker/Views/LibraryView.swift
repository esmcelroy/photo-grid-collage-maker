import SwiftUI
import UniformTypeIdentifiers

struct LibraryView: View {
    @State private var showingAbout = false
    @State private var store: ProjectStore?
    @State private var catalog: LayoutCatalog?
    @State private var library: ProjectLibrary?
    @State private var selectedProjectID: UUID?
    /// The project loaded before the push. CollageProject is not Hashable, so the
    /// destination binding is its ID; this value is what ProjectView receives.
    @State private var openedProject: CollageProject?
    @State private var busy = false
    @State private var errorMessage: String?
    @State private var statusMessage: String?
    @State private var action: ProjectAction?
    @State private var restoring = false

    private enum ProjectAction: Identifiable {
        case rename(ProjectSummary)
        case delete(UUID, String)
        case backup(ProjectSummary)

        var id: UUID {
            switch self {
            case .rename(let project), .backup(let project): project.id
            case .delete(let id, _): id
            }
        }

        var title: String {
            switch self {
            case .rename: "Rename collage"
            case .delete: "Delete collage?"
            case .backup: "Back up collage"
            }
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
//                    Label("Native preview", systemImage: "sparkle")
//                        .font(.subheadline.weight(.medium))
//                        .foregroundStyle(Color.accentColor)
//                        .padding(.horizontal, 14)
//                        .padding(.vertical, 8)
//                        .background(Color.accentColor.opacity(0.08), in: Capsule())

                    if library?.projects.isEmpty != false { illustration }

                    VStack(spacing: 12) {
                        Text(library?.projects.isEmpty == false ? "Your collages" : "Your collages will live here")
                            .font(.title.weight(.semibold))
                            .multilineTextAlignment(.center)
                            .accessibilityAddTraits(.isHeader)

                        Text("A space to bring your photos together, one layout at a time.")
                            .font(.body)
                            .foregroundStyle(.primary)
                            .multilineTextAlignment(.center)
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .foregroundStyle(.primary)
                            .accessibilityIdentifier("libraryError")
                        Button("Try Again") { Task { await loadLibrary() } }
                            .disabled(busy)
                    }

                    if let library {
                        Button {
                            Task { await createProject() }
                        } label: {
                            Label("New Collage", systemImage: "plus")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(busy)

                        Button {
                            restoring = true
                        } label: {
                            Label("Restore Backup", systemImage: "square.and.arrow.down")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.bordered)
                        .disabled(busy)
                        .accessibilityIdentifier("restoreBackup")

                        if busy {
                            ProgressView("Updating projects…")
                                .accessibilityIdentifier("libraryPending")
                        }
                        if let statusMessage {
                            Text(statusMessage)
                                .accessibilityIdentifier("libraryStatus")
                        }

                        ForEach(library.projects) { summary in
                            VStack(alignment: .leading, spacing: 8) {
                                Button {
                                    Task { await openProject(summary.id) }
                                } label: {
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(summary.name).font(.headline)
                                        Text("\(summary.photoCount) of \(CollageProject.maximumPhotos) photos")
                                            .font(.subheadline)
                                        if summary.missingPhotoCount > 0 {
                                            Text("Some original photos are missing.")
                                        }
                                    }
                                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("savedProject-\(summary.id)")

                                Menu {
                                    Button("Rename", systemImage: "pencil") {
                                        prepareAction(.rename(summary))
                                    }
                                    Button("Duplicate", systemImage: "plus.square.on.square") {
                                        Task { await duplicateProject(summary.id) }
                                    }
                                    Button("Back Up", systemImage: "square.and.arrow.up") {
                                        prepareAction(.backup(summary))
                                    }
                                    Button("Delete", systemImage: "trash", role: .destructive) {
                                        prepareAction(.delete(summary.id, summary.name))
                                    }
                                } label: {
                                    Label("Project actions", systemImage: "ellipsis.circle")
                                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                        .contentShape(Rectangle())
                                }
                                .accessibilityLabel("Actions for \(summary.name)")
                                .accessibilityIdentifier("projectActions-\(summary.id)")
                            }
                            .padding()
                            .background(.background, in: RoundedRectangle(cornerRadius: 16))
                            .disabled(busy)
                        }
                        if !library.unreadable.isEmpty {
                            Text("\(library.unreadable.count) saved projects could not be read. Their files have not been changed.")
                            ForEach(library.unreadable) { project in
                                Button("Delete unreadable collage \(project.id.uuidString)", role: .destructive) {
                                    prepareAction(.delete(project.id, "Unreadable collage"))
                                }
                                .frame(minHeight: 44)
                                .disabled(busy)
                            }
                        }
                    } else if busy {
                        ProgressView("Loading projects")
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        Label("Private by design", systemImage: "lock.shield")
                            .font(.headline)
                            .foregroundStyle(Color.accentColor)

                        Text("Designed for on-device editing, without an account or photo uploads.")
                            .font(.subheadline)
                            .foregroundStyle(.primary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(20)
                    .background(.background, in: RoundedRectangle(cornerRadius: 20))

                    VStack(spacing: 8) {
                        Text("Make room for your photos.")
                            .font(.subheadline.weight(.medium))
                        Text("Import photos, arrange your collage, and share an image. Back up projects to keep editable copies.")
                            .font(.subheadline)
                            .foregroundStyle(.primary)
                        Text("Collager is a working name.")
                            .font(.caption)
                            .foregroundStyle(.primary)
                            .padding(.top, 8)
                    }
                    .multilineTextAlignment(.center)
                }
                .frame(maxWidth: 480)
                .padding(.horizontal, 24)
                .padding(.vertical, 28)
                .frame(maxWidth: .infinity)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("Collager")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingAbout = true
                    } label: {
                        Image(systemName: "info.circle")
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel("About this preview")
                    .accessibilityIdentifier("aboutPreview")
                }
            }
            .sheet(isPresented: $showingAbout) {
                aboutPreview
            }
            .sheet(item: $action) { selection in
                if let store {
                    ProjectActionSheet(selection: selection, store: store) { message in
                        statusMessage = message
                        Task { await loadLibrary() }
                    }
                }
            }
            .fileImporter(isPresented: $restoring, allowedContentTypes: [.json]) { result in
                switch result {
                case .success(let url): Task { await restoreBackup(url) }
                case .failure:
                    errorMessage = "The backup could not be opened. Please choose it again to retry."
                }
            }
            // The only stack in the editing flow. ProjectView and ExportView are pushed
            // destinations; they do not wrap themselves in another NavigationStack.
            // navigationDestination(item:) needs Hashable, which CollageProject is not.
            .navigationDestination(item: $selectedProjectID) { id in
                if let store, let catalog, let project = openedProject, project.id == id {
                    ProjectView(project: project, store: store, catalog: catalog) {
                        Task { await loadLibrary() }
                    }
                }
            }
            .onChange(of: selectedProjectID) { _, id in
                // Returning to the library refreshes names and counts. Opening does not.
                if id == nil { Task { await loadLibrary() } }
            }
            .task { await loadLibrary() }
        }
    }

    private func loadLibrary() async {
        guard !busy else { return }
        busy = true
        defer { busy = false }
        do {
            if store == nil {
                let catalog = try LayoutCatalog()
                self.catalog = catalog
                store = ProjectStore(rootURL: try ProjectStore.applicationSupportRootURL(), catalog: catalog)
            }
            if let store { library = try await store.listProjects() }
            errorMessage = nil
        } catch {
            errorMessage = "Your projects could not be loaded. Please try again."
        }
    }

    private func createProject() async {
        guard !busy, let store else { return }
        busy = true
        defer { busy = false }
        do {
            let created = try await store.createProject()
            openedProject = created
            selectedProjectID = created.id
            errorMessage = nil
        } catch {
            errorMessage = "The collage could not be created. Please try again."
        }
    }

    private func openProject(_ id: UUID) async {
        guard !busy, let store else { return }
        busy = true
        defer { busy = false }
        do {
            let loaded = try await store.loadProject(id)
            openedProject = loaded
            selectedProjectID = loaded.id
            errorMessage = nil
        } catch {
            errorMessage = "This collage could not be opened. Its files have not been changed."
        }
    }

    private func prepareAction(_ selection: ProjectAction) {
        guard !busy else { return }
        action = selection
    }

    private func duplicateProject(_ id: UUID) async {
        guard !busy, let store else { return }
        busy = true
        defer { busy = false }
        do {
            let copy = try await store.duplicateProject(id)
            library = try await store.listProjects()
            statusMessage = "Duplicated as \(copy.name)."
            errorMessage = nil
        } catch {
            errorMessage = "The collage could not be duplicated. Check that its original photos are available and try again."
        }
    }

    private func restoreBackup(_ url: URL) async {
        guard !busy, let store else { return }
        busy = true
        defer { busy = false }
        do {
            let restored = try await store.restoreProject(from: url)
            library = try await store.listProjects()
            statusMessage = "Restored \(restored.name) as a new collage."
            errorMessage = nil
        } catch {
            errorMessage = "The backup could not be restored. Choose a valid native Collager backup, no larger than 200 MiB. Existing collages have not been replaced."
        }
    }

    /// Owns one dialog's draft and pending operation, rather than capturing library state
    /// before SwiftUI presents the sheet. Cancellation never writes a rename draft.
    private struct ProjectActionSheet: View {
        @Environment(\.dismiss) private var dismiss
        let selection: ProjectAction
        let store: ProjectStore
        let onChange: (String) -> Void
        @State private var nameDraft: String
        @State private var busy = false
        @State private var actionError: String?
        @State private var backupURL: URL?
        @State private var savingBackup = false

        init(selection: ProjectAction, store: ProjectStore, onChange: @escaping (String) -> Void) {
            self.selection = selection
            self.store = store
            self.onChange = onChange
            if case .rename(let summary) = selection {
                _nameDraft = State(initialValue: summary.name)
            } else {
                _nameDraft = State(initialValue: "")
            }
        }

        private func applyAction() async {
            guard !busy else { return }
            busy = true
            actionError = nil
            defer { busy = false }
            do {
                switch selection {
                case .rename(let summary):
                    let renamed = try await store.renameProject(summary.id, to: nameDraft)
                    onChange("Renamed to \(renamed.name).")
                case .delete(let id, _):
                    try await store.deleteProject(id)
                    onChange("Collage deleted.")
                case .backup(let summary):
                    backupURL = try await store.backupProject(summary.id)
                    return
                }
                dismiss()
            } catch {
                actionError = "This action could not be completed. Check the project and try again."
            }
        }

        var body: some View {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        switch selection {
                        case .rename:
                            Text("Choose a name with 1–200 characters.")
                            TextField("Collage name", text: $nameDraft, axis: .vertical)
                                .textFieldStyle(.roundedBorder)
                                .frame(minHeight: 44)
                                .accessibilityIdentifier("projectName")
                            Button("Save Name") { Task { await applyAction() } }
                                .buttonStyle(.borderedProminent)
                                .disabled(
                                    nameDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                        || nameDraft.trimmingCharacters(in: .whitespacesAndNewlines).count > ProjectStore.maximumNameLength
                                )
                                .accessibilityIdentifier("saveProjectName")
                        case .delete(_, let name):
                            Text("“\(name)” and its saved photos will be permanently deleted.")
                            Button("Delete", role: .destructive) { Task { await applyAction() } }
                                .buttonStyle(.borderedProminent)
                                .tint(Color(red: 0.65, green: 0.08, blue: 0.12))
                                .accessibilityLabel("Delete Collage")
                                .accessibilityIdentifier("confirmDeleteProject")
                            Button("Keep") { dismiss() }
                                .buttonStyle(.bordered)
                                .accessibilityLabel("Keep Collage")
                                .accessibilityIdentifier("keepProject")
                        case .backup(let summary):
                            Text(
                                "Back up “\(summary.name)” with its original photos, layout and edits. Restoring adds a new collage and never replaces existing projects."
                            )
                            Text("Native Collager JSON backups only; web backups are not supported. Maximum backup size: 200 MiB.")
                                .font(.subheadline)
                            if let backupURL {
                                Text("Backup ready")
                                    .accessibilityIdentifier("backupStatus")
                                Button("Save Backup", systemImage: "square.and.arrow.down") { savingBackup = true }
                                    .buttonStyle(.borderedProminent)
                                    .accessibilityIdentifier("saveBackup")
                                ShareLink(item: backupURL) {
                                    Label("Share Backup", systemImage: "square.and.arrow.up")
                                }
                                .buttonStyle(.bordered)
                                .accessibilityIdentifier("shareBackup")
                            } else {
                                Button("Create Backup") { Task { await applyAction() } }
                                    .buttonStyle(.borderedProminent)
                                    .accessibilityIdentifier("createBackup")
                            }
                        }
                        if busy { ProgressView("Working…") }
                        if let actionError {
                            Text(actionError)
                                .accessibilityIdentifier("projectActionError")
                        }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .disabled(busy)
                    .padding(24)
                    .frame(maxWidth: 600, alignment: .leading)
                    .frame(maxWidth: .infinity)
                }
                .background(Color(uiColor: .systemGroupedBackground))
                .navigationTitle(selection.title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button {
                            dismiss()
                        } label: {
                            Image(systemName: "xmark").frame(minWidth: 44, minHeight: 44)
                        }
                        .accessibilityLabel("Cancel")
                        .accessibilityIdentifier("closeProjectAction")
                        .disabled(busy)
                    }
                }
                .interactiveDismissDisabled(busy)
                .fileExporter(
                    isPresented: $savingBackup, document: backupURL.map { NativeBackupDocument(url: $0) }, contentType: .json,
                    defaultFilename: backupURL?.deletingPathExtension().lastPathComponent ?? "Collager backup"
                ) { result in
                    if case .failure = result { actionError = "The backup could not be saved. Tap Save Backup to retry." }
                }
                .onDisappear {
                    if let backupURL { store.discardBackup(at: backupURL) }
                }
            }
        }
    }

    private var illustration: some View {
        HStack(spacing: 10) {
            RoundedRectangle(cornerRadius: 20)
                .fill(Color.accentColor.opacity(0.18))
                .overlay {
                    Image(systemName: "photo")
                        .font(.system(size: 40, weight: .light))
                        .foregroundStyle(Color.accentColor)
                }
                .frame(width: 112)

            VStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.accentColor.opacity(0.35))
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.accentColor.opacity(0.1))
            }
            .frame(width: 76)
        }
        .frame(height: 168)
        .rotationEffect(.degrees(-5))
        .padding(12)
        .accessibilityHidden(true)
    }

    private var aboutPreview: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Native foundation")
                            .font(.headline)
                            .accessibilityAddTraits(.isHeader)
                        Text("An iPhone app built with SwiftUI for iOS 18 and later.")
                        Text("Create local collages, import photos, edit layouts and photos, and export PNG or JPEG images. Rename, duplicate, delete and back up projects from the library. Save applies editor changes; Cancel asks before discarding an edited draft.")
                    }
                }

                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("On your device")
                            .font(.headline)
                            .accessibilityAddTraits(.isHeader)
                        Text("The app is being built for local editing, without an account, cloud sync, analytics, or photo uploads.")
                    }
                }

                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Working name")
                            .font(.headline)
                            .accessibilityAddTraits(.isHeader)
                        Text("Collager is a working name. The final name is still open.")
                    }
                }
            }
            .navigationTitle("About this preview")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingAbout = false
                    } label: {
                        Image(systemName: "xmark")
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .accessibilityLabel("Close preview")
                    .accessibilityIdentifier("dismissAboutPreview")
                }
            }
        }
    }
}

/// FileDocument lets the system Files picker save a completed backup, without choosing
/// an app-owned storage location or changing the original project.
private struct NativeBackupDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    let url: URL?
    let data: Data?

    init(url: URL) {
        self.url = url
        data = nil
    }

    init(configuration: ReadConfiguration) throws {
        url = nil
        data = configuration.file.regularFileContents
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        if let url { return try FileWrapper(url: url, options: .immediate) }
        return FileWrapper(regularFileWithContents: data ?? Data())
    }
}

#Preview {
    LibraryView()
}
