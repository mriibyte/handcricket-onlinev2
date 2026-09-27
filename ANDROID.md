# Android APK

The app is wrapped with Capacitor. The packaged client connects to the live
Render server configured in `build:android`.

## Local build

```bash
npm install
npm run build:android
cd android
./gradlew assembleDebug
```

The APK is written to:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

If Android SDK/Gradle is not installed locally, push the repository to GitHub
and run the **Android APK** workflow from the Actions tab. It uploads the APK
as a downloadable workflow artifact.

The Android manifest includes microphone permission for multiplayer push-to-talk.
