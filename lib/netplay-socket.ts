import { io, type Socket } from "socket.io-client";

import { getApiBaseUrl, getNetplayServiceUrl, getNetplayServiceUrls } from "@/constants/oauth";

export type NetplayCredentials = { roomId: number; memberId: number; memberToken: string };
export type NetplayInput = { memberId: number; player: 1 | 2; button: "UP" | "DOWN" | "LEFT" | "RIGHT" | "A" | "B" | "START" | "SELECT"; isDown: boolean; frame: number };
export type RoomChatMessage = { id: string; memberId: number; displayName: string; text: string; sentAt: number };
export type VoiceStatus = { memberId: number; microphoneEnabled: boolean; speakerEnabled: boolean };

function relayPool(): string[] {
  const configured = getNetplayServiceUrls().map((url) => url.replace(/\/$/, "")).filter(Boolean);
  const fallback = (getNetplayServiceUrl() || getApiBaseUrl()).replace(/\/$/, "");
  return Array.from(new Set([fallback, ...configured].filter(Boolean)));
}

function stableRelayIndex(roomId: number, count: number) {
  if (count <= 1) return 0;
  const normalized = Math.abs(Math.trunc(roomId));
  return normalized % count;
}

export function getRoomRelayUrl(roomId: number): string {
  const urls = relayPool();
  return urls[stableRelayIndex(roomId, urls.length)] ?? "";
}

function socketOptions(credentials: NetplayCredentials) {
  return {
    path: "/api/netplay",
    // Gameplay should never silently fall back to long-polling: that adds queueing and jitter.
    transports: ["websocket"] as ("websocket")[],
    upgrade: false,
    auth: credentials,
    timeout: 10_000,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
    randomizationFactor: 0.35,
    forceNew: false,
    autoConnect: true,
  };
}

export function createNetplaySocket(credentials: NetplayCredentials): Socket {
  const baseUrl = getRoomRelayUrl(credentials.roomId);
  if (!baseUrl) throw new Error("Could not determine the room server. Configure NETPLAY_SERVICE_URL or API_BASE_URL in the Android build.");
  return io(baseUrl, socketOptions(credentials));
}

export function createUniversalNetplaySocket(credentials: NetplayCredentials): Socket {
  const baseUrl = getRoomRelayUrl(credentials.roomId);
  if (!baseUrl) throw new Error("Could not determine the room server. Configure NETPLAY_SERVICE_URL or API_BASE_URL in the Android build.");
  return io(baseUrl, { ...socketOptions(credentials), path: "/api/universal-netplay" });
}
