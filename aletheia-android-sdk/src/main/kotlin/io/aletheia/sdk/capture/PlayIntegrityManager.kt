package io.aletheia.sdk.capture

import android.content.Context
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import java.security.MessageDigest

/**
 * Android Play Integrity API integration for hardware-rooted device attestation.
 *
 * Play Integrity verifies:
 *   - The app is genuine (from Google Play, not sideloaded or tampered)
 *   - The device passes Android CTS (not rooted, not emulator)
 *   - MEETS_STRONG_INTEGRITY: hardware-backed key attestation available
 *
 * The server (POST /api/v2/attest) validates the token against Google's servers
 * using the Google Play Android Developer API.
 *
 * Reference: https://developer.android.com/google/play/integrity/verdict
 */
class PlayIntegrityManager(private val context: Context) {

    /**
     * Request a Play Integrity token to send to the Aletheia server for validation.
     *
     * IMPORTANT: The [serverNonce] must be fetched fresh from the server
     * (POST /api/v2/attest/challenge) before every attestation request.
     * Never reuse nonces — the server will reject them as replays.
     *
     * @param serverNonce  Fresh nonce from Aletheia attestation challenge endpoint
     * @param cloudProjectNumber  Google Cloud project number associated with your app
     * @return Base64-encoded integrity token to send to /api/v2/attest
     */
    suspend fun requestIntegrityToken(
        serverNonce:         String,
        cloudProjectNumber:  Long,
    ): String = withContext(Dispatchers.IO) {
        val manager = IntegrityManagerFactory.create(context)

        // Hash the server nonce — Play Integrity requires a base64url-encoded nonce
        val nonceHash = sha256Base64(serverNonce)

        val request = IntegrityTokenRequest.builder()
            .setNonce(nonceHash)
            .setCloudProjectNumber(cloudProjectNumber)
            .build()

        val response = manager.requestIntegrityToken(request).await()
        response.token()
    }

    private fun sha256Base64(input: String): String {
        val hash = MessageDigest.getInstance("SHA-256")
            .digest(input.toByteArray(Charsets.UTF_8))
        return android.util.Base64.encodeToString(
            hash,
            android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP or android.util.Base64.NO_PADDING
        )
    }
}

// ─── Expected Play Integrity verdict structure (for documentation) ────────────
//
// After server-side validation, the decoded token contains:
// {
//   "requestDetails": {
//     "requestPackageName": "io.aletheia.app",
//     "nonce": "<sha256 of serverNonce>",
//     "timestampMillis": "1700000000000"
//   },
//   "appIntegrity": {
//     "appRecognitionVerdict": "PLAY_RECOGNIZED",  // ← app is genuine
//     "packageName": "io.aletheia.app",
//     "certificateSha256Digest": ["..."]
//   },
//   "deviceIntegrity": {
//     "deviceRecognitionVerdict": ["MEETS_STRONG_INTEGRITY"]  // ← StrongBox present
//     // Other values: MEETS_DEVICE_INTEGRITY, MEETS_BASIC_INTEGRITY, MEETS_VIRTUAL_INTEGRITY
//   },
//   "accountDetails": {
//     "appLicensingVerdict": "LICENSED"  // ← installed from Play Store
//   }
// }
//
// Minimum requirement for hardware trust: deviceRecognitionVerdict contains
// "MEETS_STRONG_INTEGRITY" (implies hardware-backed key attestation).
