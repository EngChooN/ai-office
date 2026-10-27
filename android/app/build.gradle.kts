import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// 서명 키는 프로젝트 밖에 둔다. 경로는 환경 변수 CLAUDE_OFFICE_SIGNING(속성 파일)로 받고,
// 없으면 ~/.claude-office-signing/keystore.properties 를 본다. 둘 다 없으면 릴리스 APK는 서명 없이 나온다
val signingProps = Properties().apply {
    val path = System.getenv("CLAUDE_OFFICE_SIGNING")
        ?: "${System.getProperty("user.home")}/.claude-office-signing/keystore.properties"
    val f = file(path)
    if (f.isFile) f.inputStream().use { load(it) }
}

android {
    namespace = "com.claudeoffice.remote"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.claudeoffice.remote"
        minSdk = 26
        targetSdk = 34
        versionCode = 22
        versionName = "0.13.2"
    }

    signingConfigs {
        if (signingProps.getProperty("storeFile") != null) {
            create("release") {
                storeFile = file(signingProps.getProperty("storeFile"))
                // 비밀번호는 파일에 두지 않고 환경 변수로 받는다(macOS 키체인에서 꺼내 넘김, android/README.md)
                storePassword = signingProps.getProperty("storePassword") ?: System.getenv("CLAUDE_OFFICE_STORE_PASSWORD")
                keyAlias = signingProps.getProperty("keyAlias")
                keyPassword = signingProps.getProperty("keyPassword") ?: System.getenv("CLAUDE_OFFICE_STORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isDebuggable = false
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
    testOptions { unitTests.isReturnDefaultValues = true }
    // PC 화면 모바일 빌드(app/dist-mobile, 최가독)를 APK의 assets/web/ 으로 넣는다. 없으면 기존 네이티브 화면만 쓴다
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/webassets"))
}

val syncWebAssets by tasks.registering(Sync::class) {
    // 화면(dist-mobile)이 없거나 app/package.json 버전과 다르면 빌드를 멈춘다 (옛 화면이 APK에 들어가는 사고 방지)
    doFirst {
        val dist = rootProject.file("../app/dist-mobile")
        val appVersion = Regex(""""version"\s*:\s*"([^"]+)"""").find(rootProject.file("../app/package.json").readText())?.groupValues?.get(1)
        val bundled = dist.resolve("assets").listFiles { f -> f.extension == "js" }.orEmpty()
        if (appVersion == null || bundled.none { it.readText().contains(appVersion) }) {
            throw GradleException("app/dist-mobile 이 없거나 app/package.json 버전($appVersion)과 달라요. 먼저 실행하세요: (cd app && npm run build:mobile)")
        }
    }
    from(rootProject.file("../app/dist-mobile")) { exclude("**/*.map") }
    into(layout.buildDirectory.dir("generated/webassets/web"))
}
tasks.named("preBuild") { dependsOn(syncWebAssets) }

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.06.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.1")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.4")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.4")
    implementation("androidx.lifecycle:lifecycle-process:2.8.4")
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    implementation("androidx.webkit:webkit:1.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // QR: CameraX + ML Kit 바코드 (모델을 앱에 포함 — Play 서비스 없이 동작)
    implementation("androidx.camera:camera-camera2:1.3.4")
    implementation("androidx.camera:camera-lifecycle:1.3.4")
    implementation("androidx.camera:camera-view:1.3.4")
    implementation("com.google.mlkit:barcode-scanning:17.2.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    testImplementation("com.squareup.okhttp3:okhttp-tls:4.12.0")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
}
