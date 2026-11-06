import Foundation
import Testing

/// Checks the privacy manifest shipped inside the built app bundle.
/// These unit tests are hosted by CollageMaker.app, so `Bundle.main` is the app.
struct PrivacyManifestTests {
    private func bundledManifest() throws -> [String: Any] {
        #expect(Bundle.main.bundleURL.lastPathComponent == "CollageMaker.app")
        let url = try #require(
            Bundle.main.url(forResource: "PrivacyInfo", withExtension: "xcprivacy"),
            "PrivacyInfo.xcprivacy must be copied into the app bundle"
        )
        let data = try Data(contentsOf: url)
        let plist = try PropertyListSerialization.propertyList(from: data, format: nil)
        return try #require(plist as? [String: Any], "Privacy manifest must be a dictionary")
    }

    @Test func declaresNoTracking() throws {
        let manifest = try bundledManifest()
        #expect(manifest["NSPrivacyTracking"] as? Bool == false)
    }

    @Test func declaresNoTrackingDomains() throws {
        let manifest = try bundledManifest()
        let domains = try #require(manifest["NSPrivacyTrackingDomains"] as? [Any])
        #expect(domains.isEmpty)
    }

    @Test func declaresNoCollectedData() throws {
        let manifest = try bundledManifest()
        let collected = try #require(manifest["NSPrivacyCollectedDataTypes"] as? [Any])
        #expect(collected.isEmpty)
    }
}
