package com.claudeoffice.remote

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

/** JVM 단위 테스트에서 R.string 글자를 values/strings.xml(한국어 기본)에서 꺼내게 한다 */
object TestStrings {
    private val byId: Map<Int, String> by lazy {
        val xml = File("src/main/res/values/strings.xml")
        val nodes = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(xml).getElementsByTagName("string")
        val byName = (0 until nodes.length).associate { i ->
            val n = nodes.item(i)
            n.attributes.getNamedItem("name").nodeValue to unescape(n.textContent)
        }
        R.string::class.java.fields.filter { it.type == Int::class.javaPrimitiveType }
            .mapNotNull { f -> byName[f.name]?.let { f.getInt(null) to it } }.toMap()
    }

    private fun unescape(s: String): String {
        val t = if (s.length >= 2 && s.startsWith("\"") && s.endsWith("\"")) s.substring(1, s.length - 1) else s
        return t.replace("\\n", "\n").replace("\\'", "'").replace("\\\"", "\"").replace("\\@", "@").replace("\\?", "?")
    }

    fun install() {
        S.provider = { id, args -> String.format(byId.getValue(id), *args) }
    }
}
