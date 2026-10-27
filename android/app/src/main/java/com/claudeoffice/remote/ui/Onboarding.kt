// 첫 연결 (디자인 3-2): 시작 → QR 스캔 → 연결 중 → 연결 성공 + 알림 지연 안내

package com.claudeoffice.remote.ui

import com.claudeoffice.remote.R
import com.claudeoffice.remote.S

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.claudeoffice.remote.net.QrParse
import com.claudeoffice.remote.net.QrPayload
import com.claudeoffice.remote.net.parseQr
import com.claudeoffice.remote.ui.theme.Office
import com.claudeoffice.remote.ui.theme.Radius
import com.claudeoffice.remote.ui.theme.Space
import com.claudeoffice.remote.ui.theme.Type
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

@Composable
fun StartScreen(onScan: () -> Unit) {
    val c = Office.colors
    Column(
        Modifier.fillMaxSize().background(c.background).verticalScroll(rememberScrollState()).padding(horizontal = Space.s5),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(120.dp))
        Box(Modifier.size(72.dp).background(c.primary, RoundedCornerShape(18.dp)), contentAlignment = Alignment.Center) {
            Text("CO", style = Type.titleLarge, color = c.onPrimary)
        }
        Spacer(Modifier.height(Space.s5))
        Text(S.get(R.string.onb_title), style = Type.titleLarge, color = c.onSurface)
        Spacer(Modifier.height(Space.s4))
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Space.s2)) {
            Text(S.get(R.string.onb_step1), style = Type.bodyLarge, color = c.onSurfaceMuted)
            Text(S.get(R.string.onb_step2), style = Type.bodyLarge, color = c.onSurfaceMuted)
        }
        Spacer(Modifier.height(Space.s5))
        PrimaryButton(S.get(R.string.btn_scan_qr), onScan, Modifier.fillMaxWidth())
        Spacer(Modifier.height(Space.s3))
        MutedText(S.get(R.string.onb_camera_note))
    }
}

/** QR 스캔. 우리 형식이면 onPayload, v가 앱보다 크면 onNeedsUpdate */
@Composable
fun ScannerScreen(onPayload: (QrPayload) -> Unit, onNeedsUpdate: () -> Unit, onClose: () -> Unit) {
    val context = LocalContext.current
    var hasPermission by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED)
    }
    var asked by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        hasPermission = it
        asked = true
    }
    LaunchedEffect(Unit) { if (!hasPermission) launcher.launch(Manifest.permission.CAMERA) }

    if (!hasPermission) {
        if (asked) {
            StateScreen(
                icon = Icons.Outlined.PhotoCamera,
                iconColor = Office.colors.statusIdle,
                title = S.get(R.string.cam_perm_title),
                body = S.get(R.string.cam_perm_body),
            ) {
                PrimaryButton(S.get(R.string.btn_allow_in_settings), {
                    context.startActivity(
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    )
                }, Modifier.fillMaxWidth())
                PlainTextButton(S.get(R.string.btn_go_back), onClose, Modifier.fillMaxWidth())
            }
        } else {
            Box(Modifier.fillMaxSize().background(Color.Black))
        }
        return
    }

    var notOurs by remember { mutableStateOf(false) }
    val done = remember { AtomicBoolean(false) }

    var camera by remember { mutableStateOf<androidx.camera.core.Camera?>(null) }
    var zoomed by remember { mutableStateOf(false) }
    val handle: (String) -> Unit = { raw ->
        if (!done.get()) when (val r = parseQr(raw)) {
            is QrParse.Ok -> if (done.compareAndSet(false, true)) onPayload(r.payload)
            QrParse.NeedsAppUpdate -> if (done.compareAndSet(false, true)) onNeedsUpdate()
            QrParse.NotOurs -> notOurs = true
        }
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scanImage(context, uri) { text ->
            ContextCompat.getMainExecutor(context).execute { if (text != null) handle(text) else notOurs = true }
        }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        CameraPreview(onCamera = { camera = it }, onText = handle)
        Box(Modifier.align(Alignment.Center).size(220.dp).border(3.dp, Color.White, Radius.xl))
        Row(Modifier.fillMaxWidth().height(56.dp).padding(horizontal = Space.s1), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onClose, modifier = Modifier.size(48.dp)) {
                Icon(Icons.Filled.Close, contentDescription = S.get(R.string.cd_close), tint = Color.White)
            }
            Text(S.get(R.string.btn_scan_qr), style = Type.titleMedium, color = Color.White, modifier = Modifier.weight(1f), textAlign = TextAlign.Center)
            Spacer(Modifier.width(48.dp))
        }
        Column(Modifier.align(Alignment.BottomCenter).padding(bottom = 48.dp, start = Space.s5, end = Space.s5), horizontalAlignment = Alignment.CenterHorizontally) {
            if (notOurs) {
                Text(S.get(R.string.qr_not_ours), style = Type.bodyLarge, color = Office.colors.statusError)
                Spacer(Modifier.height(Space.s2))
            }
            Text(S.get(R.string.qr_aim), style = Type.bodySmall, color = Color(0xFFBBBBBB), textAlign = TextAlign.Center)
            Spacer(Modifier.height(Space.s2))
            Row(horizontalArrangement = Arrangement.spacedBy(Space.s2)) {
                PlainTextButton(S.get(if (zoomed) R.string.qr_zoom_1x else R.string.qr_zoom_2x), {
                    camera?.let { c ->
                        val max = c.cameraInfo.zoomState.value?.maxZoomRatio ?: 1f
                        zoomed = !zoomed
                        c.cameraControl.setZoomRatio(if (zoomed) minOf(2f, max) else 1f)
                    }
                })
                PlainTextButton(S.get(R.string.qr_from_gallery), { picker.launch("image/*") })
                PlainTextButton(S.get(R.string.qr_paste), {
                    val cm = context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                    val t = cm.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(context)?.toString()
                    if (t.isNullOrBlank()) notOurs = true else handle(t)
                })
            }
        }
    }
}

@androidx.annotation.OptIn(androidx.camera.core.ExperimentalGetImage::class)
@Composable
private fun CameraPreview(onCamera: (androidx.camera.core.Camera) -> Unit, onText: (String) -> Unit) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val executor = remember { Executors.newSingleThreadExecutor() }
    val scanner = remember {
        BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build())
    }
    DisposableEffect(Unit) {
        onDispose {
            scanner.close()
            executor.shutdown()
        }
    }
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { ctx ->
            val view = PreviewView(ctx)
            val future = ProcessCameraProvider.getInstance(ctx)
            future.addListener({
                val provider = future.get()
                val preview = Preview.Builder().build().also { it.setSurfaceProvider(view.surfaceProvider) }
                // 분석은 1280x720 이상으로 (작게 보이는 QR 대비)
                val selector = androidx.camera.core.resolutionselector.ResolutionSelector.Builder()
                    .setResolutionStrategy(
                        androidx.camera.core.resolutionselector.ResolutionStrategy(
                            android.util.Size(1280, 720),
                            androidx.camera.core.resolutionselector.ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER,
                        ),
                    ).build()
                val analysis = ImageAnalysis.Builder()
                    .setResolutionSelector(selector)
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
                analysis.setAnalyzer(executor) { proxy ->
                    val media = proxy.image
                    if (media == null) {
                        proxy.close()
                        return@setAnalyzer
                    }
                    scanner.process(InputImage.fromMediaImage(media, proxy.imageInfo.rotationDegrees))
                        .addOnSuccessListener { codes ->
                            codes.firstNotNullOfOrNull { it.rawValue }?.let { text ->
                                ContextCompat.getMainExecutor(context).execute { onText(text) }
                            }
                        }
                        .addOnCompleteListener { proxy.close() }
                }
                // 후면 → 전면 → 아무 카메라. 태블릿은 후면이 없거나 외부 카메라만 있을 수 있다
                val camSelector = listOf(CameraSelector.DEFAULT_BACK_CAMERA, CameraSelector.DEFAULT_FRONT_CAMERA)
                    .firstOrNull { runCatching { provider.hasCamera(it) }.getOrDefault(false) }
                    ?: CameraSelector.Builder().build()
                try {
                    provider.unbindAll()
                    val camera = provider.bindToLifecycle(owner, camSelector, preview, analysis)
                    onCamera(camera)
                    // 연속 자동초점·노출 (화면 가운데)
                    val center = view.meteringPointFactory.createPoint(view.width / 2f, view.height / 2f)
                    camera.cameraControl.startFocusAndMetering(
                        androidx.camera.core.FocusMeteringAction.Builder(center).disableAutoCancel().build(),
                    )
                    // 탭 → 그 지점 초점, 핀치 → 확대
                    val pinch = android.view.ScaleGestureDetector(ctx, object : android.view.ScaleGestureDetector.SimpleOnScaleGestureListener() {
                        override fun onScale(d: android.view.ScaleGestureDetector): Boolean {
                            val z = camera.cameraInfo.zoomState.value ?: return true
                            camera.cameraControl.setZoomRatio((z.zoomRatio * d.scaleFactor).coerceIn(z.minZoomRatio, z.maxZoomRatio))
                            return true
                        }
                    })
                    view.setOnTouchListener { v, ev ->
                        pinch.onTouchEvent(ev)
                        if (ev.action == android.view.MotionEvent.ACTION_UP && !pinch.isInProgress && ev.pointerCount == 1) {
                            val pt = view.meteringPointFactory.createPoint(ev.x, ev.y)
                            camera.cameraControl.startFocusAndMetering(androidx.camera.core.FocusMeteringAction.Builder(pt).build())
                            v.performClick()
                        }
                        true
                    }
                    // 화면 회전(가로/세로)에 맞춰 분석 방향 갱신
                    view.addOnLayoutChangeListener { v, _, _, _, _, _, _, _, _ ->
                        v.display?.rotation?.let { analysis.targetRotation = it }
                    }
                } catch (_: Exception) {
                }
            }, ContextCompat.getMainExecutor(ctx))
            view
        },
    )
}

/** 갤러리 사진 속 QR 읽기 */
private fun scanImage(context: android.content.Context, uri: Uri, onText: (String?) -> Unit) {
    val client = BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build())
    val image = runCatching { InputImage.fromFilePath(context, uri) }.getOrNull()
    if (image == null) {
        onText(null)
        client.close()
        return
    }
    client.process(image)
        .addOnSuccessListener { codes -> onText(codes.firstNotNullOfOrNull { it.rawValue }) }
        .addOnFailureListener { onText(null) }
        .addOnCompleteListener { client.close() }
}

@Composable
fun ConnectingScreen(address: String) {
    val c = Office.colors
    Column(Modifier.fillMaxSize().background(c.background), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        CircularProgressIndicator(color = c.primary)
        Spacer(Modifier.height(Space.s5))
        Text(S.get(R.string.connecting_pc), style = Type.titleMedium, color = c.onSurface)
        Spacer(Modifier.height(Space.s2))
        MutedText(address)
    }
}

@Composable
fun ConnectedScreen(address: String, onDone: () -> Unit) {
    val c = Office.colors
    val context = LocalContext.current
    val notifLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= 33) notifLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
    var exempt by remember { mutableStateOf(isBatteryExempt(context)) }
    ResumeEffect { exempt = isBatteryExempt(context) }

    Column(
        Modifier.fillMaxSize().background(c.background).verticalScroll(rememberScrollState()).padding(horizontal = Space.s5),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(96.dp))
        Box(
            Modifier.size(56.dp).background(c.statusWorking.copy(alpha = 0.15f), CircleShape).border(1.dp, c.statusWorking.copy(alpha = 0.4f), CircleShape),
            contentAlignment = Alignment.Center,
        ) { Icon(Icons.Filled.Check, contentDescription = null, tint = c.statusWorking) }
        Spacer(Modifier.height(Space.s5))
        Text(S.get(R.string.onb_done_title), style = Type.titleLarge, color = c.onSurface)
        Spacer(Modifier.height(Space.s2))
        MutedText(address)
        Spacer(Modifier.height(Space.s5))
        DelayNoticeCard()
        Spacer(Modifier.height(Space.s4))
        if (exempt) {
            Text(S.get(R.string.onb_battery_ok), style = Type.bodyLarge, color = c.statusWorking)
            Spacer(Modifier.height(Space.s3))
            PrimaryButton(S.get(R.string.btn_start), onDone, Modifier.fillMaxWidth())
        } else {
            PrimaryButton(S.get(R.string.btn_open_battery), { openBatterySettings(context) }, Modifier.fillMaxWidth())
            PlainTextButton(S.get(R.string.btn_later), onDone, Modifier.fillMaxWidth())
        }
        Spacer(Modifier.height(Space.s5))
    }
}
