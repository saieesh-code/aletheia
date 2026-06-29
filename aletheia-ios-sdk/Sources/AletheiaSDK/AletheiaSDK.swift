import CryptoKit
import Foundation

/// Aletheia iOS SDK — Trusted Capture & Provenance Infrastructure
///
/// Quick start:
/// ```swift
/// import AletheiaSDK
///
/// // Initialize once per app session
/// let sdk = try await AletheiaSDK.initialize(
///     serverURL: URL(string: "https://api.aletheia.io")!,
///     requireBiometric: true
/// )
///
/// // Sign a captured image
/// let result = try await sdk.captureSession.sign(mediaData: imageData)
///
/// // Send bundle to your backend / Aletheia server
/// let response = try await sdk.verification.submit(result.bundle)
/// print(response.trustLevel) // "PROVENANCE_VERIFIED"
/// ```
@MainActor
public final class AletheiaSDK: Sendable {

    // ─── Public surface ───────────────────────────────────────────────────────

    public let captureSession: TrustedCaptureSession
    public let verification:   VerificationClient
    public let attestation:    AttestationClient

    /// SDK version
    public static let version = "2.0.0"

    /// Mandatory scope disclaimer — must be shown to end users
    public static let provenanceScopeNote =
        "Verification confirms provenance integrity, not independent semantic truth of depicted content."

    // ─── Initialization ───────────────────────────────────────────────────────

    private init(session: TrustedCaptureSession, serverURL: URL?) {
        self.captureSession = session
        self.verification   = VerificationClient(serverURL: serverURL)
        self.attestation    = AttestationClient(serverURL: serverURL)
    }

    /// Initialize the Aletheia SDK.
    ///
    /// - Parameters:
    ///   - serverURL:        Base URL of the Aletheia verification server
    ///   - requireBiometric: Require Face ID / Touch ID for signing operations
    ///   - aiDisclosure:     Declare provenance origin of captures
    public static func initialize(
        serverURL:        URL? = nil,
        requireBiometric: Bool = true,
        aiDisclosure:     TrustedCaptureSession.AIDisclosure = .declaredCameraOriginal
    ) async throws -> AletheiaSDK {
        var config             = TrustedCaptureSession.Configuration.default
        config.requireBiometric = requireBiometric
        config.aiDisclosure     = aiDisclosure
        config.serverBaseURL    = serverURL

        let session = try await TrustedCaptureSession.start(config: config)
        return AletheiaSDK(session: session, serverURL: serverURL)
    }

    // ─── Convenience ──────────────────────────────────────────────────────────

    /// Current device ID (derived from Secure Enclave public key)
    public var deviceID: String { captureSession.currentDeviceID }

    /// Current device public key (compressed P-256 point, base64)
    public var publicKey: String { captureSession.currentPublicKey }
}

// ─── Attestation Client ───────────────────────────────────────────────────────

public final class AttestationClient: Sendable {
    private let serverURL: URL?
    init(serverURL: URL?) { self.serverURL = serverURL }

    /// Perform the full App Attest flow and register with the server.
    public func performAttestation(deviceID: String) async throws -> String {
        guard AppAttestManager.isSupported else {
            throw SDKError.appAttestUnsupported
        }

        // 1. Fetch challenge from server
        guard let base = serverURL else {
            throw SDKError.networkError("serverURL not configured")
        }
        var challengeReq = URLRequest(url: base.appendingPathComponent("api/v2/attest/challenge"))
        challengeReq.httpMethod = "POST"
        challengeReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        challengeReq.httpBody = try JSONEncoder().encode(["device_id": deviceID, "platform": "apple"])

        let (challengeData, _) = try await URLSession.shared.data(for: challengeReq)
        let challengeResp = try JSONDecoder().decode([String: String].self, from: challengeData)
        guard let nonce = challengeResp["challenge_nonce"] else {
            throw SDKError.networkError("Missing challenge_nonce in response")
        }

        // 2. Generate App Attest key
        let keyID = try await AppAttestManager.generateKeyID()

        // 3. Attest with Apple
        let attestationB64 = try await AppAttestManager.attest(keyID: keyID, serverChallenge: nonce)

        // 4. Send to Aletheia server for validation
        var attestReq = URLRequest(url: base.appendingPathComponent("api/v2/attest"))
        attestReq.httpMethod = "POST"
        attestReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "platform": "apple", "device_id": deviceID,
            "attestation_token": attestationB64,
            "challenge_nonce": nonce, "key_id": keyID,
        ]
        attestReq.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (respData, _) = try await URLSession.shared.data(for: attestReq)
        let resp = try JSONDecoder().decode([String: String].self, from: respData)
        return resp["attestation_id"] ?? ""
    }
}

// ─── Verification Client ──────────────────────────────────────────────────────

public final class VerificationClient: Sendable {
    private let serverURL: URL?
    init(serverURL: URL?) { self.serverURL = serverURL }

    public struct VerificationResponse: Codable {
        public let valid:              Bool
        public let trustLevel:         String
        public let trustScore:         Int
        public let hashMatch:          Bool
        public let signatureValid:     Bool
        public let provenanceScopeNote:String
        enum CodingKeys: String, CodingKey {
            case valid, trustLevel = "trust_level", trustScore = "trust_score"
            case hashMatch = "hash_match", signatureValid = "signature_valid"
            case provenanceScopeNote = "provenance_scope_note"
        }
    }

    public func submit(
        bundle:    TrustedCaptureSession.CaptureBundle,
        mediaHash: String
    ) async throws -> VerificationResponse {
        guard let base = serverURL else {
            throw SDKError.networkError("serverURL not configured")
        }
        var req = URLRequest(url: base.appendingPathComponent("api/v2/verify"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = [
            "media_hash": mediaHash,
            "bundle": try JSONSerialization.jsonObject(
                with: JSONEncoder().encode(bundle)
            ),
        ]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONDecoder().decode(VerificationResponse.self, from: data)
    }
}
