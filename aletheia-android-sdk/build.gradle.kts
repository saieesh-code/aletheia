plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android") version "1.9.23"
    id("org.jetbrains.kotlin.plugin.serialization") version "1.9.23"
    id("maven-publish")
}

android {
    namespace   = "io.aletheia.sdk"
    compileSdk  = 34
    defaultConfig {
        minSdk          = 26   // Android 8 — required for StrongBox availability checks
        targetSdk       = 34
        versionCode     = 2
        versionName     = "2.0.0"
        consumerProguardFiles("consumer-rules.pro")
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    // Kotlin
    implementation("org.jetbrains.kotlin:kotlin-stdlib:1.9.23")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    // Android
    implementation("androidx.annotation:annotation:1.7.1")

    // Play Integrity (device attestation)
    implementation("com.google.android.play:integrity:1.3.0")

    // HTTP client (Aletheia server communication)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Logging (exclude from release via ProGuard if desired)
    implementation("org.slf4j:slf4j-android:1.7.36")
}
