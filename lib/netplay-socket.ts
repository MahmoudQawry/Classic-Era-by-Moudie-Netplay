import { io, type Socket } from "socket.io-client";

import { getNetplayServiceUrl, getNetplayServiceUrls } from "@/constants/oauth";

export type NetplayCredentials = {
  roomId: number;
  memberId: number;
  memberToken: string;
};

export type NetplayInput = {
  memberId: number;
  player: 1 | 2;
  button: "UP" | "DOWN" | "LEFT" | "RIGHT" | "A" | "B" | "START" | "SELECT";
  isDown: boolean;
  frame: number;
};

export type RoomChatMessage = {
  id: string;
  memberId: number;
  displayName: string;
  text: string;
  sentAt: number;
};

export type VoiceStatus = {
  memberId: number;
  microphoneEnabled: boolean;
  speakerEnabled: boolean;
};

function stableRelayIndex(roomId: number, count: number) {
  if (count <= 1) return 0;
  const normalized = Math.abs(Math.trunc(roomId));
  return normalized % count;
}

export function getRoomRelayUrl(roomId: number): string {
  const urls = getNetplayServiceUrls();
  return urls[stableRelayIndex(roomId, urls.length)] ?? getNetplayServiceUrl();
}

function socketOptions(credentials: NetplayCredentials) {
  return {
    path: "/api/netplay",
    // WebSocket is preferred for lowest overhead. Polling remains available as
    // a recovery transport during mobile Wi-Fi/cellular transitions.
    transports: ["websocket", "polling"] as ("websocket" | "polling")[],
    upgrade: true,
    auth: credentials,
    timeout: 20_000,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 8_000,
    randomizationFactor: 0.35,
    forceNew: false,
    autoConnect: true,
  };
}

export function createNetplaySocket(credentials: NetplayCredentials): Socket {
  const baseUrl = getRoomRelayUrl(credentials.roomId);
  if (!baseUrl) throw new Error("Could not determine the room server. Check the app's internet connection.");
  return io(baseUrl, socketOptions(credentials));
}

// Universal player socket uses the same mobile-safe transport/reconnection policy.
export function createUniversalNetplaySocket(credentials: NetplayCredentials): Socket {
  const baseUrl = getRoomRelayUrl(credentials.roomId);
  if (!baseUrl) throw new Error("Could not determine the room server.");
  return io(baseUrl, {
    ...socketOptions(credentials),
    path: "/api/universal-netplay",
  });
}
