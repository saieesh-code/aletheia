package io.aletheia.sdk.capture

import android.content.Context
import android.location.Location
import android.location.LocationManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.security.MessageDigest
import java.util.UUID

/**
 * A single trusted capture session.
 * Signs media data using Android Keystore (StrongBox / TEE backed).
 *
 * Usage:
 * ```kotlin
 * val session = TrustedCaptureSession.create(context)
 * val result  = session.sign(imageBytes)
 * // result.bundleJson → POST to /api/v2/manifest
 * ```
 */
class TrustedCaptureSession private constructor(
    private val context:    Context,
    private val keyManager: HardwareKeyManager,
    private val config:     Configuration,
) {

    // ─── Configuration ────────────────────────────────────────────────────────

    data class Configuration(
        val requireBiometric: Boolean       = true,
        val includeGPS:       Boolean       = true,
        val aiDisclosure:     AIDisclosure  = AIDisclosure.DECLARED_CAMERA_ORIGINAL,
        val serverBaseUrl:    String?       = null,
    )

    enum class AIDisclosure(val value: String) {
        DECLARED_CAMERA_ORIGINAL("declared_camera_original"),
        DECLARED_AI_GENERATED   ("declared_ai_generated"),
        DECLARED_AI_MODIFIED    ("declared_ai_modified"),
        UNDECLARED_ORIGIN       ("undeclared_origin"),
        UNKNOWN_ORIGIN          ("unknown_origin"),
    }

    // ─── Bundle Types ─────────────────────────────────────────────────────────

    @Serializable
    data class ProvenanceBundle(
        val version:       Int    = 2,
        val media_hash:    String,
        val timestamp:     String,
        val device_id:     String,
        val gps:           GpsCoordinates?,
        val nonce:         String,
        val signature:     String,
        val public_key:    String,
        val ai_disclosure: String,
        val key_type:      String = "P256-Keystore",
    )

    @Serializable
    data class GpsCoordinates(
        val lat:              Double,
        val lon:              Double,
        val accuracy_meters:  Double?,
    )

    data class CaptureResult(
        val bundle:     ProvenanceBundle,
        val mediaHash:  String,
        val bundleJson: String,
        val deviceId:   String,
        val publicKey:  String,
    )

    // ─── Factory ──────────────────────────────────────────────────────────────

    companion object {
        /**
         * Create a TrustedCaptureSession.
         * Generates or loads an existing Keystore key.
         *
         * @param context  Android context (used for GPS + Keystore access)
         * @param config   Session configuration
         */
        fun create(
            context: Context,
            config:  Configuration = Configuration(),
        ): TrustedCaptureSession {
            val keyManager = HardwareKeyManager(context)
            if (!keyManager.hasKey) {
                keyManager.generateKey(
                    requireBiometric = config.requireBiometric,
                    preferStrongBox  = true,
                )
            }
            return TrustedCaptureSession(context, keyManager, config)
        }
    }

    // ─── Signing ──────────────────────────────────────────────────────────────

    /**
     * Hash and sign media bytes.
     *
     * 1. SHA-256 the media bytes
     * 2. Acquire GPS coordinates (optional)
     * 3. Sign canonical payload in Android Keystore (StrongBox / TEE)
     * 4. Return portable proof bundle
     *
     * @param mediaBytes  Raw image or video bytes
     * @return [CaptureResult] containing the signed bundle
     */
    suspend fun sign(mediaBytes: ByteArray): CaptureResult = withContext(Dispatchers.Default) {
        // 1. Hash
        val mediaHash = sha256Hex(mediaBytes)

        // 2. Metadata
        val timestamp = java.time.Instant.now().toString()
        val nonce     = android.util.Base64.encodeToString(
            generateNonce(), android.util.Base64.NO_WRAP
        )
        val gps: GpsCoordinates? = if (config.includeGPS) acquireGPS() else null
        val deviceId  = keyManager.deriveDeviceId()
        val publicKey = keyManager.exportPublicKeyBase64()

        // 3. Canonical payload (key order must match server)
        val canonical = buildCanonical(mediaHash, timestamp, deviceId, gps, nonce)

        // 4. Sign in Keystore (runs in StrongBox / TEE)
        val signature = keyManager.signCanonical(canonical)

        // 5. Assemble bundle
        val bundle = ProvenanceBundle(
            media_hash    = mediaHash,
            timestamp     = timestamp,
            device_id     = deviceId,
            gps           = gps,
            nonce         = nonce,
            signature     = signature,
            public_key    = publicKey,
            ai_disclosure = config.aiDisclosure.value,
        )

        val json = Json { prettyPrint = true; encodeDefaults = true }
        CaptureResult(
            bundle    = bundle,
            mediaHash = mediaHash,
            bundleJson = json.encodeToString(ProvenanceBundle.serializer(), bundle),
            deviceId  = deviceId,
            publicKey = publicKey,
        )
    }

    // ─── Identity ─────────────────────────────────────────────────────────────

    val deviceId:  String get() = keyManager.deriveDeviceId()
    val publicKey: String get() = keyManager.exportPublicKeyBase64()
    val trustLevel:String get() = keyManager.trustLevel()

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private fun sha256Hex(data: ByteArray): String {
        val hash = MessageDigest.getInstance("SHA-256").digest(data)
        return hash.joinToString("") { "%02x".format(it) }
    }

    private fun generateNonce(): ByteArray {
        val bytes = ByteArray(16)
        java.security.SecureRandom().nextBytes(bytes)
        return bytes
    }

    private fun buildCanonical(
        mediaHash: String, timestamp: String,
        deviceId: String, gps: GpsCoordinates?, nonce: String,
    ): String {
        // Must match server-side canonical_bundle_payload() exactly (sorted keys)
        val gpsJson = if (gps != null)
            """{"lat":${gps.lat},"lon":${gps.lon}}"""
        else "null"
        return """{"device_id":"$deviceId","gps":$gpsJson,"media_hash":"$mediaHash","nonce":"$nonce","timestamp":"$timestamp"}"""
    }

    private fun acquireGPS(): GpsCoordinates? {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        return try {
            val loc: Location? = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                ?: lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            loc?.let { GpsCoordinates(it.latitude, it.longitude, it.accuracy.toDouble()) }
        } catch (_: SecurityException) { null }
    }
}
