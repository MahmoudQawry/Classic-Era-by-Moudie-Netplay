import { NativeModules, Platform } from "react-native";

type DiscordSocialModule = {
  initialize: (applicationId: string) => void;
  updateRichPresence: (
    details: string | null,
    state: string | null,
    partyId: string | null,
    partySize: number,
    partyMax: number,
  ) => void;
  clearRichPresence: () => void;
};

const native = NativeModules.DiscordSocial as DiscordSocialModule | undefined;

export function initializeDiscordSocial(applicationId?: string | null) {
  if (Platform.OS !== "android" || !applicationId || !native) return false;
  native.initialize(applicationId);
  return true;
}

export function updateDiscordRichPresence(
  details: string | null,
  state: string | null,
  partyId: string | null = null,
  partySize = 1,
  partyMax = 1,
) {
  if (Platform.OS !== "android" || !native) return;
  native.updateRichPresence(details, state, partyId, partySize, partyMax);
}

export function clearDiscordRichPresence() {
  if (Platform.OS !== "android" || !native) return;
  native.clearRichPresence();
}
