import SwiftUI

/// Standalone synthetic reproduction: no collage models, images, storage or audit hooks.
@main
struct ScrollContrastReproApp: App {
    var body: some Scene {
        WindowGroup { ScrollContrastFixture() }
    }
}

private struct ScrollContrastFixture: View {
    private let variant = ProcessInfo.processInfo.environment["SCROLL_VARIANT"] ?? "eager"
    private let lowContrast = ProcessInfo.processInfo.environment["LOW_CONTRAST"] == "1"

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                VStack(spacing: 0) {
                    VStack { Text("Pinned preview") }
                        .frame(maxWidth: .infinity)
                        .frame(height: 190)
                        .background(Color(uiColor: .secondarySystemGroupedBackground))
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("preview")
                    scroller
                        .accessibilityIdentifier("controls")
                    VStack { Text("Pinned footer") }
                        .frame(maxWidth: .infinity)
                        .frame(height: 100)
                        .background(Color(uiColor: .secondarySystemGroupedBackground))
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("footer")
                }
                .background(Color(uiColor: .systemGroupedBackground))
                .foregroundStyle(.primary)
                .font(.body)
                .navigationTitle("Scroll contrast")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Reveal") { proxy.scrollTo(6, anchor: .top) }
                            .accessibilityIdentifier("reveal")
                    }
                }
            }
        }
    }

    @ViewBuilder private var scroller: some View {
        if variant == "list" {
            List {
                rows
                    .listRowInsets(EdgeInsets(top: 16, leading: 16, bottom: 16, trailing: 16))
                    .listRowBackground(Color(uiColor: .systemGroupedBackground))
            }
            .listStyle(.plain)
        } else if variant == "scroll-contain" {
            ScrollView { content }
                .accessibilityElement(children: .contain)
        } else if variant == "clipped" {
            ScrollView { content }.clipped()
        } else {
            ScrollView { content }
        }
    }

    @ViewBuilder private var content: some View {
        if variant == "lazy" {
            LazyVStack(alignment: .leading, spacing: 0) { rows }
        } else if variant == "content-contain" {
            VStack(alignment: .leading, spacing: 0) { rows }
                .accessibilityElement(children: .contain)
        } else {
            VStack(alignment: .leading, spacing: 0) { rows }
        }
    }

    private var rows: some View {
        ForEach(0..<12) { index in
            Text(index == 6 ? "Photo" : "Control row \(index)")
                .font(index == 6 ? .headline : .body)
                .foregroundStyle(index == 6 && lowContrast ? Color(white: 0.85) : Color.primary)
                .padding(16)
                .frame(maxWidth: .infinity, minHeight: 120, alignment: .topLeading)
                .id(index)
                .accessibilityIdentifier("row.\(index)")
        }
    }
}
