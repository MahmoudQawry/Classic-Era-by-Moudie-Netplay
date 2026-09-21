import { io, type Socket } from "socket.io-client";
import { getApiBaseUrl, getNetplayServiceUrl, getNetplayServiceUrls } from "@/constants/oauth";

export type NetplayCredentials = { roomId: number; memberId: number; memberToken: string };
export type NetplayInput = { memberId: number; player: 1 | 2 | 3 | 4; button: string; isDown: boolean; frame: number };
export type RoomChatMessage = { id: string; memberId: number; displayName: string; text: string; sentAt: number };
export type VoiceStatus = { memberId: number; microphoneEnabled: boolean; speakerEnabled: boolean };
export type NetplaySocket = Socket;

function relayPool(): string[] {
  const primary = getApiBaseUrl().replace(/\/$/, "");
  const dedicated = [getNetplayServiceUrl(), ...getNetplayServiceUrls()]
    .map((url) => url.replace(/\/$/, ""))
    .filter(Boolean);
  return Array.from(new Set([primary, ...dedicated].filter(Boolean)));
}

function stableRelayIndex(roomId: number, count: number) {
  return count <= 1 ? 0 : Math.abs(Math.trunc(roomId)) % count;
}

/**
 * Express + Socket.IO is the canonical realtime authority.
 *
 * Cloudflare is no longer silently selected as a second room/session authority.
 * A dedicated relay can still be supplied explicitly through the environment,
 * but every selected relay must expose the same Socket.IO protocol and room DB.
 */
export function getRoomRelayUrl(roomId: number): string {
  const urls = relayPool();
  return urls[stableRelayIndex(roomId, urls.length)] ?? "";
}

export function createNetplaySocket(credentials: NetplayCredentials): Socket {
  const base = getRoomRelayUrl(credentials.roomId);
  if (!base) {
    throw new Error("لم يتم إعداد عنوان خادم Classic Era. اضبط EXPO_PUBLIC_API_BASE_URL على خادم Express المنشور.");
  }

  return io(base, {
    path: "/api/netplay",
    auth: {
      roomId: credentials.roomId,
      memberId: credentials.memberId,
      memberToken: credentials.memberToken,
      clientKind: "room-ui",
    },
    transports: ["websocket", "polling"],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 750,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.25,
    timeout: 12_000,
    rememberUpgrade: true,
  });
}

export function createUniversalNetplaySocket(credentials: NetplayCredentials): Socket {
  return io(getRoomRelayUrl(credentials.roomId), {
    path: "/api/netplay",
    auth: {
      roomId: credentials.roomId,
      memberId: credentials.memberId,
      memberToken: credentials.memberToken,
      clientKind: "universal-player",
    },
    transports: ["websocket", "polling"],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 750,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.25,
    timeout: 12_000,
    rememberUpgrade: true,
  });
}
