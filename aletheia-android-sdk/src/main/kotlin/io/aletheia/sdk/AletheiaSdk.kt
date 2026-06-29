package io.aletheia.sdk

import android.content.Context
import io.aletheia.sdk.capture.HardwareKeyManager
import io.aletheia.sdk.capture.PlayIntegrityManager
import io.aletheia.sdk.capture.TrustedCaptureSession
import io.aletheia.sdk.capture.TrustedCaptureSession.Configuration
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * Aletheia Android SDK — Trusted Capture & Provenance Infrastructure
 *
 * Quick start:
 * ```kotlin
 * val sdk = AletheiaSdk.initialize(
 *     context       = applicationContext,
 *     serverBaseUrl = "https://api.aletheia.io",
 * )
 *
 * val result = sdk.captureSession.sign(imageBytes)
 * val response = sdk.submitCapture(result)
 * Log.d("Aletheia", "Trust level: ${response.trustLevel}")
 * ```
 */
class AletheiaSdk private constructor(
    private val context:       Context,
    private val serverBaseUrl: String?,
    val captureSession:        TrustedCaptureSession,
    val keyManager:            HardwareKeyManager,
    val playIntegrity:         PlayIntegrityManager,
) {

    companion object {
        const val VERSION = "2.0.0"

        /** Mandatory disclaimer — must be shown to end users alongside verification results. */
        const val PROVENANCE_SCOPE_NOTE =
            "Verification confirms provenance integrity, not independent semantic truth of depicted content."

        /**
         * Initialize the Aletheia SDK.
         *
         * @param context         Android application context
         * @param serverBaseUrl   Base URL of the Aletheia verification server
         * @param requireBiometric Require biometric authentication for signing
         * @param aiDisclosure    Provenance origin declaration for captures
         */
        fun initialize(
            context:          Context,
            serverBaseUrl:    String? = null,
            requireBiometric: Boolean = true,
            aiDisclosure:     TrustedCaptureSession.AIDisclosure =
                TrustedCaptureSession.AIDisclosure.DECLARED_CAMERA_ORIGINAL,
        ): AletheiaSdk {
            val appContext   = context.applicationContext
            val keyManager   = HardwareKeyManager(appContext)
            val playIntegrity = PlayIntegrityManager(appContext)
            val config       = Configuration(
                requireBiometric = requireBiometric,
                aiDisclosure     = aiDisclosure,
                serverBaseUrl    = serverBaseUrl,
            )
            val session = TrustedCaptureSession.create(appContext, config)
            return AletheiaSdk(appContext, serverBaseUrl, session, keyManager, playIntegrity)
        }
    }

    // ─── Device information ───────────────────────────────────────────────────

    val deviceId:   String get() = captureSession.deviceId
    val publicKey:  String get() = captureSession.publicKey
    val trustLevel: String get() = captureSession.trustLevel

    val isStrongBoxBacked: Boolean get() = keyManager.isStrongBoxAvailable

    // ─── Submit capture to server ─────────────────────────────────────────────

    data class SubmitResponse(
        val valid:              Boolean,
        val trustLevel:         String,
        val trustScore:         Int,
        val hashMatch:          Boolean,
        val signatureValid:     Boolean,
        val provenanceScopeNote:String,
    )

    suspend fun submitCapture(
        result:    TrustedCaptureSession.CaptureResult,
        apiKey:    String? = null,
    ): SubmitResponse = withContext(Dispatchers.IO) {
        val base = serverBaseUrl ?: throw IllegalStateException("serverBaseUrl not configured")
        val body = JSONObject().apply {
            put("media_hash", result.mediaHash)
            put("bundle", JSONObject(result.bundleJson))
        }.toString().toRequestBody("application/json".toMediaType())

        val request = Request.Builder()
            .url("$base/api/v2/verify")
            .post(body)
            .apply { apiKey?.let { header("Authorization", "Bearer $it") } }
            .build()

        val response = OkHttpClient().newCall(request).execute()
        val json = JSONObject(response.body?.string() ?: "{}")

        SubmitResponse(
            valid              = json.optBoolean("valid", false),
            trustLevel         = json.optString("trust_level", "UNTRUSTED_SOURCE"),
            trustScore         = json.optInt("trust_score", 0),
            hashMatch          = json.optBoolean("hash_match", false),
            signatureValid     = json.optBoolean("signature_valid", false),
            provenanceScopeNote = json.optString("provenance_scope_note", PROVENANCE_SCOPE_NOTE),
        )
    }

    // ─── Attestation flow ─────────────────────────────────────────────────────

    suspend fun performAttestation(
        cloudProjectNumber: Long,
        apiKey: String? = null,
    ): String = withContext(Dispatchers.IO) {
        val base = serverBaseUrl ?: throw IllegalStateException("serverBaseUrl not configured")

        // 1. Fetch challenge
        val challengeBody = """{"device_id":"$deviceId","platform":"android"}"""
            .toRequestBody("application/json".toMediaType())
        val challengeResp = OkHttpClient().newCall(
            Request.Builder().url("$base/api/v2/attest/challenge").post(challengeBody).build()
        ).execute()
        val nonce = JSONObject(challengeResp.body?.string() ?: "{}").optString("challenge_nonce")

        // 2. Get Play Integrity token
        val token = playIntegrity.requestIntegrityToken(nonce, cloudProjectNumber)

        // 3. Send to Aletheia server
        val attestBody = JSONObject().apply {
            put("platform", "android")
            put("device_id", deviceId)
            put("attestation_token", token)
            put("challenge_nonce", nonce)
        }.toString().toRequestBody("application/json".toMediaType())

        val attestResp = OkHttpClient().newCall(
            Request.Builder().url("$base/api/v2/attest").post(attestBody)
                .apply { apiKey?.let { header("Authorization", "Bearer $it") } }
                .build()
        ).execute()

        JSONObject(attestResp.body?.string() ?: "{}").optString("attestation_id", "")
    }
}
