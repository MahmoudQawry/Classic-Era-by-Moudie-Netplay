import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { Platform } from "react-native";
import { AudioSession, LiveKitRoom, registerGlobals, useRoomContext } from "@livekit/react-native";
import { ConnectionState, RoomEvent, Track } from "livekit-client";
import { trpc } from "@/lib/trpc";

if (Platform.OS !== "web") {
  try {
    registerGlobals();
  } catch (e) {
    // Already registered
  }
}

export type VoiceMember = {
  id: number;
  displayName: string;
  role: "host" | "player" | "spectator";
};

export type MediaToken = {
  configured: boolean;
  url?: string;
  roomName?: string;
  token?: string;
  canPublish?: boolean;
  message?: string;
  teamMediaToken?: MediaToken | null;
};

export type VoiceChatContextType = {
  activeRoomId: number | null;
  mediaToken: MediaToken | null;
  members: VoiceMember[];
  isVoiceConnected: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  micMode: "open" | "mute";
  status: string;
  connectedPeers: number;
  joinVoice: (params: { roomId: number; memberId: number; memberToken: string }) => Promise<void>;
  leaveVoice: () => void;
  toggleMic: () => Promise<void>;
  toggleDeafen: () => Promise<void>;
  setMicMode: (mode: "open" | "mute") => Promise<void>;
  setSpeakerEnabled: (enabled: boolean) => Promise<void>;
  setMembersList: (members: VoiceMember[]) => void;
};

const VoiceChatContext = createContext<VoiceChatContextType | null>(null);

export function useVoiceChat() {
  const ctx = useContext(VoiceChatContext);
  if (!ctx) {
    throw new Error("useVoiceChat must be used within VoiceChatProvider");
  }
  return ctx;
}

export function VoiceChatProvider({ children }: { children: React.ReactNode }) {
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [credentials, setCredentials] = useState<{ roomId: number; memberId: number; memberToken: string } | null>(null);
  const [mediaToken, setMediaToken] = useState<MediaToken | null>(null);
  const [members, setMembers] = useState<VoiceMember[]>([]);
  const [audioSessionReady, setAudioSessionReady] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const [micMode, setMicModeState] = useState<"open" | "mute">("mute");
  const [status, setStatus] = useState("DISCONNECTED");
  const [connectedPeers, setConnectedPeers] = useState(0);

  const mediaTokenMutation = trpc.rooms.mediaToken.useMutation();

  // Audio session initialization
  useEffect(() => {
    if (Platform.OS === "web" || !mediaToken?.configured) return;
    let active = true;
    void AudioSession.startAudioSession()
      .then(() => {
        if (active) setAudioSessionReady(true);
      })
      .catch(() => setAudioSessionReady(false));
    return () => {
      active = false;
      void AudioSession.stopAudioSession();
    };
  }, [mediaToken?.configured]);

  // Keep-alive / auto-refresh token every 45 minutes
  useEffect(() => {
    if (!credentials || Platform.OS === "web") return;
    const refreshInterval = setInterval(async () => {
      try {
        const next = await mediaTokenMutation.mutateAsync({
          roomId: credentials.roomId,
          memberId: credentials.memberId,
          memberToken: credentials.memberToken,
        });
        if (next && next.configured) {
          setMediaToken(next);
        }
      } catch (err) {
        console.warn("[VoiceChatProvider] Keep-alive refresh failed:", err);
      }
    }, 45 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [credentials, mediaTokenMutation]);

  const joinVoice = useCallback(
    async (params: { roomId: number; memberId: number; memberToken: string }) => {
      if (Platform.OS === "web") return;
      if (activeRoomId === params.roomId && mediaToken?.configured) return;

      setActiveRoomId(params.roomId);
      setCredentials(params);
      setStatus("CONNECTING");

      try {
        const tokenResult = await mediaTokenMutation.mutateAsync({
          roomId: params.roomId,
          memberId: params.memberId,
          memberToken: params.memberToken,
        });
        setMediaToken(tokenResult);
      } catch (err) {
        console.warn("[VoiceChatProvider] joinVoice failed:", err);
        setStatus("CONNECTION_FAILED");
        setMediaToken({ configured: false, message: "فشل إعداد رمز الصوت." });
      }
    },
    [activeRoomId, mediaToken, mediaTokenMutation],
  );

  const leaveVoice = useCallback(() => {
    setActiveRoomId(null);
    setCredentials(null);
    setMediaToken(null);
    setIsMuted(true);
    setIsDeafened(false);
    setStatus("DISCONNECTED");
    setConnectedPeers(0);
  }, []);

  const roomControlRef = useRef<{
    setMic: (enabled: boolean) => Promise<void>;
    setDeafen: (deafen: boolean) => Promise<void>;
    setSpeaker: (enabled: boolean) => Promise<void>;
  }>({
    setMic: async () => {},
    setDeafen: async () => {},
    setSpeaker: async () => {},
  });

  const toggleMic = useCallback(async () => {
    if (isDeafened) {
      // If deafened, toggling mic un-deafens first
      await roomControlRef.current.setDeafen(false);
      setIsDeafened(false);
    }
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    setMicModeState(nextMuted ? "mute" : "open");
    await roomControlRef.current.setMic(!nextMuted);
  }, [isDeafened, isMuted]);

  const toggleDeafen = useCallback(async () => {
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);
    if (nextDeafened) {
      setIsMuted(true);
      await roomControlRef.current.setMic(false);
    } else {
      // Restore mic if open mode
      if (micMode === "open") {
        setIsMuted(false);
        await roomControlRef.current.setMic(true);
      }
    }
    await roomControlRef.current.setDeafen(nextDeafened);
  }, [isDeafened, micMode]);

  const setMicMode = useCallback(
    async (mode: "open" | "mute") => {
      setMicModeState(mode);
      if (mode === "open") {
        if (isDeafened) {
          setIsDeafened(false);
          await roomControlRef.current.setDeafen(false);
        }
        setIsMuted(false);
        await roomControlRef.current.setMic(true);
      } else {
        setIsMuted(true);
        await roomControlRef.current.setMic(false);
      }
    },
    [isDeafened],
  );

  const setSpeakerEnabled = useCallback(async (enabled: boolean) => {
    await roomControlRef.current.setSpeaker(enabled);
  }, []);

  const setMembersList = useCallback((list: VoiceMember[]) => {
    setMembers(list);
  }, []);

  const isVoiceConnected = status === "CONNECTED" || status === "VOICE CONNECTED";

  const contextValue: VoiceChatContextType = {
    activeRoomId,
    mediaToken,
    members,
    isVoiceConnected,
    isMuted,
    isDeafened,
    micMode,
    status,
    connectedPeers,
    joinVoice,
    leaveVoice,
    toggleMic,
    toggleDeafen,
    setMicMode,
    setSpeakerEnabled,
    setMembersList,
  };

  const hasValidToken = Boolean(
    Platform.OS !== "web" &&
      mediaToken?.configured &&
      mediaToken.url &&
      mediaToken.token &&
      activeRoomId !== null,
  );

  return (
    <VoiceChatContext.Provider value={contextValue}>
      {children}
      {hasValidToken && (
        <LiveKitRoom
          serverUrl={mediaToken!.url!}
          token={mediaToken!.token!}
          connect={audioSessionReady}
          audio={false}
          video={false}
          options={{ adaptiveStream: true, dynacast: true }}
          onError={(error) => console.warn("[Global LiveKitRoom Error]", error)}
        >
          <VoiceChatRoomCoordinator
            setStatus={setStatus}
            setConnectedPeers={setConnectedPeers}
            controlRef={roomControlRef}
          />
        </LiveKitRoom>
      )}
    </VoiceChatContext.Provider>
  );
}

function VoiceChatRoomCoordinator({
  setStatus,
  setConnectedPeers,
  controlRef,
}: {
  setStatus: (s: string) => void;
  setConnectedPeers: (n: number) => void;
  controlRef: React.MutableRefObject<{
    setMic: (enabled: boolean) => Promise<void>;
    setDeafen: (deafen: boolean) => Promise<void>;
    setSpeaker: (enabled: boolean) => Promise<void>;
  }>;
}) {
  const room = useRoomContext();

  useEffect(() => {
    const update = () => {
      setStatus(room.state === ConnectionState.Connected ? "CONNECTED" : "CONNECTING");
      setConnectedPeers(room.remoteParticipants.size);
    };
    update();

    const onConnected = () => update();
    const onDisconnected = () => {
      setStatus("RECONNECTING");
      setConnectedPeers(0);
    };
    const onParticipant = () => update();

    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Disconnected, onDisconnected);
    room.on(RoomEvent.Reconnecting, () => setStatus("RECONNECTING"));
    room.on(RoomEvent.Reconnected, () => setStatus("CONNECTED"));
    room.on(RoomEvent.ParticipantConnected, onParticipant);
    room.on(RoomEvent.ParticipantDisconnected, onParticipant);
    room.on(RoomEvent.ConnectionQualityChanged, onParticipant);

    controlRef.current = {
      setMic: async (enabled: boolean) => {
        try {
          await room.localParticipant.setMicrophoneEnabled(enabled);
        } catch (e) {
          console.warn("[Voice Coordinator] setMicrophoneEnabled error:", e);
        }
      },
      setDeafen: async (deafened: boolean) => {
        try {
          room.remoteParticipants.forEach((p) => {
            p.audioTrackPublications.forEach((pub) => {
              if (pub.track) {
                pub.track.mediaStreamTrack.enabled = !deafened;
              }
            });
          });
        } catch (e) {
          console.warn("[Voice Coordinator] setDeafen error:", e);
        }
      },
      setSpeaker: async (enabled: boolean) => {
        try {
          if (enabled) {
            await AudioSession.selectAudioOutput("speaker");
          } else {
            const outputs = await AudioSession.getAudioOutputs();
            const headset = outputs.find(
              (x: unknown) => x === "headset" || x === "bluetooth" || x === "earpiece",
            );
            if (headset) await AudioSession.selectAudioOutput(headset as any);
          }
        } catch (e) {
          console.warn("[Voice Coordinator] setSpeaker error:", e);
        }
      },
    };

    return () => {
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.ParticipantConnected, onParticipant);
      room.off(RoomEvent.ParticipantDisconnected, onParticipant);
      room.off(RoomEvent.ConnectionQualityChanged, onParticipant);
    };
  }, [room, controlRef, setStatus, setConnectedPeers]);

  return null;
}
