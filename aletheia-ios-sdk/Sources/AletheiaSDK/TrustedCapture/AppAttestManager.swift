import CryptoKit
import DeviceCheck
import Foundation

/// Manages Apple App Attest for hardware-rooted device attestation.
///
/// App Attest cryptographically proves that:
///   - The app is a genuine, unmodified build from the App Store
///   - The device is a real Apple device (not an emulator or jailbroken)
///   - The signing key was generated on this device's Secure Enclave
///
/// Reference: https://developer.apple.com/documentation/devicecheck/establishing_your_app_s_integrity
public final class AppAttestManager: @unchecked Sendable {

    private static let service = DCAppAttestService.shared

    // ─── Availability ─────────────────────────────────────────────────────────

    /// True if App Attest is supported on this device (requires A12+ chip).
    public static var isSupported: Bool { service.isSupported }

    // ─── Key Generation ───────────────────────────────────────────────────────

    /// Generate a new App Attest key identifier.
    /// The corresponding Secure Enclave key is created by the system.
    public static func generateKeyID() async throws -> String {
        guard isSupported else { throw SDKError.appAttestUnsupported }
        return try await withCheckedThrowingContinuation { continuation in
            service.generateKey { keyId, error in
                if let error { continuation.resume(throwing: error) }
                else if let keyId { continuation.resume(returning: keyId) }
                else { continuation.resume(throwing: SDKError.attestationFailed("generateKey returned nil")) }
            }
        }
    }

    // ─── Attestation ──────────────────────────────────────────────────────────

    /// Attest a key to the Aletheia server.
    ///
    /// The server must provide a fresh challenge nonce (from POST /api/v2/attest/challenge).
    /// The client hashes (SHA-256) the nonce before sending to Apple.
    ///
    /// - Parameters:
    ///   - keyId: Key identifier from `generateKeyID()`
    ///   - serverChallenge: Fresh nonce from Aletheia attestation endpoint
    /// - Returns: Base64-encoded CBOR attestation object to send to the server
    public static func attest(
        keyId:           String,
        serverChallenge: String
    ) async throws -> String {
        guard isSupported else { throw SDKError.appAttestUnsupported }

        // Hash the client data: SHA-256(serverChallenge) as per Apple spec
        guard let challengeData = serverChallenge.data(using: .utf8) else {
            throw SDKError.encodingError("Cannot encode challenge nonce")
        }
        let clientDataHash = Data(SHA256.hash(data: challengeData))

        let attestation = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
            service.attestKey(keyId, clientDataHash: clientDataHash) { data, error in
                if let error { continuation.resume(throwing: error) }
                else if let data { continuation.resume(returning: data) }
                else { continuation.resume(throwing: SDKError.attestationFailed("attestKey returned nil")) }
            }
        }

        return attestation.base64EncodedString()
    }

    // ─── Assertion (per-request signing) ─────────────────────────────────────

    /// Generate a per-request assertion over a media bundle.
    /// Used to prove each capture request came from the attested app instance.
    ///
    /// Less expensive than full attestation — use for every capture.
    public static func assert(
        keyId:      String,
        clientData: Data
    ) async throws -> String {
        let clientDataHash = Data(SHA256.hash(data: clientData))

        let assertion = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
            service.generateAssertion(keyId, clientDataHash: clientDataHash) { data, error in
                if let error { continuation.resume(throwing: error) }
                else if let data { continuation.resume(returning: data) }
                else { continuation.resume(throwing: SDKError.attestationFailed("generateAssertion returned nil")) }
            }
        }

        return assertion.base64EncodedString()
    }
}
