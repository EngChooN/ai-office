// 업데이트 알림 — GitHub Release 응답 해석·버전 비교 (순수 함수. PC 앱 shared/updateCheck.ts와 같은 규칙)

package com.claudeoffice.remote.update

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.Json

const val RELEASE_API_URL = "https://api.github.com/repos/EngChooN/claude-office/releases/latest"
const val APK_NAME = "Claude-Office-android.apk"
const val CHECK_INTERVAL_MS = 6L * 60 * 60 * 1000

data class ReleaseInfo(
    /** 앞의 v를 뗀 버전 */
    val version: String,
    /** Release 설명 요약 */
    val notes: String,
    /** APK 주소 — 없으면 Release 페이지 */
    val downloadUrl: String,
)

private val VERSION = Regex("^v?(\\d+)\\.(\\d+)\\.(\\d+)(?:-([0-9A-Za-z.-]+))?(?:\\+[0-9A-Za-z.-]+)?$")

private class Parsed(val core: List<Int>, val pre: List<String>)

private fun parse(text: String): Parsed? {
    val m = VERSION.matchEntire(text.trim()) ?: return null
    val core = (1..3).map { m.groupValues[it].toIntOrNull() ?: return null }
    return Parsed(core, m.groupValues[4].let { if (it.isEmpty()) emptyList() else it.split('.') })
}

/** semver 순서: a가 크면 양수, 같으면 0, 작으면 음수. 형식이 다르면 null */
fun compareVersions(a: String, b: String): Int? {
    val va = parse(a) ?: return null
    val vb = parse(b) ?: return null
    for (i in 0..2) if (va.core[i] != vb.core[i]) return va.core[i].compareTo(vb.core[i])
    if (va.pre.isEmpty() || vb.pre.isEmpty()) return vb.pre.size - va.pre.size
    for (i in 0 until maxOf(va.pre.size, vb.pre.size)) {
        val pa = va.pre.getOrNull(i) ?: return -1
        val pb = vb.pre.getOrNull(i) ?: return 1
        if (pa == pb) continue
        val na = pa.all { it.isDigit() }
        val nb = pb.all { it.isDigit() }
        if (na && nb) return pa.toLong().compareTo(pb.toLong())
        if (na != nb) return if (na) -1 else 1
        return if (pa < pb) -1 else 1
    }
    return 0
}

fun isNewerVersion(latest: String, current: String): Boolean = (compareVersions(latest, current) ?: 0) > 0

/** 더 높은 버전이고 [나중에]로 건너뛴 버전이 아닐 때만 알린다 */
fun shouldNotify(latest: String, current: String, skipped: String?): Boolean =
    isNewerVersion(latest, current) && (skipped == null || compareVersions(latest, skipped) != 0)

/** 디버그 빌드의 "-debug" 꼬리를 뗀 현재 버전 */
fun currentVersionOf(versionName: String): String = versionName.removeSuffix("-debug")

private fun isGithubUrl(url: String?) = url != null && url.startsWith("https://github.com/")

private val LANG_HEADERS = listOf("ko" to "한국어", "en" to "English", "ja" to "日本語", "zh" to "中文")
private val H2 = Regex("^##[ \\t]+(.*?)[ \\t]*$")

private fun langOf(header: String): String? = LANG_HEADERS.firstOrNull { header.startsWith(it.second) }?.first

/** 본문의 '## 한국어' · '## English' · '## 日本語' · '## 中文' 섹션 중 lang에 맞는 것만. 없으면 English → 한국어, 언어 헤더가 없으면 본문 전체 */
fun pickLanguageSection(body: String, lang: String): String {
    val lines = body.replace("\r\n", "\n").replace("\r", "\n").split('\n')
    val sections = LinkedHashMap<String, MutableList<String>>()
    var cur: MutableList<String>? = null
    for (line in lines) {
        val code = H2.matchEntire(line)?.let { langOf(it.groupValues[1]) }
        if (code != null) { cur = sections.getOrPut(code) { mutableListOf() }; continue }
        cur?.add(line)
    }
    if (sections.isEmpty()) return body
    val pick = sections[lang] ?: sections["en"] ?: sections["ko"] ?: sections.values.first()
    return pick.joinToString("\n")
}

/** Release 설명(마크다운)을 안내에 넣을 짧은 글로: 기호·링크·이미지·주석을 걷고 앞부분만 남긴다 */
fun summarizeNotes(body: String?, lang: String = "en", maxLines: Int = 6, maxChars: Int = 300): String {
    if (body == null) return ""
    val lines = pickLanguageSection(body, lang).replace("\r\n", "\n").replace("\r", "\n")
        .replace(Regex("<!--[\\s\\S]*?-->"), "")
        .replace(Regex("!\\[[^\\]]*]\\([^)]*\\)"), "")
        .replace(Regex("\\[([^\\]]+)]\\([^)]*\\)"), "$1")
        .split('\n')
        .map { it.replace(Regex("^\\s{0,3}#{1,6}\\s*"), "").replace(Regex("^\\s*[-*+]\\s+"), "• ").replace("**", "").replace("`", "").trim() }
        .filter { it.isNotEmpty() }
        .take(maxLines)
    val text = lines.joinToString("\n")
    return if (text.length > maxChars) text.take(maxChars).trimEnd() + "…" else text
}

/** releases/latest 응답 해석. 이상하면 null */
fun parseRelease(json: String, lang: String = "en"): ReleaseInfo? {
    val obj = runCatching { Json.parseToJsonElement(json) as? JsonObject }.getOrNull() ?: return null
    fun str(o: JsonObject, k: String) = (o[k] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
    val tag = str(obj, "tag_name") ?: return null
    val version = tag.trim().removePrefix("v")
    if (parse(version) == null) return null
    val apk = (obj["assets"] as? JsonArray)?.firstNotNullOfOrNull { a ->
        (a as? JsonObject)?.takeIf { str(it, "name") == APK_NAME }?.let { str(it, "browser_download_url") }
    }?.takeIf { isGithubUrl(it) }
    val page = str(obj, "html_url")?.takeIf { isGithubUrl(it) } ?: "https://github.com/EngChooN/claude-office/releases/latest"
    return ReleaseInfo(version, summarizeNotes(str(obj, "body"), lang), apk ?: page)
}
