import { AccessToken } from "livekit-server-sdk";

export type LiveKitMemberRole = "host" | "player" | "spectator";
export type LiveKitVoiceChannel = "room" | "team";

type LiveKitRuntime = { url: string; apiKey: string; apiSecret: string };
type TokenResult = {
  configured: true;
  url: string;
  roomName: string;
  token: string;
  canPublish: boolean;
};

function configuredRuntime(): LiveKitRuntime | null {
  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

async function issueToken(runtime: LiveKitRuntime, input: {
  roomName: string;
  memberId: number;
  displayName: string;
  role: LiveKitMemberRole;
  channel: LiveKitVoiceChannel;
}): Promise<TokenResult> {
  const identity = `member-${input.memberId}`;
  const canPublish = input.role !== "spectator";
  const token = new AccessToken(runtime.apiKey, runtime.apiSecret, {
    identity,
    name: input.displayName,
    ttl: "2h",
    metadata: JSON.stringify({
      roomId: input.roomName.split("-").pop(),
      memberId: input.memberId,
      role: input.role,
      voiceChannel: input.channel,
    }),
    attributes: {
      role: input.role,
      voiceChannel: input.channel,
    },
  });

  token.addGrant({
    room: input.roomName,
    roomJoin: true,
    canSubscribe: input.channel === "room" || input.role !== "spectator",
    canPublish,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });

  return {
    configured: true,
    url: runtime.url,
    roomName: input.roomName,
    token: await token.toJwt(),
    canPublish,
  };
}

/**
 * Voice is deliberately split into two LiveKit SFU rooms:
 *   - moudie-room-{id}: everyone in the room (players + spectators)
 *   - moudie-team-{id}: active players only
 *
 * This prevents "team" privacy from depending on client-side track.enabled
 * flags. Each channel has its own signed authorization boundary.
 */
export async function createRoomMediaToken(input: {
  roomId: number;
  memberId: number;
  displayName: string;
  role: LiveKitMemberRole;
}) {
  const runtime = configuredRuntime();
  if (!runtime) {
    return {
      configured: false as const,
      message: "خدمة الصوت الجماعي لم تُضبط بعد على الخادم.",
    };
  }

  const roomToken = await issueToken(runtime, {
    roomName: `moudie-room-${input.roomId}`,
    memberId: input.memberId,
    displayName: input.displayName,
    role: input.role,
    channel: "room",
  });

  const teamMediaToken = input.role === "spectator"
    ? null
    : await issueToken(runtime, {
      roomName: `moudie-team-${input.roomId}`,
      memberId: input.memberId,
      displayName: input.displayName,
      role: input.role,
      channel: "team",
    });

  return {
    ...roomToken,
    teamMediaToken,
  };
}
