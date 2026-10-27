// 화면 흐름: 첫 연결 → (막는 상태 화면 | 하단 탭 3개: 직원 · 결정 · 설정)

package com.claudeoffice.remote.ui

import com.claudeoffice.remote.R
import com.claudeoffice.remote.S

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.imePadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Checklist
import androidx.compose.material.icons.outlined.People
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import com.claudeoffice.remote.data.ConnectResult
import com.claudeoffice.remote.data.Gate
import com.claudeoffice.remote.data.OfficeRepository
import com.claudeoffice.remote.data.Reach
import com.claudeoffice.remote.net.ApiError
import com.claudeoffice.remote.net.QrPayload
import com.claudeoffice.remote.ui.theme.Office
import com.claudeoffice.remote.ui.theme.Type
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private sealed interface Onboarding {
    data object Start : Onboarding
    data object Scan : Onboarding
    data class Connecting(val qr: QrPayload) : Onboarding
    data class Failed(val qr: QrPayload, val error: ApiError, val tried: List<com.claudeoffice.remote.net.Endpoint>) : Onboarding
    data object QrNeedsUpdate : Onboarding
    data object Connected : Onboarding
}

enum class Tab { STAFF, DECISIONS, SETTINGS }

private sealed interface Detail {
    data class Staff(val id: String) : Detail
    data class Question(val id: String) : Detail
    data class Plan(val id: String) : Detail
}

private val DetailSaver = androidx.compose.runtime.saveable.Saver<Detail?, String>(
    save = { d ->
        when (d) {
            is Detail.Staff -> "staff:${d.id}"
            is Detail.Question -> "question:${d.id}"
            is Detail.Plan -> "plan:${d.id}"
            null -> ""
        }
    },
    restore = { t ->
        val id = t.substringAfter(':', "")
        when (t.substringBefore(':')) {
            "staff" -> Detail.Staff(id)
            "question" -> Detail.Question(id)
            "plan" -> Detail.Plan(id)
            else -> null
        }
    },
)

/** 첫 화면에서 열 탭 (알림을 눌러 열었을 때 등) */
class LaunchRequest(val openDecisions: Boolean, val qrText: String?, val webEntry: com.claudeoffice.remote.web.WebEntry? = null)

@Composable
fun AppRoot(repo: OfficeRepository, launch: LaunchRequest?, onLaunchHandled: () -> Unit) {
    val state by repo.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var onboarding by remember { mutableStateOf<Onboarding?>(null) }
    var tab by rememberSaveable { mutableStateOf<Tab?>(null) }

    fun connect(qr: QrPayload) {
        onboarding = Onboarding.Connecting(qr)
        scope.launch {
            onboarding = when (val r = repo.connect(qr)) {
                ConnectResult.Ok -> {
                    tab = null
                    Onboarding.Connected
                }
                is ConnectResult.Failed -> if (r.error is ApiError.Locked) null else Onboarding.Failed(qr, r.error, r.tried)
            }
        }
    }

    // PC 화면 모바일 빌드 (APK에 들어 있을 때). 디버그 빌드는 브리지 시험 페이지로 바꿔 띄울 수 있다
    val context = androidx.compose.ui.platform.LocalContext.current
    var webEntry by remember { mutableStateOf(com.claudeoffice.remote.web.WebBundle.find(context)) }

    // 알림에서 열기 · (디버그 빌드 전용) adb로 QR 내용 넣기
    LaunchedEffect(launch) {
        val req = launch ?: return@LaunchedEffect
        req.webEntry?.let { webEntry = it }
        if (req.openDecisions) tab = Tab.DECISIONS
        req.qrText?.let { text ->
            when (val r = com.claudeoffice.remote.net.parseQr(text)) {
                is com.claudeoffice.remote.net.QrParse.Ok -> connect(r.payload)
                com.claudeoffice.remote.net.QrParse.NeedsAppUpdate -> onboarding = Onboarding.QrNeedsUpdate
                com.claudeoffice.remote.net.QrParse.NotOurs -> Unit
            }
        }
        onLaunchHandled()
    }

    val bg = Modifier.fillMaxSize().background(Office.colors.background)
    val step = onboarding
    // 하단 탭 화면은 Scaffold가 시스템 바 여백을 잡는다. 그 밖의 화면(첫 연결·상태 화면)은 여기서 잡는다 (QA 버그 1: 톱니가 상태 표시줄에 붙음)
    // PC 화면(WebView)은 잠깐 막히는 상태(잠김·앱 오류·응답 이상)에서도 없애지 않는다 — 없애면 보던 화면이 첫 화면으로 돌아간다. 상태 화면은 그 위에 덮는다
    val gate = state.gate
    val keepWeb = webEntry != null && state.v2 == com.claudeoffice.remote.data.V2Mode.ACTIVE &&
        (gate == null || gate is Gate.Locked || gate is Gate.AppBug || gate is Gate.BadResponse || gate == Gate.NeedsPcUpdate)
    val isMain = step == null && (gate == null || keepWeb)

    // 앱으로 돌아왔을 때 잠깐 막혔던 상태는 같은 화면에서 자동으로 다시 시도한다 (잠김은 풀린 뒤에만)
    val owner = androidx.compose.ui.platform.LocalLifecycleOwner.current
    LaunchedEffect(owner, gate) {
        if (gate is Gate.AppBug || gate is Gate.BadResponse || gate is Gate.Locked) {
            owner.repeatOnLifecycle(Lifecycle.State.STARTED) { repo.retry() }
        }
    }
    Box(if (isMain) bg else bg.systemBarsPadding()) {
        when {
            step != null -> when (step) {
                Onboarding.Start -> StartScreen { onboarding = Onboarding.Scan }
                Onboarding.Scan -> ScannerScreen(
                    onPayload = ::connect,
                    onNeedsUpdate = { onboarding = Onboarding.QrNeedsUpdate },
                    onClose = { onboarding = if (state.gate == Gate.NotConnected) Onboarding.Start else null },
                ).also { BackHandler { onboarding = if (state.gate == Gate.NotConnected) Onboarding.Start else null } }
                is Onboarding.Connecting -> ConnectingScreen(step.qr.let { if (':' in it.host) "[${it.host}]:${it.port}" else "${it.host}:${it.port}" })
                is Onboarding.Failed -> ConnectFailedScreen(
                    step.error,
                    onRetry = { connect(step.qr) },
                    onScan = { onboarding = Onboarding.Scan },
                    // 쓰던 연결이 살아 있으면 그대로 두고 돌아갈 수 있게 한다
                    onBackToPrevious = if (state.gate == null) ({ onboarding = null }) else null,
                    tried = step.tried,
                    isLanOnly = step.qr.isLanOnly,
                    isTailscale = step.qr.isTailscale,
                )
                Onboarding.QrNeedsUpdate -> GateScreen(Gate.NeedsAppUpdate, 0, onScan = { onboarding = Onboarding.Scan }, onRetry = { onboarding = Onboarding.Scan }, onSettings = null)
                Onboarding.Connected -> ConnectedScreen(state.address) { onboarding = null }
            }
            state.gate == Gate.NotConnected -> StartScreen { onboarding = Onboarding.Scan }
            keepWeb -> {
                WebRoot(repo, webEntry!!)
                if (gate != null) Box(Modifier.fillMaxSize().background(Office.colors.background).systemBarsPadding()) {
                    GatedRoot(repo, gate, state.clockOffset, onScan = { onboarding = Onboarding.Scan })
                }
            }
            state.gate != null -> GatedRoot(repo, state.gate!!, state.clockOffset, onScan = { onboarding = Onboarding.Scan })
            // 전체 기능(v2)이 켜진 PC + 화면 묶음이 있으면 PC 화면(위 keepWeb), 아니면 기존 네이티브 화면(v1)
            else -> MainRoot(repo, tab, onTab = { tab = it }, hasWebBundle = webEntry != null)
        }
        if (step == null) UpdateBanner(Modifier.align(Alignment.TopCenter))
    }
}

@Composable
private fun GatedRoot(repo: OfficeRepository, gate: Gate, clockOffset: Long, onScan: () -> Unit) {
    val scope = rememberCoroutineScope()
    var showSettings by remember { mutableStateOf(false) }
    val state by repo.state.collectAsStateWithLifecycle()
    if (showSettings) {
        BackHandler { showSettings = false }
        SettingsTab(state, onForget = { repo.forget() }, onBack = { showSettings = false })
    } else {
        GateScreen(gate, clockOffset, onScan, onRetry = { scope.launch { repo.retry() } }, onSettings = { showSettings = true })
    }
}

@Composable
private fun WebRoot(repo: OfficeRepository, entry: com.claudeoffice.remote.web.WebEntry) {
    // 안전 영역과 키보드는 셸이 잡는다 (WebView 안 입력창이 키보드에 가리지 않게).
    // 연결 끊김·재연결 배너는 화면(PC 화면 모바일 빌드)이 connection 메시지로 직접 보인다 — 셸 배너를 겹쳐 그리지 않는다.
    // 토큰 폐기·잠김·인증서 불일치처럼 막히는 경우는 Gate로 네이티브 상태 화면이 대신 뜬다
    // 키보드 높이는 WebShell이 정한다 (화면이 --ime를 처리하면 크기를 줄이지 않고, 아니면 줄인다 — 한쪽만)
    Box(Modifier.fillMaxSize().systemBarsPadding()) { com.claudeoffice.remote.web.WebShell(repo, entry) }
}

@Composable
private fun MainRoot(repo: OfficeRepository, requestedTab: Tab?, onTab: (Tab) -> Unit, hasWebBundle: Boolean = false) {
    val c = Office.colors
    val state by repo.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    // 보던 상세 화면은 액티비티가 다시 만들어져도 이어진다
    var detail by rememberSaveable(stateSaver = DetailSaver) { mutableStateOf<Detail?>(null) }
    var delayBanner by remember { mutableStateOf(repo.takeDelayBanner()) }
    val showMessage: (String) -> Unit = { msg -> scope.launch { snackbar.showSnackbar(msg) } }

    // 앱이 보이는 동안: 바로 한 번, 그 뒤 30초마다 갱신 (백그라운드는 WorkManager 15분)
    val owner = LocalLifecycleOwner.current
    LaunchedEffect(owner) {
        owner.repeatOnLifecycle(Lifecycle.State.STARTED) {
            while (true) {
                repo.refresh()
                delay(30_000)
            }
        }
    }

    // 기본 탭: 대기 결정이 있으면 결정, 없으면 직원
    // (처음 목록을 받았을 때 한 번만 정한다 — 결정을 다 처리했다고 탭이 저절로 바뀌지 않게)
    val hasDecisions = state.decisions != null
    LaunchedEffect(hasDecisions) {
        if (requestedTab == null && hasDecisions) onTab(if ((state.decisions?.total ?: 0) > 0) Tab.DECISIONS else Tab.STAFF)
    }
    val tab = requestedTab ?: Tab.STAFF

    val d = detail
    if (d != null) {
        BackHandler { detail = null }
        val decisions = state.decisions?.decisions.orEmpty()
        Scaffold(snackbarHost = { OfficeSnackbarHost(snackbar) }, containerColor = c.background) { pad ->
            Column(Modifier.padding(pad)) {
                Banners(state, isDetail = true) { scope.launch { repo.retry() } }
                when (d) {
                    is Detail.Staff -> StaffDetailScreen(state, d.id, { detail = null }, { detail = null; onTab(Tab.DECISIONS) }, repo::instruct, showMessage)
                    is Detail.Question -> decisions.firstOrNull { it.id == d.id }?.let {
                        QuestionScreen(it, state, { detail = null }, repo::answer, repo::skip, showMessage)
                    } ?: LaunchedEffect(d) { detail = null }
                    is Detail.Plan -> decisions.firstOrNull { it.id == d.id }?.let {
                        PlanScreen(it, state, { detail = null }, repo::reviewPlan, showMessage)
                    } ?: LaunchedEffect(d) { detail = null }
                }
            }
        }
        return
    }

    var wideSelection by rememberSaveable { mutableStateOf<String?>(null) }
    // 태블릿(840dp 이상)에서는 직원 상세를 오른쪽 패널에 연다
    val isWideScreen = LocalConfiguration.current.screenWidthDp >= 840
    Scaffold(
        containerColor = c.background,
        snackbarHost = { OfficeSnackbarHost(snackbar) },
        bottomBar = {
            NavigationBar(containerColor = c.background, tonalElevation = 0.dp) {
                val colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = c.primary, selectedTextColor = c.primary,
                    unselectedIconColor = c.onSurfaceMuted, unselectedTextColor = c.onSurfaceMuted,
                    indicatorColor = c.surfaceSelected,
                )
                NavigationBarItem(tab == Tab.STAFF, { onTab(Tab.STAFF) }, { Icon(Icons.Outlined.People, null, Modifier.size(24.dp)) }, label = { Text(S.get(R.string.title_staff), style = Type.label) }, colors = colors)
                val pending = state.decisions?.total ?: 0
                NavigationBarItem(
                    tab == Tab.DECISIONS, { onTab(Tab.DECISIONS) },
                    {
                        BadgedBox(badge = {
                            if (pending > 0) Badge(containerColor = c.statusWaitingFill, contentColor = c.onStatusWaitingFill) { Text("$pending", style = Type.labelTiny) }
                        }) { Icon(Icons.Outlined.Checklist, null, Modifier.size(24.dp)) }
                    },
                    label = { Text(S.get(R.string.tab_decisions), style = Type.label) }, colors = colors,
                )
                NavigationBarItem(tab == Tab.SETTINGS, { onTab(Tab.SETTINGS) }, { Icon(Icons.Outlined.Settings, null, Modifier.size(24.dp)) }, label = { Text(S.get(R.string.cd_settings), style = Type.label) }, colors = colors)
            }
        },
    ) { pad ->
        Column(Modifier.padding(pad)) {
            Banners(state) { scope.launch { repo.retry() } }
            val isUnreachable = state.reach == Reach.REMOTE_OFF || state.reach == Reach.UNREACHABLE
            Box(Modifier.weight(1f)) {
                when {
                    tab == Tab.SETTINGS -> SettingsTab(state, onForget = { repo.forget() })
                    isUnreachable -> ReachScreen(state.reach, state.lastSuccessAt, state.tried, state.isLanOnly, state.isTailscale) { scope.launch { repo.retry() } }
                    tab == Tab.STAFF -> Box(Modifier.alpha(if (state.reach == Reach.PHONE_OFFLINE) 0.6f else 1f)) {
                        StaffTab(
                            state, repo::refresh,
                            onOpen = { id -> wideSelection = id; detail = Detail.Staff(id).takeUnless { isWideScreen } },
                            detail = { id -> StaffDetailScreen(state, id, null, { onTab(Tab.DECISIONS) }, repo::instruct, showMessage) },
                            selectedId = wideSelection,
                        )
                    }
                    else -> Box(Modifier.alpha(if (state.reach == Reach.PHONE_OFFLINE) 0.6f else 1f)) {
                        DecisionsTab(
                            state, repo::refresh,
                            onOpen = { dec -> detail = if (dec.kind == "plan") Detail.Plan(dec.id) else Detail.Question(dec.id) },
                            approve = repo::approve, reject = repo::reject, showMessage = showMessage,
                            showDelayBanner = delayBanner, onDismissDelayBanner = { delayBanner = false },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Banners(state: com.claudeoffice.remote.data.OfficeState, isDetail: Boolean = false, onRetry: () -> Unit) {
    val c = Office.colors
    // 무엇을 보일지는 shellBanner 한 곳에서 정한다 (웹 화면 모드에서는 화면이 배너를 그리므로 여기는 그리지 않는다)
    when (com.claudeoffice.remote.data.shellBanner(state, isWebMode = false, isDetail = isDetail)) {
        com.claudeoffice.remote.data.ShellBanner.RECOVERED -> ConnectionBanner(S.get(R.string.banner_reconnected), c.statusWorking)
        com.claudeoffice.remote.data.ShellBanner.UNREACHABLE ->
            ConnectionBanner(S.get(R.string.banner_unreach), c.statusIdle) { PlainTextButton(S.get(R.string.btn_retry), onRetry) }
        com.claudeoffice.remote.data.ShellBanner.PHONE_OFFLINE -> ConnectionBanner(
            S.get(R.string.banner_offline) +
                if (state.lastSuccessAt > 0) S.get(R.string.banner_last_update, clock(state.lastSuccessAt)) else "",
            c.statusWaiting,
        )
        com.claudeoffice.remote.data.ShellBanner.SERVER_ERROR -> ConnectionBanner(S.get(R.string.banner_server_error), c.statusError) {
            PlainTextButton(S.get(R.string.btn_retry), onRetry)
        }
        com.claudeoffice.remote.data.ShellBanner.UNAVAILABLE -> ConnectionBanner(S.get(R.string.banner_unavailable), c.statusIdle)
        // 전체 기능(v2)을 쓸 수 없을 때 안내 (v2 규격 2-1절)
        com.claudeoffice.remote.data.ShellBanner.NEED_PC_UPDATE ->
            ConnectionBanner(S.get(R.string.banner_update_pc), c.statusIdle)
        com.claudeoffice.remote.data.ShellBanner.NONE -> Unit
    }
}

@Composable
private fun OfficeSnackbarHost(host: SnackbarHostState) {
    SnackbarHost(host) { data ->
        Snackbar(data, containerColor = Office.colors.onSurface, contentColor = Office.colors.background)
    }
}
