import * as Linking from "expo-linking";
import * as ReactNative from "react-native";

const bundleId = "com.app.moudienetplay";
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const env = {
  portal: process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ?? "",
  server: process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ?? "",
  appId: process.env.EXPO_PUBLIC_APP_ID ?? "",
  ownerId: process.env.EXPO_PUBLIC_OWNER_OPEN_ID ?? "",
  ownerName: process.env.EXPO_PUBLIC_OWNER_NAME ?? "",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  netplayServiceUrl: process.env.EXPO_PUBLIC_NETPLAY_SERVICE_URL ?? "",
  deepLinkScheme: schemeFromBundleId,
};

// Backward-compatible fallback for the currently published project. Production
// builds should set EXPO_PUBLIC_NETPLAY_SERVICE_URL to the dedicated low-latency
// realtime host so the APK never needs a source-code change when the relay moves.
const NATIVE_NETPLAY_SERVICE_FALLBACK_URL = "https://moudienet-7h7tawvf.manus.space";
const NATIVE_NETPLAY_SERVICE_URL = (env.netplayServiceUrl || NATIVE_NETPLAY_SERVICE_FALLBACK_URL).replace(/\/$/, "");

// REST room credentials and Socket.IO must target the same published service.
// A split backend makes native players connect with credentials unknown to the relay.
const NATIVE_API_FALLBACK_URL = NATIVE_NETPLAY_SERVICE_URL;

export const OAUTH_PORTAL_URL = env.portal;
export const OAUTH_SERVER_URL = env.server;
export const APP_ID = env.appId;
export const OWNER_OPEN_ID = env.ownerId;
export const OWNER_NAME = env.ownerName;
export const API_BASE_URL = env.apiBaseUrl;

/**
 * Get the API base URL, deriving from current hostname if not set.
 * Metro runs on 8081, API server runs on 3000.
 */
export function getApiBaseUrl(): string {
  if (ReactNative.Platform.OS !== "web") {
    return NATIVE_API_FALLBACK_URL;
  }

  if (API_BASE_URL) {
    return API_BASE_URL.replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    const apiHostname = hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== hostname) {
      return `${protocol}//${apiHostname}`;
    }
  }

  return NATIVE_API_FALLBACK_URL;
}

/** Production room relay. Kept separate from the app's OAuth/API gateway. */
export function getNetplayServiceUrl(): string {
  return NATIVE_NETPLAY_SERVICE_URL;
}

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "manus-runtime-user-info";

const encodeState = (value: string) => {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(value);
  }
  const BufferImpl = (globalThis as Record<string, any>).Buffer;
  if (BufferImpl) {
    return BufferImpl.from(value, "utf-8").toString("base64");
  }
  return value;
};

export const getRedirectUri = () => {
  if (ReactNative.Platform.OS === "web") {
    return `${getApiBaseUrl()}/api/oauth/callback`;
  }
  return Linking.createURL("/oauth/callback", { scheme: env.deepLinkScheme });
};

export const getLoginUrl = () => {
  const redirectUri = getRedirectUri();
  const state = encodeState(redirectUri);
  const url = new URL(`${OAUTH_PORTAL_URL}/app-auth`);
  url.searchParams.set("appId", APP_ID);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");
  return url.toString();
};

export async function startOAuthLogin(): Promise<string | null> {
  const loginUrl = getLoginUrl();

  if (ReactNative.Platform.OS === "web") {
    if (typeof window !== "undefined") window.location.href = loginUrl;
    return null;
  }

  const supported = await Linking.canOpenURL(loginUrl);
  if (!supported) {
    console.warn("[OAuth] Cannot open login URL: URL scheme not supported");
    return null;
  }

  try {
    await Linking.openURL(loginUrl);
  } catch (error) {
    console.error("[OAuth] Failed to open login URL:", error);
  }

  return null;
}
