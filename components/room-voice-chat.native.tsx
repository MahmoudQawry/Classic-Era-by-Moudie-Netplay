import { AudioSession, LiveKitRoom, registerGlobals, useConnectionState, useLocalParticipant, useParticipants } from "@livekit/react-native";
import { ConnectionState } from "livekit-client";
import { RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, mediaDevices } from "@livekit/react-native-webrtc";
import InCallManager from "react-native-incall-manager";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Socket } from "socket.io-client";
import { getApiBaseUrl } from "@/constants/oauth";
import { useLanguage } from "@/lib/language";

registerGlobals();

type VoiceMember = { id: number; displayName: string; role: "host" | "player" | "spectator" };
type MediaToken = { configured: boolean; url?: string; roomName?: string; token?: string; canPublish?: boolean; message?: string };
type VoiceMode = "ptt" | "open";
type VoiceChannel = "room" | "team";
export type RoomVoiceChatHandle = {
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setSpeakerEnabled?: (enabled: boolean) => Promise<void>;
  setVoiceMode?: (mode: VoiceMode) => void;
  setVoiceChannel?: (channel: VoiceChannel) => void;
};
type SocketLike = { on?: (event: string, listener: (payload: any) => void) => unknown; off?: (event: string, listener?: (payload: any) => void) => unknown; emit?: (event: string, payload?: any) => unknown; connected?: boolean };
type Props = { mediaToken?: MediaToken | null; memberRole?: VoiceMember["role"]; socket?: unknown; isHost?: boolean; remoteOnline?: boolean; memberId?: number; members?: VoiceMember[] };
type VoiceStatusPayload = { memberId?: number; displayName?: string; role?: string; microphoneEnabled?: boolean; speakerEnabled?: boolean; isSpeaking?: boolean; voiceChannel?: string; timestamp?: number };
type RoomSocketAuth = { roomId?: unknown; memberId?: unknown; memberToken?: unknown };
type VoiceSignal = { kind?: unknown; description?: unknown; candidate?: unknown };

const VOICE_ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

function readSocketAuth(socket: unknown): RoomSocketAuth | null {
  if (!socket || typeof socket !== "object") return null;
  const auth = (socket as { auth?: unknown }).auth;
  return auth && typeof auth === "object" ? (auth as RoomSocketAuth) : null;
}

function readSpeaking(payload: VoiceStatusPayload): boolean {
  // The production relay forwards microphoneEnabled/speakerEnabled/voiceChannel
  // but may drop isSpeaking, so an enabled microphone counts as "active".
  if (!payload?.microphoneEnabled) return false;
  return payload.isSpeaking === undefined ? true : Boolean(payload.isSpeaking);
}

function VoiceControls({
  onMicChange, onSpeakerChange, onModeChange, onChannelChange, onPttPress, onPttRelease,
  microphoneEnabled, speakerEnabled, voiceMode, voiceChannel, connectedCount, status, speakingMembers, members, localMemberId,
}: {
  onMicChange: (enabled: boolean) => Promise<void>;
  onSpeakerChange: (enabled: boolean) => void;
  onModeChange?: (mode: VoiceMode) => void;
  onChannelChange?: (channel: VoiceChannel) => void;
  onPttPress?: () => void;
  onPttRelease?: () => void;
  microphoneEnabled: boolean;
  speakerEnabled: boolean;
  voiceMode: VoiceMode;
  voiceChannel: VoiceChannel;
  connectedCount: number;
  status: string;
  speakingMembers?: Map<number, boolean>;
  members?: VoiceMember[];
  localMemberId?: number;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [pttActive, setPttActive] = useState(false);

  const toggleMic = async () => {
    if (busy || voiceMode === "ptt") return;
    setBusy(true);
    try { await onMicChange(!microphoneEnabled); } finally { setBusy(false); }
  };

  const handlePttIn = () => {
    if (voiceMode !== "ptt") return;
    setPttActive(true);
    onPttPress?.();
  };

  const handlePttOut = () => {
    if (voiceMode !== "ptt") return;
    setPttActive(false);
    onPttRelease?.();
  };

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Text style={styles.title}>🎙️ {t("voice")}</Text>
        <View style={styles.counter}><Text style={styles.counterText}>{connectedCount} ONLINE</Text></View>
      </View>
      <Text style={styles.status}>{status}</Text>

      <View style={styles.modeRow}>
        <Text style={styles.modeLabel}>{t("voiceMode")}:</Text>
        <Pressable onPress={() => onModeChange?.("open")} style={[styles.modeChip, voiceMode === "open" && styles.modeChipActive]}>
          <Text style={[styles.modeChipText, voiceMode === "open" && styles.modeChipTextActive]}>{t("voiceOpenMic")}</Text>
        </Pressable>
        <Pressable onPress={() => onModeChange?.("ptt")} style={[styles.modeChip, voiceMode === "ptt" && styles.modeChipActive]}>
          <Text style={[styles.modeChipText, voiceMode === "ptt" && styles.modeChipTextActive]}>{t("voicePushToTalk")}</Text>
        </Pressable>
      </View>

      <View style={styles.modeRow}>
        <Text style={styles.modeLabel}>{t("voiceChannel")}:</Text>
        <Pressable onPress={() => onChannelChange?.("room")} style={[styles.modeChip, voiceChannel === "room" && styles.modeChipActive]}>
          <Text style={[styles.modeChipText, voiceChannel === "room" && styles.modeChipTextActive]}>🌍 {t("voiceChannelRoom")}</Text>
        </Pressable>
        <Pressable onPress={() => onChannelChange?.("team")} style={[styles.modeChip, voiceChannel === "team" && styles.modeChipActive]}>
          <Text style={[styles.modeChipText, voiceChannel === "team" && styles.modeChipTextActive]}>👥 {t("voiceChannelTeam")}</Text>
        </Pressable>
      </View>
      {voiceChannel === "team" && <Text style={styles.hint}>{t("voiceTeamNote")}</Text>}

      {members && members.length > 0 && (
        <View style={styles.membersList}>
          <Text style={styles.membersTitle}>VOICE ACTIVITY:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.membersScroll}>
            {members.map((member) => {
              const isLocal = member.id === localMemberId;
              const isSpeaking = Boolean(speakingMembers?.get(member.id));
              return (
                <View key={member.id} style={[styles.memberBadge, isSpeaking && styles.memberSpeaking, isLocal && styles.memberLocal]}>
                  <View style={[styles.speakingDot, isSpeaking ? styles.speakingDotActive : styles.speakingDotMuted]} />
                  <Text style={styles.memberName} numberOfLines={1}>{member.displayName}</Text>
                  <Text style={styles.memberRole}>{isLocal ? "YOU" : member.role.toUpperCase()}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={styles.actions}>
        {voiceMode === "ptt" ? (
          <Pressable
            onPressIn={handlePttIn}
            onPressOut={handlePttOut}
            style={({ pressed }) => [styles.action, styles.pttAction, (pttActive || pressed) && styles.pttActive]}
          >
            <Text style={styles.actionLabel}>{t("voiceHoldToTalk")}</Text>
          </Pressable>
        ) : (
          <Pressable disabled={busy} onPress={toggleMic} style={({ pressed }) => [styles.action, microphoneEnabled && styles.actionActive, pressed && styles.pressed]}>
            <Text style={styles.actionLabel}>{microphoneEnabled ? t("micOn") : t("micOff")}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => onSpeakerChange(!speakerEnabled)} style={({ pressed }) => [styles.action, speakerEnabled && styles.actionActive, pressed && styles.pressed]}>
          <Text style={styles.actionLabel}>{speakerEnabled ? t("speakerOn") : t("speakerOff")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** LiveKit path: used only when the room service issues a media token. */
function LiveKitVoiceControls({ members, localMemberId, socket }: { members?: VoiceMember[]; localMemberId?: number; socket?: unknown }) {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const [speaker, setSpeaker] = useState(true);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("open");
  const [voiceChannel, setVoiceChannel] = useState<VoiceChannel>("room");
  const [speakingMap, setSpeakingMap] = useState<Map<number, boolean>>(new Map());
  const socketRef = useRef(socket as SocketLike | undefined);

  useEffect(() => { socketRef.current = socket as SocketLike | undefined; }, [socket]);

  const ensureAudioSession = () => {
    AudioSession.startAudioSession().catch(() => undefined);
    InCallManager.start({ media: "audio" });
    InCallManager.setForceSpeakerphoneOn(true);
  };

  useEffect(() => {
    try { InCallManager.setKeepScreenOn(true); } catch { /* best effort */ }
    return () => {
      InCallManager.stop();
      AudioSession.stopAudioSession().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const sock = socketRef.current;
    if (!sock?.on) return;
    const onVoiceStatus = (payload: VoiceStatusPayload) => {
      if (!payload?.memberId) return;
      if (payload.voiceChannel && payload.voiceChannel !== voiceChannel) return;
      setSpeakingMap((previous) => {
        const next = new Map(previous);
        next.set(payload.memberId as number, readSpeaking(payload));
        return next;
      });
    };
    sock.on?.("netplay:voice-status", onVoiceStatus);
    return () => { sock.off?.("netplay:voice-status", onVoiceStatus); };
  }, [socket, voiceChannel]);

  // Live speaking heartbeat so every member's indicator stays accurate.
  useEffect(() => {
    if (!isMicrophoneEnabled) return;
    const emitSpeaking = () => socketRef.current?.emit?.("netplay:voice-status", { microphoneEnabled: true, speakerEnabled: speaker, voiceMode, voiceChannel, isSpeaking: true });
    emitSpeaking();
    const timer = setInterval(emitSpeaking, 2_000);
    return () => clearInterval(timer);
  }, [isMicrophoneEnabled, speaker, voiceMode, voiceChannel]);

  const handleModeChange = (mode: VoiceMode) => {
    setVoiceMode(mode);
    if (mode === "ptt") localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    socketRef.current?.emit?.("netplay:voice-status", { microphoneEnabled: mode === "open" ? isMicrophoneEnabled : false, speakerEnabled: speaker, voiceMode: mode, voiceChannel });
  };
  const handleChannelChange = (channel: VoiceChannel) => {
    setVoiceChannel(channel);
    socketRef.current?.emit?.("netplay:voice-status", { microphoneEnabled: isMicrophoneEnabled, speakerEnabled: speaker, voiceMode, voiceChannel: channel });
  };

  return (
    <VoiceControls
      microphoneEnabled={isMicrophoneEnabled}
      speakerEnabled={speaker}
      voiceMode={voiceMode}
      voiceChannel={voiceChannel}
      connectedCount={Math.max(0, participants.length - 1)}
      status={connectionState === ConnectionState.Connected ? `LiveKit · ${voiceChannel} · ${voiceMode}` : `Voice ${String(connectionState).toLowerCase()}…`}
      onMicChange={async (enabled) => {
        ensureAudioSession();
        await localParticipant.setMicrophoneEnabled(enabled);
        socketRef.current?.emit?.("netplay:voice-status", { microphoneEnabled: enabled, speakerEnabled: speaker, voiceMode, voiceChannel, isSpeaking: enabled });
      }}
      onSpeakerChange={(enabled) => { setSpeaker(enabled); ensureAudioSession(); InCallManager.setForceSpeakerphoneOn(enabled); }}
      onModeChange={handleModeChange}
      onChannelChange={handleChannelChange}
      onPttPress={() => {
        if (voiceMode !== "ptt") return;
        ensureAudioSession();
        localParticipant.setMicrophoneEnabled(true).catch(() => undefined);
        socketRef.current?.emit?.("netplay:voice-status", { microphoneEnabled: true, speakerEnabled: speaker, voiceMode, voiceChannel, isSpeaking: true });
      }}
      onPttRelease={() => {
        if (voiceMode !== "ptt") return;
        localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
        socketRef.current?.emit?.("netplay:voice-status", { microphoneEnabled: false, speakerEnabled: speaker, voiceMode, voiceChannel, isSpeaking: false });
      }}
      speakingMembers={speakingMap}
      members={members}
      localMemberId={localMemberId}
    />
  );
}

/** Built-in voice: peer-to-peer WebRTC mesh over the room socket.
 *
 * This is the guaranteed path when the room service has no LiveKit credentials
 * (the production gateway answers 404 for rooms.mediaToken, which used to leave
 * the app with no voice UI at all). It needs only the signalling events the
 * relay already forwards: netplay:signal (voice-hello/ready/offer/answer/
 * candidate) and netplay:voice-status.
 */
function BuiltInVoiceControls({ socket, memberId, members, memberRole, expose }: {
  socket?: unknown; memberId?: number; members?: VoiceMember[]; memberRole?: VoiceMember["role"];
  expose: (handle: RoomVoiceChatHandle) => void;
}) {
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("ptt");
  const [voiceChannel, setVoiceChannel] = useState<VoiceChannel>("room");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [connectedCount, setConnectedCount] = useState(0);
  const [speakingMap, setSpeakingMap] = useState<Map<number, boolean>>(new Map());
  const [status, setStatus] = useState("");

  const socketRef = useRef<SocketLike | undefined>(socket as SocketLike | undefined);
  const streamRef = useRef<any>(null);
  const peersRef = useRef<Map<number, any>>(new Map());
  const pendingCandidatesRef = useRef<Map<number, any[]>>(new Map());
  const makingOfferRef = useRef<Set<number>>(new Set());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const { t } = useLanguage();

  const localRole = memberRole ?? members?.find((member) => member.id === memberId)?.role;
  const isSpectator = localRole === "spectator";
  const canSpeak = !isSpectator || voiceChannel === "room";

  useEffect(() => { socketRef.current = socket as SocketLike | undefined; }, [socket]);

  const emitStatus = (overrides: Partial<{ microphoneEnabled: boolean; speakerEnabled: boolean; isSpeaking: boolean; voiceMode: VoiceMode; voiceChannel: VoiceChannel }> = {}) => {
    socketRef.current?.emit?.("netplay:voice-status", {
      microphoneEnabled: overrides.microphoneEnabled ?? microphoneEnabled,
      speakerEnabled: overrides.speakerEnabled ?? speakerEnabled,
      isSpeaking: overrides.isSpeaking ?? (overrides.microphoneEnabled ?? microphoneEnabled),
      voiceMode: overrides.voiceMode ?? voiceMode,
      voiceChannel: overrides.voiceChannel ?? voiceChannel,
    });
  };

  const ensureAudioSession = () => {
    AudioSession.startAudioSession().catch(() => undefined);
    InCallManager.start({ media: "audio" });
    InCallManager.setForceSpeakerphoneOn(speakerEnabled);
  };

  /** Microphone is acquired lazily: joining a room must not grab it. */
  const ensureMicrophone = async () => {
    if (streamRef.current) return streamRef.current;
    if (Platform.OS === "android") {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
        title: t("voicePermissionTitle"),
        message: t("voicePermissionMessage"),
        buttonPositive: t("voiceAllow"),
      });
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error("microphone-permission-denied");
    }
    const stream = await mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } as unknown as Record<string, never>,
      video: false,
    });
    stream.getAudioTracks().forEach((track: any) => { track.enabled = false; });
    streamRef.current = stream;
    for (const peer of peersRef.current.values()) {
      stream.getTracks().forEach((track: any) => peer.addTrack(track, stream));
    }
    ensureAudioSession();
    return stream;
  };

  const setMicEnabled = async (enabled: boolean) => {
    if (enabled && !canSpeak) return;
    if (enabled) {
      try {
        await ensureMicrophone();
      } catch {
        setStatus(t("voiceMicPermission"));
        return;
      }
    }
    streamRef.current?.getAudioTracks().forEach((track: any) => { track.enabled = enabled; });
    setMicrophoneEnabled(enabled);
    emitStatus({ microphoneEnabled: enabled, isSpeaking: enabled });
    if (enabled) {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => emitStatus({ microphoneEnabled: true, isSpeaking: true }), 2_000);
    } else if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  const setSpeaker = (enabled: boolean) => {
    setSpeakerEnabled(enabled);
    ensureAudioSession();
    InCallManager.setForceSpeakerphoneOn(enabled);
    emitStatus({ speakerEnabled: enabled });
  };

  useEffect(() => {
    expose({
      setMicrophoneEnabled: setMicEnabled,
      setSpeakerEnabled: async (enabled) => setSpeaker(enabled),
      setVoiceMode: (mode) => setVoiceMode(mode),
      setVoiceChannel: (channel) => setVoiceChannel(channel),
    });
  });

  // Peer mesh: one RTCPeerConnection per remote member, negotiated over the room socket.
  useEffect(() => {
    const currentSocket = socketRef.current;
    const localId = Number(memberId);
    const peers = peersRef.current;
    const pendingCandidates = pendingCandidatesRef.current;
    const makingOffer = makingOfferRef.current;
    const statusTimers = statusTimersRef.current;
    if (!currentSocket?.on || !currentSocket.emit || !Number.isInteger(localId) || localId <= 0) {
      setStatus(t("voiceWaitingRoom"));
      return;
    }

    let disposed = false;
    const updateCount = () => {
      const connected = Array.from(peers.values()).filter((peer: any) => peer.connectionState === "connected").length;
      setConnectedCount(connected);
    };

    const ensurePeer = (remoteId: number) => {
      const existing = peers.get(remoteId);
      if (existing) return existing;
      const peer = new RTCPeerConnection({ iceServers: VOICE_ICE_SERVERS });
      if (streamRef.current) streamRef.current.getTracks().forEach((track: any) => peer.addTrack(track, streamRef.current));
      else peer.addTransceiver("audio", { direction: "sendrecv" });
      peer.onicecandidate = (event: any) => {
        if (event.candidate) currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-candidate", candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate } });
      };
      peer.ontrack = () => updateCount();
      peer.onconnectionstatechange = () => {
        if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
          peers.delete(remoteId);
          peers.get(remoteId)?.close?.();
          // Retry the handshake shortly; the room socket stays connected.
          if (!disposed) {
            const existingTimer = statusTimers.get(remoteId);
            if (existingTimer) clearTimeout(existingTimer);
            statusTimers.set(remoteId, setTimeout(() => {
              statusTimers.delete(remoteId);
              if (disposed || peers.has(remoteId)) return;
              currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-hello" } });
            }, 2_000));
          }
        }
        updateCount();
      };
      peers.set(remoteId, peer);
      return peer;
    };

    const sendOffer = async (remoteId: number) => {
      if (makingOffer.has(remoteId)) return;
      makingOffer.add(remoteId);
      try {
        const peer = ensurePeer(remoteId);
        if (peer.signalingState !== "stable") return;
        const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
        await peer.setLocalDescription(offer);
        currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-offer", description: offer } });
      } catch {
        // Ignore; the retry timer will try again.
      } finally {
        makingOffer.delete(remoteId);
      }
    };

    const onVoiceStatus = (payload: VoiceStatusPayload) => {
      const from = Number(payload?.memberId);
      if (!Number.isInteger(from) || from <= 0) return;
      if (payload.voiceChannel && payload.voiceChannel !== voiceChannel) {
        setSpeakingMap((previous) => {
          const next = new Map(previous);
          next.set(from, false);
          return next;
        });
        return;
      }
      setSpeakingMap((previous) => {
        const next = new Map(previous);
        next.set(from, readSpeaking(payload));
        return next;
      });
    };

    const onSignal = async (payload: { fromMemberId?: unknown; signal?: VoiceSignal }) => {
      const remoteId = Number(payload?.fromMemberId);
      const signal = payload?.signal;
      if (!Number.isInteger(remoteId) || remoteId <= 0 || remoteId === localId || !signal || disposed) return;
      const kind = signal.kind;
      if (kind === "voice-hello") {
        currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-ready" } });
        if (localId < remoteId) await sendOffer(remoteId);
        return;
      }
      if (kind === "voice-ready") {
        if (localId < remoteId) await sendOffer(remoteId);
        return;
      }
      if (kind === "voice-offer" && signal.description) {
        const peer = ensurePeer(remoteId);
        await peer.setRemoteDescription(new RTCSessionDescription(signal.description as any));
        const queued = pendingCandidates.get(remoteId) ?? [];
        pendingCandidates.delete(remoteId);
        for (const candidate of queued) await peer.addIceCandidate(new RTCIceCandidate(candidate));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-answer", description: answer } });
        return;
      }
      if (kind === "voice-answer" && signal.description) {
        const peer = peers.get(remoteId);
        if (peer) await peer.setRemoteDescription(new RTCSessionDescription(signal.description as any));
        return;
      }
      if (kind === "voice-candidate" && signal.candidate) {
        const peer = peers.get(remoteId);
        if (peer?.remoteDescription) await peer.addIceCandidate(new RTCIceCandidate(signal.candidate as any));
        else pendingCandidates.set(remoteId, [...(pendingCandidates.get(remoteId) ?? []), signal.candidate]);
      }
    };

    currentSocket.on?.("netplay:signal", onSignal);
    currentSocket.on?.("netplay:voice-status", onVoiceStatus);
    setStatus(t("voiceBuiltInReady"));
    // Announce presence so existing peers can greet us.
    const greetTimer = setTimeout(() => currentSocket.emit?.("netplay:signal", { signal: { kind: "voice-hello" } }), 600);

    return () => {
      disposed = true;
      clearTimeout(greetTimer);
      currentSocket.off?.("netplay:signal", onSignal);
      currentSocket.off?.("netplay:voice-status", onVoiceStatus);
      for (const timer of statusTimers.values()) clearTimeout(timer);
      statusTimers.clear();
      peers.forEach((peer: any) => peer.close?.());
      peers.clear();
      pendingCandidates.clear();
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      streamRef.current?.getTracks().forEach((track: any) => track.stop());
      streamRef.current = null;
      InCallManager.stop();
      AudioSession.stopAudioSession().catch(() => undefined);
    };
  }, [socket, memberId, voiceChannel, t]);

  // Push-to-talk release safety: never leave the mic hot.
  useEffect(() => {
    if (voiceMode === "ptt" && microphoneEnabled && !heartbeatRef.current) return;
    if (voiceMode === "ptt" && microphoneEnabled) void setMicEnabled(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceMode]);

  return (
    <VoiceControls
      microphoneEnabled={microphoneEnabled}
      speakerEnabled={speakerEnabled}
      voiceMode={voiceMode}
      voiceChannel={voiceChannel}
      connectedCount={connectedCount}
      status={status || t("voiceBuiltInReady")}
      onMicChange={setMicEnabled}
      onSpeakerChange={setSpeaker}
      onModeChange={(mode) => { setVoiceMode(mode); if (mode === "ptt") void setMicEnabled(false); }}
      onChannelChange={(channel) => { setVoiceChannel(channel); emitStatus({ voiceChannel: channel }); }}
      onPttPress={() => { void setMicEnabled(true); }}
      onPttRelease={() => { void setMicEnabled(false); }}
      speakingMembers={speakingMap}
      members={members}
      localMemberId={memberId}
    />
  );
}

export const RoomVoiceChat = forwardRef<RoomVoiceChatHandle, Props>(function RoomVoiceChat({ mediaToken: suppliedToken, socket, memberId, members, memberRole }: Props, ref) {
  const [mediaToken, setMediaToken] = useState<MediaToken | null | undefined>(suppliedToken);
  const builtInHandle = useRef<RoomVoiceChatHandle>({ setMicrophoneEnabled: async () => undefined });
  useImperativeHandle(ref, () => ({
    setMicrophoneEnabled: (enabled) => builtInHandle.current.setMicrophoneEnabled(enabled),
    setSpeakerEnabled: (enabled) => builtInHandle.current.setSpeakerEnabled?.(enabled) ?? Promise.resolve(),
    setVoiceMode: (mode) => builtInHandle.current.setVoiceMode?.(mode),
    setVoiceChannel: (channel) => builtInHandle.current.setVoiceChannel?.(channel),
  }), []);

  useEffect(() => {
    if (suppliedToken) { setMediaToken(suppliedToken); return; }
    const auth = readSocketAuth(socket);
    const roomId = Number(auth?.roomId);
    const authMemberId = Number(auth?.memberId ?? memberId);
    const memberToken = typeof auth?.memberToken === "string" ? auth.memberToken : "";
    if (!Number.isInteger(roomId) || roomId <= 0 || !Number.isInteger(authMemberId) || authMemberId <= 0 || memberToken.length < 20) {
      setMediaToken(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/trpc/rooms.mediaToken`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ json: { roomId, memberId: authMemberId, memberToken } }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const envelope = await response.json() as { result?: { data?: { json?: MediaToken } } };
        const token = envelope.result?.data?.json ?? null;
        if (!cancelled) setMediaToken(token && token.configured ? token : null);
      } catch {
        // The room service has no LiveKit credentials (404 in production):
        // fall back to the built-in peer-to-peer voice mesh instead of hiding voice.
        if (!cancelled) setMediaToken(null);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [suppliedToken, socket, memberId]);

  if (mediaToken?.configured && mediaToken.url && mediaToken.token) {
    return (
      <LiveKitRoom
        serverUrl={mediaToken.url}
        token={mediaToken.token}
        connect
        audio={false}
        video={false}
        options={{
          adaptiveStream: true,
          publishDefaults: {
            audioPreset: { maxBitrate: 64_000, priority: "high" } as any,
            dtx: true,
            red: true,
            forceStereo: false,
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          } as any,
          dynacast: true,
          stopLocalTrackOnUnpublish: false,
        }}
      >
        <LiveKitVoiceControls members={members} localMemberId={memberId} socket={socket} />
      </LiveKitRoom>
    );
  }

  // Built-in mesh is available whenever the room socket is present.
  return <BuiltInVoiceControls socket={socket} memberId={memberId} members={members} memberRole={memberRole} expose={(handle) => { builtInHandle.current = handle; }} />;
});

const styles = StyleSheet.create({
  card: { backgroundColor: "#160D29", borderWidth: 1, borderColor: "#4B3370", borderRadius: 18, padding: 14, marginTop: 16 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#DCA7FF", fontSize: 13, fontWeight: "900" },
  counter: { backgroundColor: "#27203A", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  counterText: { color: "#9EEBFF", fontSize: 10, fontWeight: "800" },
  status: { color: "#C5BDD3", fontSize: 11, marginTop: 6, lineHeight: 16 },
  modeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  modeLabel: { color: "#9BAFC4", fontSize: 10, fontWeight: "800", minWidth: 55 },
  modeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: "#231836", borderWidth: 1, borderColor: "#433054" },
  modeChipActive: { backgroundColor: "#5A2993", borderColor: "#B768FF" },
  modeChipText: { color: "#9BAFC4", fontSize: 10, fontWeight: "700" },
  modeChipTextActive: { color: "#FFFFFF", fontWeight: "900" },
  membersList: { marginTop: 12, backgroundColor: "#1A1230", borderRadius: 12, padding: 8, borderWidth: 1, borderColor: "#3A2A5A" },
  membersTitle: { color: "#7AE8FF", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  membersScroll: { marginTop: 6 },
  memberBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#231836", borderRadius: 14, paddingHorizontal: 8, paddingVertical: 5, marginRight: 6, borderWidth: 1, borderColor: "#433054", minWidth: 85 },
  memberSpeaking: { backgroundColor: "#2A4A2A", borderColor: "#48C78E" },
  memberLocal: { borderColor: "#B978FF" },
  speakingDot: { width: 8, height: 8, borderRadius: 4 },
  speakingDotActive: { backgroundColor: "#48C78E" },
  speakingDotMuted: { backgroundColor: "#555555" },
  memberName: { color: "#FFFFFF", fontSize: 10, fontWeight: "700", maxWidth: 60 },
  memberRole: { color: "#9BAFC4", fontSize: 8, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 7, marginTop: 12 },
  action: { flex: 1, minHeight: 48, borderRadius: 13, backgroundColor: "#231836", borderWidth: 1, borderColor: "#433054", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  actionActive: { backgroundColor: "#5A2993", borderColor: "#B768FF" },
  pttAction: { backgroundColor: "#3A1F0F", borderColor: "#8B5A2B" },
  pttActive: { backgroundColor: "#8B3A1A", borderColor: "#FF8C42", transform: [{ scale: 0.97 }] },
  actionLabel: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", textAlign: "center" },
  hint: { color: "#9086A6", fontSize: 10, lineHeight: 15, marginTop: 8 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
});
