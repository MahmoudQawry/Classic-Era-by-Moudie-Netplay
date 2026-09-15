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

export function createNetplaySocket(credentials: NetplayCredentials): Socket {
  const baseUrl = getNetplayServiceUrl();
  if (!baseUrl) throw new Error("Could not determine the room server. Check the app's internet connection.");
  return io(baseUrl, {
    path: "/api/netplay",
    transports: ["websocket"],
    upgrade: false,
    auth: credentials,
    timeout: 20_000,
    reconnection: true,
    // Backoff tuned for mobile: a 300ms retry storm used to pile extra sockets
    // on top of the CPU spike of starting a game. Start at 1s, cap at 8s.
    reconnectionAttempts: 50,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 8_000,
    randomizationFactor: 0.5,
    forceNew: false,
    autoConnect: true,
  });
}

// adaptive: create universal socket with same improvements
export function createUniversalNetplaySocket(credentials: NetplayCredentials): Socket {
  const baseUrl = getNetplayServiceUrl();
  if (!baseUrl) throw new Error("Could not determine the room server.");
  return io(baseUrl, {
    path: "/api/universal-netplay",
    transports: ["websocket"],
    upgrade: false,
    auth: credentials,
    timeout: 20_000,
    reconnection: true,
    reconnectionAttempts: 50,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 8_000,
    randomizationFactor: 0.5,
    forceNew: false,
    autoConnect: true,
  });
}
