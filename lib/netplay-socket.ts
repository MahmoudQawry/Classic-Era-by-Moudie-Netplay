import { io, type Socket } from "socket.io-client";

import { getNetplayServiceUrl } from "@/constants/oauth";

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

function socketOptions(credentials: NetplayCredentials) {
  return {
    path: "/api/netplay",
    // Keep WebSocket as the preferred path but allow Socket.IO to fall back to
    // HTTP polling during mobile Wi-Fi/cellular transitions. The old websocket-
    // only setup could leave the room signaling channel dead after a transient
    // network change even though the device still had working internet.
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
  const baseUrl = getNetplayServiceUrl();
  if (!baseUrl) throw new Error("Could not determine the room server. Check the app's internet connection.");
  return io(baseUrl, socketOptions(credentials));
}

// Universal player socket uses the same mobile-safe transport/reconnection policy.
export function createUniversalNetplaySocket(credentials: NetplayCredentials): Socket {
  const baseUrl = getNetplayServiceUrl();
  if (!baseUrl) throw new Error("Could not determine the room server.");
  return io(baseUrl, {
    ...socketOptions(credentials),
    path: "/api/universal-netplay",
  });
}
