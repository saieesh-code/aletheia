import CryptoKit
import Foundation
import CoreLocation

/// A single trusted capture session.
/// Create one per capture event — do not reuse across captures.
///
/// Usage:
/// ```swift
/// let session = try await TrustedCaptureSession.start(config: .default)
/// let result  = try await session.sign(imageData: jpegData)
/// // result.bundle is ready to POST to /api/v2/manifest
/// ```
public final class TrustedCaptureSession: @unchecked Sendable {

    // ─── Types ────────────────────────────────────────────────────────────────

    public struct Configuration {
        public var requireBiometric:   Bool   = true
        public var includeGPS:         Bool   = true
        public var aiDisclosure:       AIDisclosure = .declaredCameraOriginal
        public var serverBaseURL:      URL?   = nil
        public static var `default`:   Configuration { Configuration() }
    }

    public enum AIDisclosure: String, Codable {
        case declaredCameraOriginal = "declared_camera_original"
        case declaredAIGenerated    = "declared_ai_generated"
        case declaredAIModified     = "declared_ai_modified"
        case undeclaredOrigin       = "undeclared_origin"
        case unknownOrigin          = "unknown_origin"
    }

    public struct CaptureBundle: Codable {
        public let version:      Int    = 2
        public let media_hash:   String
        public let timestamp:    String
        public let device_id:    String
        public let gps:          GPSCoordinates?
        public let nonce:        String
        public let signature:    String
        public let public_key:   String
        public let ai_disclosure:String
        public let key_type:     String = "P256-SE" // distinguishes SE from software keys
    }

    public struct GPSCoordinates: Codable {
        public let lat: Double
        public let lon: Double
        public let accuracy_meters: Double?
    }

    public struct CaptureResult {
        public let bundle:      CaptureBundle
        public let mediaHash:   String
        public let deviceID:    String
        public let publicKey:   String
        public let timestamp:   Date
        public let bundleJSON:  Data
    }

    // ─── State ────────────────────────────────────────────────────────────────

    private let config:    Configuration
    private let seKey:     SecureEnclave.P256.Signing.PrivateKey
    private let deviceID:  String
    private let publicKey: String

    // ─── Initialization ───────────────────────────────────────────────────────

    private init(
        config:    Configuration,
        seKey:     SecureEnclave.P256.Signing.PrivateKey,
        deviceID:  String,
        publicKey: String
    ) {
        self.config    = config
        self.seKey     = seKey
        self.deviceID  = deviceID
        self.publicKey = publicKey
    }

    /// Initialize a trusted capture session.
    /// Loads an existing SE key from Keychain or generates a new one.
    public static func start(config: Configuration = .default) async throws -> TrustedCaptureSession {
        // Attempt to load existing SE key, generate if missing
        let seKey: SecureEnclave.P256.Signing.PrivateKey
        if let existing = try SecureEnclaveManager.loadFromKeychain() {
            seKey = existing
        } else {
            seKey = try SecureEnclaveManager.generateKey(requireBiometric: config.requireBiometric)
            try SecureEnclaveManager.saveToKeychain(key: seKey)
        }

        let deviceID  = SecureEnclaveManager.deviceID(for: seKey)
        let publicKey = SecureEnclaveManager.exportPublicKey(seKey)

        return TrustedCaptureSession(
            config: config, seKey: seKey, deviceID: deviceID, publicKey: publicKey
        )
    }

    // ─── Signing ──────────────────────────────────────────────────────────────

    /// Sign captured image/video data.
    ///
    /// 1. Computes SHA-256 of media bytes
    /// 2. Optionally acquires GPS coordinates
    /// 3. Signs canonical payload in the Secure Enclave
    /// 4. Returns a portable proof bundle
    public func sign(mediaData: Data) async throws -> CaptureResult {
        // 1. Hash media
        let mediaHash = SHA256.hash(data: mediaData)
            .map { String(format: "%02x", $0) }.joined()

        // 2. Timestamp (ISO 8601)
        let now       = Date()
        let timestamp = ISO8601DateFormatter().string(from: now)

        // 3. GPS (optional)
        let gps: GPSCoordinates? = config.includeGPS
            ? try? await acquireGPS()
            : nil

        // 4. Nonce — 16 random bytes
        var nonceBytes = [UInt8](repeating: 0, count: 16)
        _ = SecRandomCopyBytes(kSecRandomDefault, 16, &nonceBytes)
        let nonce = Data(nonceBytes).base64EncodedString()

        // 5. Build canonical payload (key order must match server)
        let canonical = buildCanonical(
            mediaHash: mediaHash, timestamp: timestamp,
            deviceID: deviceID, gps: gps, nonce: nonce
        )

        // 6. Sign in Secure Enclave
        let signatureB64 = try SecureEnclaveManager.signCanonical(key: seKey, payload: canonical)

        // 7. Assemble bundle
        let bundle = CaptureBundle(
            media_hash:    mediaHash,
            timestamp:     timestamp,
            device_id:     deviceID,
            gps:           gps,
            nonce:         nonce,
            signature:     signatureB64,
            public_key:    publicKey,
            ai_disclosure: config.aiDisclosure.rawValue
        )

        let encoder    = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .prettyPrinted]
        let bundleJSON = try encoder.encode(bundle)

        return CaptureResult(
            bundle:    bundle,
            mediaHash: mediaHash,
            deviceID:  deviceID,
            publicKey: publicKey,
            timestamp: now,
            bundleJSON: bundleJSON
        )
    }

    // ─── GPS ──────────────────────────────────────────────────────────────────

    private func acquireGPS() async throws -> GPSCoordinates? {
        return try await withCheckedThrowingContinuation { continuation in
            let manager = CLLocationManager()
            // In a real implementation, use CLLocationManagerDelegate
            // For SDK clarity, we show the intent and data structure
            continuation.resume(returning: nil) // placeholder
        }
    }

    // ─── Canonical ────────────────────────────────────────────────────────────

    private func buildCanonical(
        mediaHash: String, timestamp: String,
        deviceID: String, gps: GPSCoordinates?, nonce: String
    ) -> String {
        // Must match server-side canonical_bundle_payload() exactly
        var obj: [String: Any] = [
            "media_hash": mediaHash,
            "timestamp":  timestamp,
            "device_id":  deviceID,
            "nonce":      nonce,
        ]
        if let gps {
            obj["gps"] = ["lat": gps.lat, "lon": gps.lon]
        } else {
            obj["gps"] = NSNull()
        }
        // Produce sorted-key JSON for deterministic canonicalization
        let data = try! JSONSerialization.data(
            withJSONObject: obj,
            options: [.sortedKeys]
        )
        return String(data: data, encoding: .utf8)!
    }

    // ─── Device Identity ──────────────────────────────────────────────────────

    public var currentDeviceID:  String { deviceID }
    public var currentPublicKey: String { publicKey }
}
