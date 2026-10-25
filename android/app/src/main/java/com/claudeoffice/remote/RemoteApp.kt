package com.claudeoffice.remote

import android.app.Application
import android.content.Context
import android.content.res.Configuration
import com.claudeoffice.remote.data.OfficeRepository
import com.claudeoffice.remote.work.Notifier

class RemoteApp : Application() {
    lateinit var repository: OfficeRepository
        private set

    override fun attachBaseContext(base: Context) {
        super.attachBaseContext(Lang.wrap(base))
    }

    override fun onCreate() {
        super.onCreate()
        S.install(this)
        Notifier.createChannel(this)
        repository = OfficeRepository(this)
        com.claudeoffice.remote.update.UpdateManager.start(this)
    }

    // 기기 언어가 바뀌면 "자동"일 때 따라간다
    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        S.install(this)
    }
}
