package io.aletheia.sdk.capture

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.KeyProperties.*
import androidx.annotation.RequiresApi
import java.security.*
import java.security.spec.ECGenParameterSpec
import java.security.interfaces.ECPublicKey

/**
 * Manages hardware-backed signing keys in the Android Keystore.
 *
 * When StrongBox is available (Pixel 3+, Samsung Galaxy S10+):
 *   - Keys are generated and stored in the dedicated security chip
 *   - Private key NEVER leaves StrongBox hardware
 *   - Signing operations execute inside the security chip
 *
 * When StrongBox is unavailable:
 *   - Falls back to TEE-backed (Trusted Execution Environment) keys
 *   - Still hardware-backed, but in a shared processor partition
 *
 * Reference:
 *   https://developer.android.com/training/articles/keystore
 *   https://source.android.com/docs/security/features/keystore
 */
class HardwareKeyManager(private val context: Context) {

    companion object {
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val KEY_ALIAS         = "io.aletheia.sdk.capture.key"
        private const val KEY_CURVE         = "secp256r1"  // P-256, matches iOS SE
    }

    private val keyStore: KeyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
        .also { it.load(null) }

    // ─── Key availability ─────────────────────────────────────────────────────

    /** True if StrongBox-backed key storage is available on this device. */
    val isStrongBoxAvailable: Boolean
        get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
                context.packageManager.hasSystemFeature("android.hardware.strongbox_keystore")

    /** True if a key already exists in the Keystore. */
    val hasKey: Boolean
        get() = keyStore.containsAlias(KEY_ALIAS)

    // ─── Key generation ───────────────────────────────────────────────────────

    /**
     * Generate a new ECDSA P-256 key pair in the Android Keystore.
     *
     * @param requireBiometric  Require biometric authentication before signing.
     *                          Recommended for production.
     * @param preferStrongBox   Try StrongBox first; fall back to TEE if unavailable.
     *
     * @return The generated [KeyPair]. The private key is opaque —
     *         it cannot be extracted from the Keystore.
     */
    fun generateKey(
        requireBiometric: Boolean = true,
        preferStrongBox:  Boolean = true,
    ): KeyPair {
        // Delete existing key if present
        if (hasKey) keyStore.deleteEntry(KEY_ALIAS)

        val useStrongBox = preferStrongBox && isStrongBoxAvailable

        val specBuilder = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            PURPOSE_SIGN or PURPOSE_VERIFY
        )
            .setAlgorithmParameterSpec(ECGenParameterSpec(KEY_CURVE))
            .setDigests(DIGEST_SHA256)
            .setUserAuthenticationRequired(requireBiometric)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && requireBiometric) {
            specBuilder.setUserAuthenticationParameters(
                0,  // 0 = require auth for every use
                KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL
            )
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && useStrongBox) {
            specBuilder.setIsStrongBoxBacked(true)
        }

        return KeyPairGenerator.getInstance(KEY_ALGORITHM_EC, KEYSTORE_PROVIDER)
            .also { it.initialize(specBuilder.build()) }
            .generateKeyPair()
    }

    /**
     * Load the existing key pair from the Keystore.
     * @throws IllegalStateException if no key has been generated yet.
     */
    fun loadKey(): KeyPair {
        check(hasKey) { "No Aletheia signing key found — call generateKey() first." }
        val privateKey = keyStore.getKey(KEY_ALIAS, null) as PrivateKey
        val publicKey  = keyStore.getCertificate(KEY_ALIAS).publicKey
        return KeyPair(publicKey, privateKey)
    }

    // ─── Signing ──────────────────────────────────────────────────────────────

    /**
     * Sign a canonical payload string using the Keystore-backed private key.
     * Returns a Base64-encoded DER ECDSA signature over SHA-256 of the data.
     *
     * The signing operation executes inside StrongBox / TEE —
     * the private key is never accessible to application code.
     */
    fun signCanonical(canonicalPayload: String): String {
        val keyPair    = loadKey()
        val dataBytes  = canonicalPayload.toByteArray(Charsets.UTF_8)
        val sigBytes   = Signature.getInstance("SHA256withECDSA").run {
            initSign(keyPair.private)
            update(dataBytes)
            sign()
        }
        return android.util.Base64.encodeToString(sigBytes, android.util.Base64.NO_WRAP)
    }

    // ─── Identity ─────────────────────────────────────────────────────────────

    /**
     * Export the public key as a Base64-encoded DER SubjectPublicKeyInfo.
     * This is the value stored in proof bundles and sent to the server.
     */
    fun exportPublicKeyBase64(): String {
        val cert = keyStore.getCertificate(KEY_ALIAS)
            ?: throw IllegalStateException("No certificate found for key alias")
        return android.util.Base64.encodeToString(
            cert.publicKey.encoded, android.util.Base64.NO_WRAP
        )
    }

    /**
     * Derive a device ID from the public key.
     * Format: "dev_" + first 16 hex chars of SHA-256(publicKeyDER)
     */
    fun deriveDeviceId(): String {
        val pubKeyBytes = keyStore.getCertificate(KEY_ALIAS).publicKey.encoded
        val hash = MessageDigest.getInstance("SHA-256").digest(pubKeyBytes)
        val hex  = hash.joinToString("") { "%02x".format(it) }
        return "dev_${hex.take(16)}"
    }

    /**
     * Returns the trust level based on hardware backing.
     */
    fun trustLevel(): String = when {
        isStrongBoxAvailable -> "HARDWARE_ATTESTED"
        else                 -> "HARDWARE_TEE"
    }
}
