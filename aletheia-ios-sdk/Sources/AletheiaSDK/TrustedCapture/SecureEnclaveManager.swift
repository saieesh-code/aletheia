import CryptoKit
import Foundation
import Security

/// Manages signing keys inside the iOS Secure Enclave.
///
/// Private keys generated here NEVER leave the Secure Enclave.
/// All signing operations execute inside the enclave hardware.
/// Keys are bound to this device and app — cannot be exported or migrated.
///
/// Reference: https://developer.apple.com/documentation/cryptokit/secureenclave
public final class SecureEnclaveManager: @unchecked Sendable {

    // ─── Key storage label ────────────────────────────────────────────────────
    private static let keyLabel = "io.aletheia.sdk.capture.key"
    private static let keyTag   = "io.aletheia.sdk.capture.key.tag".data(using: .utf8)!

    // ─── Key Generation ───────────────────────────────────────────────────────

    /// Generate a new P-256 key pair inside the Secure Enclave.
    ///
    /// - Parameter requireBiometric: If true, every signing operation requires
    ///   Face ID / Touch ID authentication. Recommended for production.
    ///
    /// - Returns: The private key reference (key material stays in SE).
    /// - Throws: `SDKError.secureEnclaveUnavailable` if device lacks SE.
    public static func generateKey(
        requireBiometric: Bool = true
    ) throws -> SecureEnclave.P256.Signing.PrivateKey {
        guard SecureEnclave.isAvailable else {
            throw SDKError.secureEnclaveUnavailable
        }

        var accessFlags: SecAccessControlCreateFlags = [.privateKeyUsage]
        if requireBiometric {
            accessFlags.insert(.biometryAny)
        }

        let access = SecAccessControlCreateWithFlags(
            kCFAllocatorDefault,
            kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
            accessFlags,
            nil
        )!

        return try SecureEnclave.P256.Signing.PrivateKey(
            accessControl: access
        )
    }

    /// Load an existing Secure Enclave key from its stored data representation.
    public static func loadKey(
        from data: Data,
        authContext: LAContext? = nil
    ) throws -> SecureEnclave.P256.Signing.PrivateKey {
        try SecureEnclave.P256.Signing.PrivateKey(
            dataRepresentation: data,
            authenticationContext: authContext
        )
    }

    // ─── Signing ──────────────────────────────────────────────────────────────

    /// Sign arbitrary data using a Secure Enclave key.
    /// Returns a DER-encoded ECDSA signature over SHA-256 of the data.
    ///
    /// This operation runs INSIDE the Secure Enclave — the private key
    /// is never exposed to the application processor.
    public static func sign(
        key:  SecureEnclave.P256.Signing.PrivateKey,
        data: Data
    ) throws -> Data {
        let hash      = SHA256.hash(data: data)
        let signature = try key.signature(for: hash)
        return signature.derRepresentation
    }

    /// Sign a canonical bundle payload (UTF-8 JSON string).
    public static func signCanonical(
        key:     SecureEnclave.P256.Signing.PrivateKey,
        payload: String
    ) throws -> String {
        guard let data = payload.data(using: .utf8) else {
            throw SDKError.encodingError("Cannot encode canonical payload as UTF-8")
        }
        let sigData = try sign(key: key, data: data)
        return sigData.base64EncodedString()
    }

    // ─── Identity ─────────────────────────────────────────────────────────────

    /// Derive a device ID from the Secure Enclave public key.
    /// Format: "dev_" + first 16 hex chars of SHA-256(compressedPublicKey)
    public static func deviceID(
        for key: SecureEnclave.P256.Signing.PrivateKey
    ) -> String {
        let pubKeyData = key.publicKey.compressedRepresentation
        let hash       = SHA256.hash(data: pubKeyData)
        let hexHash    = hash.map { String(format: "%02x", $0) }.joined()
        return "dev_\(hexHash.prefix(16))"
    }

    /// Export public key as base64-encoded compressed point (33 bytes).
    public static func exportPublicKey(
        _ key: SecureEnclave.P256.Signing.PrivateKey
    ) -> String {
        key.publicKey.compressedRepresentation.base64EncodedString()
    }

    // ─── Persistence ──────────────────────────────────────────────────────────

    /// Save a Secure Enclave key's data representation to the Keychain.
    /// The actual key material remains in the SE — only the opaque reference is stored.
    public static func saveToKeychain(
        key:   SecureEnclave.P256.Signing.PrivateKey,
        label: String = keyLabel
    ) throws {
        let query: [String: Any] = [
            kSecClass             as String: kSecClassGenericPassword,
            kSecAttrLabel         as String: label,
            kSecAttrAccount       as String: "aletheia-se-key",
            kSecValueData         as String: key.dataRepresentation,
            kSecAttrAccessible    as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]
        SecItemDelete(query as CFDictionary) // remove any existing
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw SDKError.keychainError(status)
        }
    }

    /// Load a previously saved Secure Enclave key reference from Keychain.
    public static func loadFromKeychain(
        label: String = keyLabel
    ) throws -> SecureEnclave.P256.Signing.PrivateKey? {
        let query: [String: Any] = [
            kSecClass           as String: kSecClassGenericPassword,
            kSecAttrLabel       as String: label,
            kSecAttrAccount     as String: "aletheia-se-key",
            kSecReturnData      as String: true,
            kSecMatchLimit      as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return try loadKey(from: data)
    }
}

// MARK: - LAContext import placeholder
// In a real build, import LocalAuthentication at the top of the file.
// Keeping this as a typealias avoids build errors in SDK-only targets.
public typealias LAContext = AnyObject
