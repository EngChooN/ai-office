// 연결 정보(PC 목록: 주소·포트·토큰·지문) 저장. Android Keystore의 AES-GCM 키로 암호화한 값만 기기에 남긴다
// 키는 Keystore 밖으로 나오지 않는다. "기기에서 지우기"는 암호문과 키를 함께 지운다

package com.claudeoffice.remote.store

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SecureStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /**
     * 저장된 PC 목록. 업데이트 전의 1대 저장(conn)이 있으면 1번 PC로 옮긴다.
     * 옛 값은 새 목록이 저장된 뒤에만 지운다 — 중간에 꺼져도 다음 실행에서 다시 옮긴다
     */
    @Synchronized
    fun loadBook(): PcBook {
        readBook()?.let { book ->
            // 새 목록을 읽을 수 있으면 옛 값은 남은 찌꺼기 — 지운다
            if (prefs.contains(KEY_CONN)) prefs.edit().remove(KEY_CONN).commit()
            return book
        }
        val legacy = prefs.getString(KEY_CONN, null) ?: return PcBook()
        val book = decrypt(legacy)?.let { runCatching { PcBookCodec.fromLegacy(it) }.getOrNull() } ?: return PcBook()
        PcBooks.migrateSafely(book, ::saveBook, ::readBook) { prefs.edit().remove(KEY_CONN).commit() }
        return book
    }

    /** 저장된 새 목록을 읽는다. 없거나 풀 수 없으면 null */
    private fun readBook(): PcBook? {
        val blob = prefs.getString(KEY_BOOK, null) ?: return null
        return decrypt(blob)?.let { runCatching { PcBookCodec.decode(it) }.getOrNull() }
    }

    @Synchronized
    fun saveBook(book: PcBook) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key() ?: createKey())
        val out = cipher.iv + cipher.doFinal(PcBookCodec.encode(book).toByteArray(Charsets.UTF_8))
        check(cipher.iv.size == IV_BYTES)
        prefs.edit().putString(KEY_BOOK, Base64.encodeToString(out, Base64.NO_WRAP)).commit()
    }

    /** 키가 사라졌거나(기기 초기화·복원) 손상됨 → null (연결 정보 없음으로 본다) */
    private fun decrypt(blob: String): String? {
        return try {
            val bytes = Base64.decode(blob, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key() ?: return null, GCMParameterSpec(128, bytes, 0, IV_BYTES))
            cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES).toString(Charsets.UTF_8)
        } catch (_: Exception) {
            null
        }
    }

    /** 저장된 연결 정보와 Keystore 키를 모두 지운다 (마지막 PC를 끊을 때) */
    @Synchronized
    fun clear() {
        prefs.edit().remove(KEY_BOOK).remove(KEY_CONN).commit()
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
        const val KEY_BOOK = "book"
    }
}
