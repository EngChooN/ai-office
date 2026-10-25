// 원격 프로토콜 v1 (docs/specs/remote-protocol-v1.md) — 응답 모양
// 모르는 필드는 무시하고(ignoreUnknownKeys), 빠진 선택 필드는 기본값으로 채운다 (규격 2-3)

package com.claudeoffice.remote.net

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** 이 앱이 아는 가장 높은 프로토콜 버전 */
const val PROTOCOL_VERSION = 1

val protocolJson = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    explicitNulls = false
}

/**
 * 직원 한 명. 구별은 id로만 한다. avatar는 받지 않는다 — 앱은 이니셜 원만 그려 쓸 데가 없고,
 * 예전 서버는 Int 범위를 넘는 값(3730355052)을 보내 응답 전체 해석이 실패했다 (QA 2차 0번). 모르는 필드처럼 무시된다
 * 자료형은 규격 3-4절: 시각(statusSince 등)은 Long, 개수는 Int
 */
@Serializable
data class RemoteStaff(
    val id: String,
    val name: String,
    val role: String = "",
    val status: String = "",
    val activity: String = "",
    val statusSince: Long = 0,
    val pendingDecisions: Int = 0,
)

@Serializable
data class StatusSummary(
    val working: Int = 0,
    val waiting: Int = 0,
    val error: Int = 0,
    val idle: Int = 0,
    val offline: Int = 0,
)

@Serializable
data class StatusResponse(
    val protocolVersion: Int,
    val serverTime: Long = 0,
    val serverVersion: String = "",
    val staff: List<RemoteStaff> = emptyList(),
    val summary: StatusSummary = StatusSummary(),
    /** v2 규격 2-1: 이 PC가 제공하는 프로토콜. 없으면 [1] */
    val supportedProtocols: List<Int> = listOf(1),
)

@Serializable
data class QuestionOption(val label: String, val description: String = "")

@Serializable
data class Question(
    val question: String,
    val header: String = "",
    val options: List<QuestionOption> = emptyList(),
    val multiSelect: Boolean = false,
)

@Serializable
data class PlanSubtask(val title: String, val detail: String = "", val assigneeName: String = "")

/** 대기 결정 하나. id는 불투명 — 해석하지 않고 받은 그대로 돌려준다 (규격 1절) */
@Serializable
data class Decision(
    val id: String,
    val kind: String,
    val staffId: String = "",
    val staffName: String = "",
    val summary: String = "",
    val createdAt: Long = 0,
    val toolName: String = "",
    val questions: List<Question> = emptyList(),
    val title: String = "",
    val spec: String = "",
    val subtasks: List<PlanSubtask> = emptyList(),
    val isTruncated: Boolean = false,
)

object DecisionKind {
    const val APPROVAL = "approval"
    const val QUESTION = "question"
    const val PLAN = "plan"

    /** 앱이 응답 버튼을 보여 줄 수 있는 종류인지 (모르는 kind는 "PC에서 확인해 주세요") */
    fun isKnown(d: Decision) = when (d.kind) {
        APPROVAL, PLAN -> true
        QUESTION -> d.questions.isNotEmpty()
        else -> false
    }
}

@Serializable
data class DecisionsResponse(
    val protocolVersion: Int,
    val serverTime: Long = 0,
    val total: Int = 0,
    val decisions: List<Decision> = emptyList(),
)

@Serializable
data class DecideResponse(
    val protocolVersion: Int,
    val serverTime: Long = 0,
    val decisionId: String = "",
    val result: String = "",
)

@Serializable
data class InstructionResponse(
    val protocolVersion: Int,
    val serverTime: Long = 0,
    val accepted: Boolean = false,
    val staffId: String = "",
)

@Serializable
data class ErrorBody(
    val protocolVersion: Int = PROTOCOL_VERSION,
    val error: String? = null,
    val message: String = "",
    val retryAt: Long? = null,
    val retryAfterSec: Int? = null,
    val supported: List<Int> = emptyList(),
    /** v2: pc_only일 때 폰이 대신할 길 (enter_path·download_file·open_on_pc) */
    val alternative: String? = null,
)
