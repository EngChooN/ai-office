package com.claudeoffice.remote

import com.claudeoffice.remote.update.compareVersions
import com.claudeoffice.remote.update.currentVersionOf
import com.claudeoffice.remote.update.isNewerVersion
import com.claudeoffice.remote.update.isReleaseWithoutApk
import com.claudeoffice.remote.update.parseRelease
import com.claudeoffice.remote.update.shouldNotify
import com.claudeoffice.remote.update.summarizeNotes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UpdateCheckTest {
    @Test
    fun compare() {
        assertTrue(isNewerVersion("v0.12.0", "0.11.1"))
        assertFalse(isNewerVersion("0.11.1", "0.11.1"))
        assertFalse(isNewerVersion("0.9.0", "0.11.1"))
        assertTrue(isNewerVersion("0.11.1", "0.11.1-beta.1"))
        assertNull(compareVersions("latest", "0.11.1"))
        assertEquals("0.11.1", currentVersionOf("0.11.1-debug"))
    }

    @Test
    fun skipped() {
        assertFalse(shouldNotify("0.12.0", "0.11.1", "0.12.0"))
        assertTrue(shouldNotify("0.12.1", "0.11.1", "0.12.0"))
        assertFalse(shouldNotify("0.11.1", "0.11.1", null))
    }

    @Test
    fun release() {
        val json = """{"tag_name":"v0.12.0","html_url":"https://github.com/EngChooN/ai-office/releases/tag/v0.12.0",
          "body":"## 변경\n- **새 기능** [링크](http://x)","assets":[{"name":"AI-Office-android.apk","browser_download_url":"https://github.com/EngChooN/ai-office/releases/download/v0.12.0/AI-Office-android.apk"}]}"""
        val r = parseRelease(json)!!
        assertEquals("0.12.0", r.version)
        assertTrue(r.downloadUrl.endsWith("AI-Office-android.apk"))
        // 새 이름 파일이 없는 옛 Release는 옛 이름으로 찾는다
        val legacy = """{"tag_name":"v0.12.0","html_url":"https://github.com/EngChooN/ai-office/releases/tag/v0.12.0",
          "assets":[{"name":"Claude-Office-android.apk","browser_download_url":"https://github.com/EngChooN/ai-office/releases/download/v0.12.0/Claude-Office-android.apk"}]}"""
        assertTrue(parseRelease(legacy)!!.downloadUrl.endsWith("Claude-Office-android.apk"))
        assertEquals("변경\n• 새 기능 링크", r.notes)
        assertNull(parseRelease("{}"))
        assertNull(parseRelease("not json"))
        // APK가 없는 Release(맥·윈도우만 먼저 배포)는 알리지 않는다. 형식은 정상이라 '실패'와는 구분한다
        val noApk = """{"tag_name":"v0.12.0","html_url":"https://github.com/EngChooN/ai-office/releases/tag/v0.12.0",
          "assets":[{"name":"AI-Office-mac.dmg","browser_download_url":"https://github.com/EngChooN/ai-office/releases/download/v0.12.0/AI-Office-mac.dmg"}]}"""
        assertNull(parseRelease(noApk))
        assertTrue(isReleaseWithoutApk(noApk))
        assertNull(parseRelease("""{"tag_name":"v1.0.0"}"""))
        assertTrue(isReleaseWithoutApk("""{"tag_name":"v1.0.0"}"""))
        assertFalse(isReleaseWithoutApk(json))
        assertFalse(isReleaseWithoutApk("not json"))
        // 같은 버전에 APK가 나중에 붙으면 (건너뛴 기록이 없으므로) 알림 대상이 된다
        assertTrue(shouldNotify(parseRelease(json)!!.version, "0.11.1", null))
    }

    private val multi = "# Claude Office 0.12.0\n\n## 한국어\n\n### 새 기능\n- 한글 항목\n\n## English\n\n### New features\n- English item\n\n## 日本語\n\n### 新機能\n- 日本語の項目\n\n## 中文\n\n### 新功能\n- 中文项目\n"

    @Test
    fun languageSection() {
        assertEquals("New features\n• English item", summarizeNotes(multi, "en"))
        assertEquals("新機能\n• 日本語の項目", summarizeNotes(multi, "ja"))
        assertEquals("新功能\n• 中文项目", summarizeNotes(multi, "zh"))
        assertEquals("새 기능\n• 한글 항목", summarizeNotes(multi, "ko"))
        // 지원 밖 언어는 English
        assertEquals("New features\n• English item", summarizeNotes(multi, "fr"))
    }

    @Test
    fun languageFallback() {
        val noJa = "## 한국어\n- 한글\n## English\n- eng\n"
        assertEquals("• eng", summarizeNotes(noJa, "ja"))
        assertEquals("• 한글", summarizeNotes("## 한국어\n- 한글\n## 中文\n- 中\n", "ja"))
        // 언어 헤더가 없는 옛 본문은 전체
        assertEquals("변경\n• 하나", summarizeNotes("## 변경\n- 하나", "ja"))
    }
}
