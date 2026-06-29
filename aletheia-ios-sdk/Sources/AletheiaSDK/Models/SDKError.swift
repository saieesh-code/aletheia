import Foundation

public enum SDKError: LocalizedError {
    case secureEnclaveUnavailable
    case appAttestUnsupported
    case attestationFailed(String)
    case verificationFailed(String)
    case keychainError(OSStatus)
    case encodingError(String)
    case networkError(String)
    case invalidBundle(String)

    public var errorDescription: String? {
        switch self {
        case .secureEnclaveUnavailable:    return "Secure Enclave unavailable. Requires A12 Bionic or later."
        case .appAttestUnsupported:        return "App Attest unsupported. Requires iOS 14+ with A12+ chip."
        case .attestationFailed(let msg):  return "Attestation failed: \(msg)"
        case .verificationFailed(let msg): return "Verification failed: \(msg)"
        case .keychainError(let status):   return "Keychain error: OSStatus \(status)"
        case .encodingError(let msg):      return "Encoding error: \(msg)"
        case .networkError(let msg):       return "Network error: \(msg)"
        case .invalidBundle(let msg):      return "Invalid bundle: \(msg)"
        }
    }
}
