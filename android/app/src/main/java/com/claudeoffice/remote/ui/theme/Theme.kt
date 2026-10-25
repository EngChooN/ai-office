// 모바일 토큰표 (docs/specs/android-design.md 1절). 다크 값은 데스크톱 index.css를 옮긴 값, 라이트는 새로 정한 값
// 시스템 설정(다크/라이트)을 따르고, 배경화면 색(dynamic color)은 쓰지 않는다

package com.claudeoffice.remote.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Immutable
data class OfficeColors(
    val background: Color,
    val surface: Color,
    val surfaceMuted: Color,
    val surfaceSelected: Color,
    val outline: Color,
    val outlineInput: Color,
    val onSurface: Color,
    val onSurfaceMuted: Color,
    val primary: Color,
    val onPrimary: Color,
    val statusWorking: Color,
    val statusWaiting: Color,
    val statusWaitingFill: Color,
    val onStatusWaitingFill: Color,
    val statusIdle: Color,
    val statusError: Color,
)

val DarkTokens = OfficeColors(
    background = Color(0xFF0D1014),
    surface = Color(0xFF15181E),
    surfaceMuted = Color(0xFF1E2228),
    surfaceSelected = Color(0xFF262C35),
    outline = Color(0xFF292E36),
    outlineInput = Color(0xFF2E333B),
    onSurface = Color(0xFFF2F2F2),
    onSurfaceMuted = Color(0xFF999FA8),
    primary = Color(0xFFF0834E),
    onPrimary = Color(0xFF190F0A),
    statusWorking = Color(0xFF3FC168),
    statusWaiting = Color(0xFFEDB417),
    statusWaitingFill = Color(0xFFEDB417),
    onStatusWaitingFill = Color(0xFF000000),
    statusIdle = Color(0xFF88909C),
    statusError = Color(0xFFF14445),
)

val LightTokens = OfficeColors(
    background = Color(0xFFF9FAFB),
    surface = Color(0xFFFFFFFF),
    surfaceMuted = Color(0xFFEEF0F4),
    surfaceSelected = Color(0xFFE2E8F1),
    outline = Color(0xFFD7DBE1),
    outlineInput = Color(0xFFCCD1D9),
    onSurface = Color(0xFF13161C),
    onSurfaceMuted = Color(0xFF565B63),
    primary = Color(0xFFBB4F0C),
    onPrimary = Color(0xFFFFFFFF),
    statusWorking = Color(0xFF0A7E3A),
    statusWaiting = Color(0xFF9A6000),
    statusWaitingFill = Color(0xFFEDB417),
    onStatusWaitingFill = Color(0xFF000000),
    statusIdle = Color(0xFF626975),
    statusError = Color(0xFFCC272E),
)

/** 간격 (dp) */
object Space {
    val s1 = 4.dp
    val s2 = 8.dp
    val s3 = 12.dp
    val s4 = 16.dp
    val s5 = 24.dp
    val s6 = 32.dp
}

/** 모서리 반경 (dp) — 데스크톱 --radius 10px 그대로 */
object Radius {
    val sm = RoundedCornerShape(6.dp)
    val md = RoundedCornerShape(8.dp)
    val lg = RoundedCornerShape(10.dp)
    val xl = RoundedCornerShape(14.dp)
    val sheet = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp)
}

/** 글자 (sp) */
object Type {
    val display = TextStyle(fontSize = 40.sp, lineHeight = 48.sp, fontWeight = FontWeight.SemiBold, fontFeatureSettings = "tnum")
    val numeral = TextStyle(fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.SemiBold, fontFeatureSettings = "tnum")
    val titleLarge = TextStyle(fontSize = 20.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold)
    val titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold)
    val bodyLarge = TextStyle(fontSize = 15.sp, lineHeight = 22.sp, fontWeight = FontWeight.Normal)
    val button = bodyLarge.copy(fontWeight = FontWeight.SemiBold)
    val bodySmall = TextStyle(fontSize = 13.sp, lineHeight = 19.sp, fontWeight = FontWeight.Normal)
    val label = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium)
    val labelTiny = TextStyle(fontSize = 11.sp, lineHeight = 14.sp, fontWeight = FontWeight.Medium)
}

val LocalOfficeColors = staticCompositionLocalOf { DarkTokens }

object Office {
    val colors: OfficeColors
        @Composable get() = LocalOfficeColors.current
}

@Composable
fun OfficeTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val t = if (dark) DarkTokens else LightTokens
    val scheme = if (dark) {
        darkColorScheme(
            primary = t.primary, onPrimary = t.onPrimary,
            background = t.background, onBackground = t.onSurface,
            surface = t.surface, onSurface = t.onSurface,
            surfaceVariant = t.surfaceMuted, onSurfaceVariant = t.onSurfaceMuted,
            surfaceContainer = t.surface, surfaceContainerHigh = t.surfaceMuted, surfaceContainerHighest = t.surfaceSelected,
            outline = t.outline, outlineVariant = t.outline,
            error = t.statusError, onError = Color.White,
            inverseSurface = t.onSurface, inverseOnSurface = t.background,
        )
    } else {
        lightColorScheme(
            primary = t.primary, onPrimary = t.onPrimary,
            background = t.background, onBackground = t.onSurface,
            surface = t.surface, onSurface = t.onSurface,
            surfaceVariant = t.surfaceMuted, onSurfaceVariant = t.onSurfaceMuted,
            surfaceContainer = t.surface, surfaceContainerHigh = t.surfaceMuted, surfaceContainerHighest = t.surfaceSelected,
            outline = t.outline, outlineVariant = t.outline,
            error = t.statusError, onError = Color.White,
            inverseSurface = t.onSurface, inverseOnSurface = t.background,
        )
    }
    val typography = Typography(
        titleLarge = Type.titleLarge,
        titleMedium = Type.titleMedium,
        bodyLarge = Type.bodyLarge,
        bodyMedium = Type.bodyLarge,
        bodySmall = Type.bodySmall,
        labelLarge = Type.button,
        labelMedium = Type.label,
        labelSmall = Type.labelTiny,
    )
    CompositionLocalProvider(LocalOfficeColors provides t) {
        MaterialTheme(
            colorScheme = scheme,
            typography = typography,
            shapes = Shapes(small = Radius.md, medium = Radius.lg, large = Radius.xl),
            content = content,
        )
    }
}
