// 연결 정보(주소·포트·토큰·지문) 저장. Android Keystore의 AES-GCM 키로 암호화한 값만 기기에 남긴다
// 키는 Keystore 밖으로 나오지 않는다. "기기에서 지우기"는 암호문과 키를 함께 지운다

package com.claudeoffice.remote.store

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.claudeoffice.remote.net.Connection
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

class SecureStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @Serializable
    private data class Stored(val host: String, val port: Int, val token: String, val spki: String, val lan: String? = null)

    @Synchronized
    fun load(): Connection? {
        val blob = prefs.getString(KEY_CONN, null) ?: return null
        return try {
            val bytes = Base64.decode(blob, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key() ?: return null, GCMParameterSpec(128, bytes, 0, IV_BYTES))
            val plain = cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES)
            val s = Json.decodeFromString(Stored.serializer(), plain.toString(Charsets.UTF_8))
            Connection(s.host, s.port, s.token, s.spki, s.lan)
        } catch (_: Exception) {
            // 키가 사라졌거나(기기 초기화·복원) 손상됨 → 연결 정보 없음으로 본다
            null
        }
    }

    @Synchronized
    fun save(conn: Connection) {
        val plain = Json.encodeToString(Stored.serializer(), Stored(conn.host, conn.port, conn.token, conn.spki, conn.lan))
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key() ?: createKey())
        val out = cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        check(cipher.iv.size == IV_BYTES)
        prefs.edit().putString(KEY_CONN, Base64.encodeToString(out, Base64.NO_WRAP)).commit()
    }

    /** 저장된 연결 정보와 Keystore 키를 모두 지운다 */
    @Synchronized
    fun clear() {
        prefs.edit().remove(KEY_CONN).commit()
        try {
            keyStore().deleteEntry(ALIAS)
        } catch (_: Exception) {
        }
    }

    private fun keyStore() = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    private fun key(): SecretKey? = (keyStore().getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey

    private fun createKey(): SecretKey {
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                // 백그라운드 조회가 화면 잠금 중에도 읽어야 하므로 사용자 인증은 요구하지 않는다
                .setUserAuthenticationRequired(false)
                .build(),
        )
        return gen.generateKey()
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "claude_office_connection"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val PREFS = "secure"
        const val KEY_CONN = "conn"
    }
}
