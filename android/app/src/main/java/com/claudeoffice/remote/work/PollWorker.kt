// 백그라운드 조회: 15분마다(최소 간격, 절전 중이면 수십 분 늦을 수 있음) 대기 결정을 읽고 새 결정이 있으면 알린다

package com.claudeoffice.remote.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.claudeoffice.remote.RemoteApp
import java.util.concurrent.TimeUnit

class PollWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        (applicationContext as RemoteApp).repository.backgroundPoll()
        // 실패해도 다음 주기에 다시 본다 (WorkManager 재시도로 요청을 늘리지 않는다)
        return Result.success()
    }

    companion object {
        private const val NAME = "poll-decisions"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<PollWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(NAME)
        }
    }
}
