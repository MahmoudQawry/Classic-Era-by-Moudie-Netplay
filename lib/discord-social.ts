import { NativeModules, Platform } from "react-native";

type DiscordSocialNative = {
  initialize: (applicationId: string) => void;
  updateRichPresence: (
    details?: string,
    state?: string,
    partyId?: string,
    partySize?: number,
    partyMax?: number,
  ) => void;
  clearRichPresence: () => void;
};

const nativeModule = NativeModules.DiscordSocial as DiscordSocialNative | undefined;

export function initializeDiscordSocial(applicationId?: string): boolean {
  if (Platform.OS !== "android" || !applicationId || !nativeModule) {
    return false;
  }

  nativeModule.initialize(applicationId);
  return true;
}

export function updateDiscordRichPresence(
  details?: string,
  state?: string,
  partyId?: string,
  partySize = 0,
  partyMax = 0,
): void {
  if (Platform.OS !== "android" || !nativeModule) {
    return;
  }

  nativeModule.updateRichPresence(details, state, partyId, partySize, partyMax);
}

export function clearDiscordRichPresence(): void {
  if (Platform.OS !== "android" || !nativeModule) {
    return;
  }

  nativeModule.clearRichPresence();
}
