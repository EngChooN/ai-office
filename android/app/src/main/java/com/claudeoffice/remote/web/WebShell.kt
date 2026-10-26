// PC 화면 모바일 빌드를 띄우는 WebView 셸 (안드로이드 1.1)
// - 화면은 APK 안 자산만 연다(WebViewAssetLoader). 그 밖의 주소는 모두 막고, WebView는 PC에 직접 나가지 않는다
// - 화면의 window.office 호출은 브리지 → Kotlin(지문 고정 HTTPS)으로만 PC에 간다
// - 브리지는 자산 출처(https://appassets.androidplatform.net)의 최상위 프레임에서 온 메시지만 받는다

package com.claudeoffice.remote.web

import com.claudeoffice.remote.R
import com.claudeoffice.remote.S

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.util.Base64
import android.view.ViewGroup
import android.webkit.GeolocationPermissions
import android.webkit.JsPromptResult
import android.webkit.JsResult
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.runtime.Composable
import androidx.compose.foundation.layout.imePadding
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.claudeoffice.remote.BuildConfig
import com.claudeoffice.remote.data.OfficeRepository
import com.claudeoffice.remote.net.ApiResult
import java.io.ByteArrayInputStream
import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

const val ASSET_HOST = "appassets.androidplatform.net"
const val ASSET_ORIGIN = "https://$ASSET_HOST"

/** 첨부 하나의 상한 (v2 규격 7-1, 서버도 같은 값으로 거절한다) */
private const val UPLOAD_MAX = 20 * 1024 * 1024

/** 화면 자산 위치: assets/<root>/<entry>. 릴리스는 web/mobile.html(최가독의 모바일 빌드) */
data class WebEntry(val root: String, val page: String) {
    val url get() = "$ASSET_ORIGIN/app/$page"
}

object WebBundle {
    /** APK에 PC 화면 모바일 빌드가 들어 있으면 그 입구 (없으면 null → 네이티브 화면) */
    fun find(context: Context): WebEntry? {
        val files = runCatching { context.assets.list("web")?.toSet() }.getOrNull().orEmpty()
        return listOf("mobile.html", "index.html").firstOrNull { it in files }?.let { WebEntry("web", it) }
    }
}

/** 자산 응답에 붙이는 보안 머리글. connect-src 'self' — 화면 코드가 PC나 인터넷에 직접 나가지 못한다 */
internal const val CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self'; " +
    "worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"

internal fun mimeOf(path: String): String = when (path.substringAfterLast('.', "").lowercase()) {
    "html" -> "text/html"
    "js", "mjs" -> "text/javascript"
    "css" -> "text/css"
    "json", "map" -> "application/json"
    "svg" -> "image/svg+xml"
    "png" -> "image/png"
    "jpg", "jpeg" -> "image/jpeg"
    "webp" -> "image/webp"
    "gif" -> "image/gif"
    "woff2" -> "font/woff2"
    "woff" -> "font/woff"
    "ttf" -> "font/ttf"
    "wasm" -> "application/wasm"
    "mp3" -> "audio/mpeg"
    "ogg" -> "audio/ogg"
    "wav" -> "audio/wav"
    "txt", "md" -> "text/plain"
    else -> "application/octet-stream"
}

/** office-file 주소에서 첨부 id만 꺼낸다 (UUID 모양만, 경로 문자는 받지 않는다) */
internal fun officeFileId(url: Uri): String? {
    val raw = when {
        url.scheme == "office-file" && url.host == "file" -> url.path?.trimStart('/')
        url.scheme == "https" && url.host == ASSET_HOST && url.path?.startsWith("/office-file/") == true ->
            url.path!!.removePrefix("/office-file/")
        else -> null
    } ?: return null
    return raw.takeIf { Regex("^[0-9a-fA-F-]{36}$").matches(it) }
}

private fun blocked() = WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", mapOf("Cache-Control" to "no-store"), ByteArrayInputStream(ByteArray(0)))

/** assets/<root>/ 아래만 내준다 (다른 자산·상위 폴더는 못 본다) */
private class AppAssets(private val context: Context, private val root: String) : WebViewAssetLoader.PathHandler {
    override fun handle(path: String): WebResourceResponse? {
        if (path.split('/').any { it == ".." } || path.startsWith("/")) return blocked()
        val stream = runCatching { context.assets.open("$root/$path") }.getOrNull() ?: return null
        val mime = mimeOf(path)
        val headers = buildMap {
            put("X-Content-Type-Options", "nosniff")
            if (mime == "text/html") put("Content-Security-Policy", CSP)
        }
        return WebResourceResponse(mime, if (mime.startsWith("text/") || mime.endsWith("json")) "utf-8" else null, 200, "OK", headers, stream)
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebShell(repo: OfficeRepository, entry: WebEntry, modifier: Modifier = Modifier) {
    val activity = LocalContext.current as Activity
    val scope = rememberCoroutineScope()
    val isTablet = LocalConfiguration.current.screenWidthDp >= 840
    // 키보드가 WebView 아래를 가리는 높이 (CSS px = dp). 시스템 바 높이는 셸이 이미 비켜 두었으므로 뺀다
    val density = androidx.compose.ui.platform.LocalDensity.current
    val imeDp = with(density) {
        val ime = WindowInsets.ime.getBottom(this)
        val nav = WindowInsets.navigationBars.getBottom(this)
        (ime - nav).coerceAtLeast(0).toDp().value.toInt()
    }
    val fileCallback = remember { arrayOfNulls<ValueCallback<Array<Uri>>>(1) }

    // 첨부: 사진은 시스템 사진 선택기, 그 밖은 파일 선택기 (권한 없이 고른 것만 읽는다)
    val pickMedia = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { uris ->
        fileCallback[0]?.onReceiveValue(uris.toTypedArray())
        fileCallback[0] = null
    }
    val pickDocs = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        fileCallback[0]?.onReceiveValue(uris.toTypedArray())
        fileCallback[0] = null
    }

    val bridge = remember { Bridge(activity, repo, scope) }
    val webView = remember {
        createWebView(activity, entry, bridge) { callback, accept ->
            fileCallback[0]?.onReceiveValue(null)
            fileCallback[0] = callback
            val isImageOnly = accept.isNotEmpty() && accept.all { it.startsWith("image/") }
            if (isImageOnly) pickMedia.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
            else pickDocs.launch(accept.filter { it.contains('/') }.ifEmpty { listOf("*/*") }.toTypedArray())
        }
    }
    bridge.isTablet = isTablet
    // 화면이 키보드를 직접 처리하면(features "ime") 높이만 알려 주고, 아니면 셸이 WebView를 키보드 위까지 줄인다
    LaunchedEffect(imeDp, bridge.isImeByScreen) { if (bridge.isImeByScreen) bridge.sendInsets(imeDp, webView) }

    // 이벤트 스트림은 화면이 보이는 동안만 연다 (백그라운드 알림은 v1 15분 조회)
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_START -> bridge.onForeground()
                Lifecycle.Event.ON_STOP -> {
                    bridge.onBackground()
                    // 화면에서 본 결정은 알림을 다시 띄우지 않게 v1 목록으로 표시해 둔다
                    scope.launch { repo.refresh() }
                }
                else -> Unit
            }
        }
        owner.lifecycle.addObserver(obs)
        onDispose {
            owner.lifecycle.removeObserver(obs)
            bridge.close()
            webView.destroy()
        }
    }

    // 뒤로 가기: 화면이 먼저 처리(시트 닫기·이전 화면). 처리하지 않으면 앱을 뒤로 보낸다
    BackHandler {
        scope.launch {
            if (!bridge.askBack()) {
                if (webView.canGoBack()) webView.goBack() else activity.moveTaskToBack(true)
            }
        }
    }

    AndroidView(
        modifier = modifier.fillMaxSize().then(if (bridge.isImeByScreen) Modifier else Modifier.imePadding()),
        factory = { webView.also { (it.parent as? ViewGroup)?.removeView(it) } },
    )
}

@SuppressLint("SetJavaScriptEnabled")
private fun createWebView(
    activity: Activity,
    entry: WebEntry,
    bridge: Bridge,
    chooseFiles: (ValueCallback<Array<Uri>>, List<String>) -> Unit,
): WebView {
    // 릴리스에서는 크롬 원격 디버깅을 끈다
    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
    val loader = WebViewAssetLoader.Builder()
        .setDomain(ASSET_HOST)
        .addPathHandler("/app/", AppAssets(activity, entry.root))
        .build()

    return WebView(activity).apply {
        // 높이를 "내용에 맞춤"으로 두면 WebView가 vh를 0으로 계산한다(100vh·h-screen이 접힘) → 부모를 꽉 채움으로
        layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            @Suppress("DEPRECATION")
            allowFileAccessFromFileURLs = false
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            setGeolocationEnabled(false)
            mediaPlaybackRequiresUserGesture = true
            cacheMode = WebSettings.LOAD_NO_CACHE
        }
        webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                val url = request.url
                officeFileId(url)?.let { return bridge.officeFile(it) }
                // 자산만 연다. 그 밖(인터넷·PC 주소·content://·file://)은 모두 막는다
                if (url.scheme == "https" && url.host == ASSET_HOST) return loader.shouldInterceptRequest(url) ?: blocked()
                return blocked()
            }

            // 화면 밖으로 나가는 탐색은 막는다 (자산 안 이동만 허용)
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                !(request.url.scheme == "https" && request.url.host == ASSET_HOST && request.url.path?.startsWith("/app/") == true)
        }
        webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                chooseFiles(callback, params.acceptTypes.filter { it.isNotBlank() })
                return true
            }

            // 화면의 confirm·alert·prompt를 네이티브 창으로 (없으면 confirm이 늘 false라 QR 다시 만들기 등이 막힌다)
            override fun onJsAlert(view: WebView, url: String, message: String, result: JsResult): Boolean {
                AlertDialog.Builder(activity).setMessage(message).setCancelable(false)
                    .setPositiveButton(S.get(R.string.btn_ok)) { _, _ -> result.confirm() }.show()
                return true
            }

            override fun onJsConfirm(view: WebView, url: String, message: String, result: JsResult): Boolean {
                AlertDialog.Builder(activity).setMessage(message)
                    .setPositiveButton(S.get(R.string.btn_ok)) { _, _ -> result.confirm() }
                    .setNegativeButton(S.get(R.string.btn_cancel)) { _, _ -> result.cancel() }
                    .setOnCancelListener { result.cancel() }.show()
                return true
            }

            override fun onJsPrompt(view: WebView, url: String, message: String, defaultValue: String?, result: JsPromptResult): Boolean {
                val input = EditText(activity).apply { setText(defaultValue.orEmpty()) }
                AlertDialog.Builder(activity).setMessage(message).setView(input)
                    .setPositiveButton(S.get(R.string.btn_ok)) { _, _ -> result.confirm(input.text.toString()) }
                    .setNegativeButton(S.get(R.string.btn_cancel)) { _, _ -> result.cancel() }
                    .setOnCancelListener { result.cancel() }.show()
                return true
            }

            // 화면 콘솔은 디버그 빌드에서만 logcat으로 (릴리스는 화면 글이 기기 기록에 남지 않게)
            override fun onConsoleMessage(message: android.webkit.ConsoleMessage): Boolean {
                if (BuildConfig.DEBUG) android.util.Log.d("OfficeWeb", "${message.messageLevel()} ${message.message()} (${message.sourceId()}:${message.lineNumber()})")
                return true
            }

            // 카메라·마이크·위치는 화면에 주지 않는다
            override fun onPermissionRequest(request: PermissionRequest) = request.deny()
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) =
                callback.invoke(origin, false, false)
        }

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(this, "OfficeBridge", setOf(ASSET_ORIGIN)) { _, message, origin, isMainFrame, reply ->
                // 자산 출처의 최상위 프레임만 (iframe·다른 출처는 무시)
                if (isMainFrame && origin.toString() == ASSET_ORIGIN) bridge.receive(message.data ?: "", reply)
            }
            // 크기가 정해진 뒤에 연다: 높이 0일 때 열면 vh(100vh·h-screen)가 0으로 굳어 화면이 접힌다
            addOnLayoutChangeListener(object : android.view.View.OnLayoutChangeListener {
                override fun onLayoutChange(v: android.view.View, l: Int, t: Int, r: Int, b: Int, ol: Int, ot: Int, or: Int, ob: Int) {
                    if (b - t <= 0 || r - l <= 0) return
                    v.removeOnLayoutChangeListener(this)
                    loadUrl(entry.url)
                }
            })
        } else {
            loadDataWithBaseURL(null, "<p style='font-family:sans-serif;padding:24px'>" + S.get(R.string.webview_old) + "</p>", "text/html", "utf-8", null)
        }
    }
}

/** 화면 메시지 처리: v2 호출·첨부·저장과 이벤트 전달 */
private class Bridge(
    private val activity: Activity,
    private val repo: OfficeRepository,
    private val scope: CoroutineScope,
) : EventSink {
    private val main = Handler(Looper.getMainLooper())
    private var reply: JavaScriptReplyProxy? = null
    private var isReady = false
    private var isForeground = true
    private var pendingBack: CompletableDeferred<Boolean>? = null
    /** 화면이 키보드 높이를 직접 처리하는지 (ready의 features "ime") — 바뀌면 셸 패딩이 다시 그려진다 */
    var isImeByScreen by androidx.compose.runtime.mutableStateOf(false)
        private set
    private var lastIme = -1
    /** 같은 요청 id를 다시 보내면 같은 Idempotency-Key — PC가 한 번만 처리한다 */
    private val session = UUID.randomUUID().toString()
    var isTablet = false

    /** 화면이 ready로 알린 능력 (SCREEN_CAPABILITIES 안에서만) — /v2/call·/v2/events 헤더로 PC에 알린다 */
    @Volatile private var screenCapabilities: Set<String> = emptySet()

    private val stream = EventStream(repo::currentClient, this, scope, capabilities = { screenCapabilities })
    private val reporter = GraceReporter(scope) { state, reason -> post(BridgeOut.connection(state, reason)) }

    init {
        // 네트워크가 바뀌면 (와이파이↔LTE) 옛 소켓을 버리고 바로 다시 붙는다
        scope.launch { repo.networkAvailable.collect { stream.reconnectNow() } }
    }

    fun receive(text: String, proxy: JavaScriptReplyProxy) {
        reply = proxy
        when (val r = parseBridge(text)) {
            is BridgeRequest.Ready -> {
                isReady = true
                isImeByScreen = "ime" in r.features
                val caps = capabilitiesOf(r.features)
                // 화면을 다시 읽어 능력이 바뀌었으면 이벤트 스트림도 새 헤더로 다시 붙는다 (연결 단위로 판정)
                val isChanged = caps != screenCapabilities
                screenCapabilities = caps
                post(BridgeOut.hello(BuildConfig.VERSION_NAME, isTablet))
                reporter.reset()
                if (isForeground) {
                    if (isChanged && stream.isRunning) stream.stop()
                    // 이미 붙어 있으면 다시 붙어서 새 화면이 hello·snapshot·open을 받게 한다
                    if (stream.isRunning) stream.reconnectNow() else stream.start()
                }
            }
            is BridgeRequest.Call -> scope.launch {
                val key = UUID.nameUUIDFromBytes("$session:${r.id}".toByteArray()).toString()
                post(
                    when (val res = repo.v2Call(r.method, r.args, r.confirm, key, screenCapabilities)) {
                        is ApiResult.Ok -> BridgeOut.ok(r.id, res.value)
                        is ApiResult.Fail -> BridgeOut.fail(r.id, res.error)
                    },
                )
            }
            is BridgeRequest.Upload -> scope.launch {
                val bytes = withContext(Dispatchers.Default) { runCatching { Base64.decode(r.base64, Base64.DEFAULT) }.getOrNull() }
                post(
                    when {
                        bytes == null -> BridgeOut.fail(r.id, 0, "invalid_upload", S.get(R.string.bridge_file_read))
                        bytes.size > UPLOAD_MAX -> BridgeOut.fail(r.id, 413, "payload_too_large", S.get(R.string.bridge_file_too_big))
                        else -> when (val res = repo.v2Upload(r.name, r.mime, bytes)) {
                            is ApiResult.Ok -> BridgeOut.ok(r.id, res.value)
                            is ApiResult.Fail -> BridgeOut.fail(r.id, res.error)
                        }
                    },
                )
            }
            is BridgeRequest.Download -> scope.launch {
                post(
                    when (val res = repo.v2File(r.fileId)) {
                        is ApiResult.Ok -> {
                            val name = r.name.ifBlank { r.fileId }.replace(Regex("[/\\\\]"), "_").take(120)
                            val saved = withContext(Dispatchers.IO) { saveToDownloads(activity, name, res.value.mime, res.value.bytes) }
                            if (saved) Toast.makeText(activity, S.get(R.string.download_saved, name), Toast.LENGTH_SHORT).show()
                            if (saved) BridgeOut.ok(r.id, kotlinx.serialization.json.JsonPrimitive(name))
                            else BridgeOut.fail(r.id, 0, "save_failed", S.get(R.string.bridge_save_failed))
                        }
                        is ApiResult.Fail -> BridgeOut.fail(r.id, res.error)
                    },
                )
            }
            is BridgeRequest.BackResult -> pendingBack?.complete(r.handled)
            is BridgeRequest.Invalid -> r.id?.let { post(BridgeOut.fail(it, 0, "invalid_message", S.get(R.string.bridge_bad_request))) }
        }
    }

    /** 첨부 그림·파일 (office-file 주소). WebView의 별도 스레드에서 불린다 */
    fun officeFile(id: String): WebResourceResponse {
        val res = runBlocking { repo.v2File(id) }
        return if (res is ApiResult.Ok) {
            WebResourceResponse(
                res.value.mime.substringBefore(';').trim(), null, 200, "OK",
                mapOf("Cache-Control" to "private, max-age=3600", "X-Content-Type-Options" to "nosniff"),
                ByteArrayInputStream(res.value.bytes),
            )
        } else {
            WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)))
        }
    }

    suspend fun askBack(): Boolean {
        if (!isReady) return false
        val wait = CompletableDeferred<Boolean>().also { pendingBack = it }
        post(BridgeOut.back())
        return withTimeoutOrNull(400) { wait.await() } ?: false
    }

    /** 키보드 높이를 화면에 알린다: insets 메시지 + CSS 변수 --ime (화면이 둘 중 무엇을 써도 같은 값) */
    fun sendInsets(imeDp: Int, view: WebView) {
        if (!isReady || imeDp == lastIme) return
        lastIme = imeDp
        post(BridgeOut.insets(imeDp))
        main.post { view.evaluateJavascript("document.documentElement.style.setProperty('--ime','${imeDp}px')", null) }
    }

    fun onForeground() {
        isForeground = true
        // 이미 붙는 중(지연 대기)이면 깨우고, 멈춰 있었으면 새로 연다
        if (isReady) if (stream.isRunning) stream.reconnectNow() else stream.start()
    }

    fun onBackground() {
        isForeground = false
        stream.stop()
    }

    fun close() = stream.stop()

    // ── EventSink ──
    override fun onEvent(name: String, data: String) {
        BridgeOut.event(name, data)?.let(::post)
    }

    override fun onHello(resync: Boolean) {
        if (resync) post(BridgeOut.resync())
    }

    override fun onState(state: String, reason: String?) {
        reporter.report(state, reason)
        // 스트림이 다시 열렸다 = PC에 닿는다. 셸이 들고 있던 "닿지 않음"을 지운다 (화면은 connection으로 따로 안다)
        if (state == "open") main.post { repo.markReachable() }
    }

    override fun onFatal(error: com.claudeoffice.remote.net.ApiError) {
        reporter.report("closed", appCode(error))
        main.post { repo.applyV2Error(error) }
    }

    private fun post(text: String) {
        main.post { runCatching { reply?.postMessage(text) } }
    }
}

/** 휴대폰의 다운로드 폴더에 저장 (Android 10+는 권한 없이 MediaStore, 그 전은 앱 전용 다운로드 폴더) */
private fun saveToDownloads(context: Context, name: String, mime: String, bytes: ByteArray): Boolean = runCatching {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, name)
            put(MediaStore.Downloads.MIME_TYPE, mime.substringBefore(';'))
        }
        val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
        context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return false
    } else {
        val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return false
        java.io.File(dir, name).writeBytes(bytes)
    }
    true
}.getOrDefault(false)
