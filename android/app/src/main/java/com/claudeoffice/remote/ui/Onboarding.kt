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

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        CameraPreview { raw ->
            if (done.get()) return@CameraPreview
            when (val r = parseQr(raw)) {
                is QrParse.Ok -> if (done.compareAndSet(false, true)) onPayload(r.payload)
                QrParse.NeedsAppUpdate -> if (done.compareAndSet(false, true)) onNeedsUpdate()
                QrParse.NotOurs -> notOurs = true
            }
        }
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
        }
    }
}

@androidx.annotation.OptIn(androidx.camera.core.ExperimentalGetImage::class)
@Composable
private fun CameraPreview(onText: (String) -> Unit) {
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
                val analysis = ImageAnalysis.Builder().setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST).build()
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
                try {
                    provider.unbindAll()
                    provider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                } catch (_: Exception) {
                    // 뒤 카메라가 없는 기기
                    runCatching { provider.bindToLifecycle(owner, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analysis) }
                }
            }, ContextCompat.getMainExecutor(ctx))
            view
        },
    )
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
