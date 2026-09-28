// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

const rawBundleId = "com.app.moudienetplay";
const bundleId = rawBundleId
  .replace(/[-_]/g, ".")
  .replace(/[^a-zA-Z0-9.]/g, "")
  .replace(/\.+/g, ".")
  .replace(/^\.+|\.+$/g, "")
  .toLowerCase()
  .split(".")
  .map((segment) => (/^[a-zA-Z]/.test(segment) ? segment : "x" + segment))
  .join(".") || "com.classicera.netplay";
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `classicera${timestamp}`;

const env = {
  appName: "Classic Era by Moudie",
  appSlug: "moudie-netplay",
  logoUrl: "./assets/images/classic-era-new-icon.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: "1.0.1",
  orientation: "default",
  icon: "./assets/images/classic-era-new-icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: false,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    versionCode: 2,
    adaptiveIcon: {
      backgroundColor: "#101827",
      foregroundImage: "./assets/images/classic-era-new-icon.png",
      backgroundImage: "./assets/images/classic-era-new-icon.png",
      monochromeImage: "./assets/images/classic-era-new-icon.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: [
      "POST_NOTIFICATIONS",
      "RECORD_AUDIO",
      "MODIFY_AUDIO_SETTINGS",
      "ACCESS_NETWORK_STATE",
      "CHANGE_NETWORK_STATE",
      "BLUETOOTH",
      "BLUETOOTH_ADMIN",
      "BLUETOOTH_CONNECT",
    ],
    intentFilters: [{
      action: "VIEW",
      autoVerify: true,
      data: [{ scheme: env.scheme, host: "*" }],
      category: ["BROWSABLE", "DEFAULT"],
    }],
  },
  web: {
    bundler: "metro",
    output: "single",
    favicon: "./assets/images/classic-era-new-icon.png",
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-web-browser",
    "expo-video",
    ["expo-secure-store", { configureAndroidBackup: true }],
    "expo-document-picker",
    "@livekit/react-native-expo-plugin",
    "./plugins/with-discord-social-sdk",
    "./plugins/with-android-emulator-tuning",
    [
      "expo-build-properties",
      {
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a", "x86", "x86_64"],
          // Android 8.0 (API 26) is the floor of the supported matrix: every
          // release from Android 8 through the current version must install the
          // same package. compileSdk/targetSdk stay on the newest supported
          // platform so the package keeps working on new Android releases.
          minSdkVersion: 26,
          compileSdkVersion: 36,
          targetSdkVersion: 36,
        },
      },
    ],
  ],
  extra: { discordApplicationId: process.env.DISCORD_APPLICATION_ID?.trim() ?? "" },
  experiments: { typedRoutes: true, reactCompiler: true },
};

export default config;
