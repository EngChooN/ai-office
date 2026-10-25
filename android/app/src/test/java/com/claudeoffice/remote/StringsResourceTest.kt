package com.claudeoffice.remote

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** 번역 빠짐 검사: 한국어(기본) 키가 en·ja·zh-rCN에 모두 있고, 비어 있지 않고, %1$s 같은 자리가 같은지 */
class StringsResourceTest {
    private fun load(dir: String): Map<String, String> {
        val nodes = DocumentBuilderFactory.newInstance().newDocumentBuilder()
            .parse(File("src/main/res/$dir/strings.xml")).getElementsByTagName("string")
        return (0 until nodes.length).associate { nodes.item(it).attributes.getNamedItem("name").nodeValue to nodes.item(it).textContent }
    }

    private fun slots(s: String) = Regex("%\\d\\$[sd]").findAll(s).map { it.value }.sorted().toList()

    @Test
    fun everyLanguageHasEveryKey() {
        val ko = load("values")
        for (dir in listOf("values-en", "values-ja", "values-zh-rCN")) {
            val m = load(dir)
            val missing = ko.keys.filter { it !in m && it != "app_name" }
            assertTrue("$dir 빠진 키: $missing", missing.isEmpty())
            assertTrue("$dir 남는 키", (m.keys - ko.keys).isEmpty())
            for ((k, v) in m) {
                assertTrue("$dir $k 비어 있음", v.isNotBlank())
                assertEquals("$dir $k 자리 불일치", slots(ko.getValue(k)), slots(v))
            }
        }
    }
}
