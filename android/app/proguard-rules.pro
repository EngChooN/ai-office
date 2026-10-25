# kotlinx.serialization: 직렬화 클래스 유지 (라이브러리 규칙에 더해 앱 패키지 범위로)
-keepattributes *Annotation*, InnerClasses
-keepclassmembers class com.claudeoffice.remote.** {
    *** Companion;
}
-keepclasseswithmembers class com.claudeoffice.remote.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# 릴리스에서는 로그 호출을 지운다 (토큰·요약이 실수로 남지 않게)
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
    public static int w(...);
    public static int e(...);
}

-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
