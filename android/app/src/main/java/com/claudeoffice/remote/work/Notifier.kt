// 로컬 알림 채널 "결정 대기". 잠금 화면에는 앱 이름만 보이게 VISIBILITY_PRIVATE

package com.claudeoffice.remote.work

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.claudeoffice.remote.MainActivity
import com.claudeoffice.remote.R
import com.claudeoffice.remote.store.PcBooks
import com.claudeoffice.remote.store.PcEntry

object Notifier {
    private const val CHANNEL = "decisions"
    // 알림 번호는 PC마다 따로 (결재 100+칸, 연결 문제 200+칸) — 한 PC 알림이 다른 PC 알림을 덮어쓰지 않는다
    // 옛 버전의 고정 번호(1·2)는 업데이트 때 한 번 지운다
    private const val LEGACY_ID_DECISIONS = 1
    private const val LEGACY_ID_CONNECTION = 2
    const val EXTRA_OPEN = "open"
    const val EXTRA_PC = "pc"
    const val OPEN_DECISIONS = "decisions"
    const val OPEN_STATE = "state"

    fun createChannel(context: Context) {
        val channel = NotificationChannel(
            CHANNEL,
            context.getString(R.string.channel_decisions),
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = context.getString(R.string.channel_decisions_desc)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    fun canNotify(context: Context) =
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun showDecisions(context: Context, notice: Notice, pc: PcEntry) =
        show(context, PcBooks.decisionNoticeId(pc.slot), notice, OPEN_DECISIONS, pc.id)

    fun showConnection(context: Context, notice: Notice, pc: PcEntry) =
        show(context, PcBooks.connectionNoticeId(pc.slot), notice, OPEN_STATE, pc.id)

    /** 이 PC의 알림만 지운다 (연결 끊기) */
    fun cancelFor(context: Context, slot: Int) {
        val nm = NotificationManagerCompat.from(context)
        nm.cancel(PcBooks.decisionNoticeId(slot))
        nm.cancel(PcBooks.connectionNoticeId(slot))
    }

    fun cancelLegacy(context: Context) {
        val nm = NotificationManagerCompat.from(context)
        nm.cancel(LEGACY_ID_DECISIONS)
        nm.cancel(LEGACY_ID_CONNECTION)
    }

    private fun show(context: Context, id: Int, notice: Notice, open: String, pcId: String) {
        if (!canNotify(context)) return
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(EXTRA_OPEN, open)
            .putExtra(EXTRA_PC, pcId)
        val pending = PendingIntent.getActivity(context, id, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        // 잠금 화면용: 앱 이름만 (제목·본문 없음). 원본은 VISIBILITY_PRIVATE라 잠금 화면에서는 이것으로 바뀐다
        val publicVersion = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(context.getString(R.string.app_name))
            .build()
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(notice.title)
            .setContentText(notice.body)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(id, n)
        } catch (_: SecurityException) {
        }
    }
}
