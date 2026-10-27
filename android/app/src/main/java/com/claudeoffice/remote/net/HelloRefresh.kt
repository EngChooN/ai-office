// /v2/hello 응답의 lo(전용 모드)·lan(PC의 지금 내부 주소)으로 저장한 연결을 갱신한다
// 모드를 바꾸거나 PC 주소(DHCP)가 바뀌어도 QR을 다시 찍지 않게 한다. 토큰·지문은 건드리지 않는다

package com.claudeoffice.remote.net

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull

/** 바뀐 연결을 돌려준다. 바뀐 게 없거나 예전 PC(lo·lan 둘 다 없음)이거나 값이 틀리면 null */
fun Connection.refreshedFromHello(result: JsonElement?): Connection? {
    val obj = result as? JsonObject ?: return null
    val lo = (obj["lo"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull
    val newLan = (obj["lan"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.takeIf(::isPrivateIpv4)
    if (lo == null && newLan == null) return null
    val isLanOnly = lo ?: this.isLanOnly
    // 전용 모드의 host는 PC의 내부 주소다 — 주소가 바뀌면 같이 옮긴다
    val host = if (isLanOnly && newLan != null) newLan else host
    return copy(host = host, lan = newLan ?: lan, isLanOnly = isLanOnly).takeIf { it != this }
}
