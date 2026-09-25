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
const discordApplicationId = process.env.DISCORD_APPLICATION_ID?.trim();

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
  version: "1.0.0.1",
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
    versionCode: 53,
    adaptiveIcon: {
      backgroundColor: "#101827",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: env.androidPackage,
    permissions: [
      "RECORD_AUDIO",
      "MODIFY_AUDIO_SETTINGS",
      "ACCESS_NETWORK_STATE",
      "CHANGE_NETWORK_STATE",
      "BLUETOOTH",
      "BLUETOOTH_ADMIN",
      "BLUETOOTH_CONNECT",
    ],
    blockedPermissions: [
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: env.scheme, host: "*" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
      ...(discordApplicationId ? [{
        action: "VIEW" as const,
        data: [{ scheme: `discord-${discordApplicationId}` }],
        category: ["BROWSABLE", "DEFAULT"],
      }] : []),
    ],
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
    "./plugins/with-discord-social-sdk",
    "@livekit/react-native-expo-plugin",
    [
      "expo-build-properties",
      { android: { buildArchs: ["arm64-v8a"], minSdkVersion: 26 } },
    ],
  ],
  extra: { discordApplicationId },
  experiments: { typedRoutes: true, reactCompiler: true },
};

export default config;
