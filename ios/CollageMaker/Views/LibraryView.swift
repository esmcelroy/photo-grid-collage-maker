import SwiftUI

struct LibraryView: View {
    @State private var showingAbout = false
    @State private var store: ProjectStore?
    @State private var catalog: LayoutCatalog?
    @State private var library: ProjectLibrary?
    @State private var selectedProject: CollageProject?
    @State private var busy = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    Label("Native preview", systemImage: "sparkle")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Color.accentColor)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Color.accentColor.opacity(0.08), in: Capsule())

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

                        ForEach(library.projects) { summary in
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
                                .padding()
                                .background(.background, in: RoundedRectangle(cornerRadius: 16))
                            }
                            .buttonStyle(.plain)
                            .disabled(busy)
                            .accessibilityIdentifier("savedProject-\(summary.id)")
                        }
                        if !library.unreadable.isEmpty {
                            Text("\(library.unreadable.count) saved projects could not be read. Their files have not been changed.")
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
                        Text("Import photos, choose a layout and adjust your collage. Sharing is coming next.")
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
            .sheet(item: $selectedProject, onDismiss: {
                Task { await loadLibrary() }
            }) { project in
                if let store, let catalog {
                    ProjectView(project: project, store: store, catalog: catalog) {
                        Task { await loadLibrary() }
                    }
                }
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
            selectedProject = try await store.createProject()
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
            selectedProject = try await store.loadProject(id)
            errorMessage = nil
        } catch {
            errorMessage = "This collage could not be opened. Its files have not been changed."
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
                        Text("Create local collages, import photos, choose layouts, adjust photo position, rotation and zoom, and swap photos. Save applies edits; Cancel discards the draft. Image export is not available yet.")
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

#Preview {
    LibraryView()
}
