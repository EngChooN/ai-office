// 주소(IP)+연결 코드로 연결하는 화면 (설계서 8절). QR을 못 찍을 때(카메라 없음·원격)의 대안

package com.claudeoffice.remote.ui

import com.claudeoffice.remote.R
import com.claudeoffice.remote.S

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.claudeoffice.remote.net.DEFAULT_PORT
import com.claudeoffice.remote.net.PairError
import com.claudeoffice.remote.net.PairFailure
import com.claudeoffice.remote.net.QrPayload
import com.claudeoffice.remote.net.RecordingTransport
import com.claudeoffice.remote.net.checkPairInput
import com.claudeoffice.remote.net.pairWithHost
import com.claudeoffice.remote.net.toPayload
import com.claudeoffice.remote.ui.theme.Office
import com.claudeoffice.remote.ui.theme.Radius
import com.claudeoffice.remote.ui.theme.Space
import com.claudeoffice.remote.ui.theme.Type
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** 한 번 교환해 QR과 같은 QrPayload를 만든다. 실패하면 PairFailure */
suspend fun pairByAddress(host: String, port: Int, code: String, clientName: String): QrPayload {
    val h = host.trim().lowercase()
    checkPairInput(h, port, code)
    val r = withContext(Dispatchers.IO) { pairWithHost(RecordingTransport(h, port), code, clientName) }
    return r.toPayload(h, port)
}

@Composable
fun ManualConnectScreen(onPayload: (QrPayload) -> Unit, onClose: () -> Unit) {
    val c = Office.colors
    val scope = rememberCoroutineScope()
    var host by rememberSaveable { mutableStateOf("") }
    var code by rememberSaveable { mutableStateOf("") }
    var port by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun message(e: PairFailure) = when (e.error) {
        PairError.BAD_HOST -> S.get(R.string.manual_err_host)
        PairError.BAD_PORT -> S.get(R.string.manual_err_port)
        PairError.BAD_CODE -> S.get(R.string.manual_err_code)
        PairError.UNREACHABLE -> S.get(R.string.manual_err_unreachable)
        PairError.CLOSED -> S.get(R.string.manual_err_closed)
        PairError.SPKI_MISMATCH -> S.get(R.string.manual_err_mismatch)
        PairError.SERVER_PROOF_MISMATCH -> S.get(R.string.manual_err_server_proof)
        PairError.WRONG_CODE -> e.remaining?.let { S.get(R.string.manual_err_wrong, it) } ?: S.get(R.string.manual_err_wrong_plain)
        PairError.FULL -> S.get(R.string.manual_err_full)
        PairError.FAILED -> S.get(R.string.manual_err_failed)
    }

    val colors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = c.primary, unfocusedBorderColor = c.outlineInput,
        focusedContainerColor = c.surface, unfocusedContainerColor = c.surface, disabledContainerColor = c.surface,
    )

    Column(
        Modifier.fillMaxSize().background(c.background).verticalScroll(rememberScrollState()).padding(horizontal = Space.s5),
        verticalArrangement = Arrangement.spacedBy(Space.s3),
    ) {
        Spacer(Modifier.height(Space.s5))
        Text(S.get(R.string.manual_title), style = Type.titleLarge, color = c.onSurface)
        MutedText(S.get(R.string.manual_intro))
        OutlinedTextField(
            value = host, onValueChange = { host = it.take(255); error = null }, enabled = !busy, singleLine = true,
            label = { Text(S.get(R.string.manual_host_label)) },
            placeholder = { Text(S.get(R.string.manual_host_hint)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxWidth(), textStyle = Type.bodyLarge, shape = Radius.lg, colors = colors,
        )
        OutlinedTextField(
            value = code, onValueChange = { code = it.filter { ch -> ch.isLetterOrDigit() || ch == '-' || ch == ' ' }.take(20); error = null }, enabled = !busy, singleLine = true,
            label = { Text(S.get(R.string.manual_code_label)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, capitalization = KeyboardCapitalization.Characters),
            modifier = Modifier.fillMaxWidth(), textStyle = Type.bodyLarge, shape = Radius.lg, colors = colors,
        )
        OutlinedTextField(
            value = port, onValueChange = { port = it.filter(Char::isDigit).take(5); error = null }, enabled = !busy, singleLine = true,
            label = { Text(S.get(R.string.manual_port_label)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            modifier = Modifier.fillMaxWidth(), textStyle = Type.bodyLarge, shape = Radius.lg, colors = colors,
        )
        error?.let { Text(it, style = Type.bodyLarge, color = c.statusError) }
        PrimaryButton(
            if (busy) S.get(R.string.manual_checking) else S.get(R.string.manual_connect),
            {
                busy = true
                error = null
                scope.launch {
                    try {
                        val p = pairByAddress(host, port.toIntOrNull() ?: if (port.isBlank()) DEFAULT_PORT else 0, code, android.os.Build.MODEL ?: "phone")
                        onPayload(p)
                    } catch (e: PairFailure) {
                        error = message(e)
                    } finally {
                        busy = false
                    }
                }
            },
            Modifier.fillMaxWidth(),
            enabled = !busy && host.isNotBlank() && code.length == 6,
        )
        PlainTextButton(S.get(R.string.btn_go_back), onClose, Modifier.fillMaxWidth(), enabled = !busy)
        Spacer(Modifier.height(Space.s5))
    }
}
