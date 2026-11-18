import Foundation

/// A self-contained native backup of one project: its manifest plus every original's bytes.
/// This is the iOS app's own format; it is not compatible with web app backups.
struct ProjectBackup: Codable, Sendable {
    static let formatIdentifier = "com.collager.native-project-backup"
    static let currentVersion = 1
    /// Largest backup file restore will read (200 MiB). Checked before any decoding.
    static let maximumFileBytes = 200 * 1024 * 1024

    struct Original: Codable, Sendable {
        let photoID: UUID
        /// The original file's exact bytes, base64-encoded in JSON.
        let data: Data
    }

    /// Base64 contains "/", which is left unescaped, so a backup's encoded size is exactly
    /// its envelope plus the base64 length of each original.
    static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return encoder
    }

    var format = Self.formatIdentifier
    var version = Self.currentVersion
    let createdAt: Date
    let project: CollageProject
    let originals: [Original]
}

enum ProjectBackupError: Error, Equatable, Sendable {
    /// The file is larger than `ProjectBackup.maximumFileBytes`.
    case tooLarge(limit: Int)
    /// Not a readable file, not JSON, or not a native project backup.
    case notABackup
    case unsupportedVersion(Int)
    /// A backup that decodes but whose project or photos are invalid.
    case invalid(String)
}
