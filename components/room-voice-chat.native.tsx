import { AudioSession, LiveKitRoom, registerGlobals, useConnectionState, useLocalParticipant, useParticipants } from "@livekit/react-native";
import { ConnectionState } from "livekit-client";
import { RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, mediaDevices } from "@livekit/react-native-webrtc";
import InCallManager from "react-native-incall-manager";
import { AppState, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { getApiBaseUrl } from "@/constants/oauth";
import { useLanguage } from "@/lib/language";

registerGlobals();

type VoiceMember = { id: number; displayName: string; role: "host" | "player" | "spectator" };
type MediaToken = { configured: boolean; url?: string; roomName?: string; token?: string; canPublish?: boolean; message?: string };
type VoiceChannel = "room" | "team";
export type RoomVoiceChatHandle = {
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setSpeakerEnabled?: (enabled: boolean) => Promise<void>;
  setVoiceChannel?: (channel: VoiceChannel) => void;
};
type SocketLike = { on?: (event: string, listener: (payload: any) => void) => unknown; off?: (event: string, listener?: (payload: any) => void) => unknown; emit?: (event: string, payload?: any) => unknown; connected?: boolean };
type Props = { mediaToken?: MediaToken | null; memberRole?: VoiceMember["role"]; socket?: unknown; isHost?: boolean; remoteOnline?: boolean; memberId?: number; members?: VoiceMember[] };
type VoiceStatusPayload = { memberId?: number; microphoneEnabled?: boolean; isSpeaking?: boolean; voiceChannel?: string };
type RoomSocketAuth = { roomId?: unknown; memberId?: unknown; memberToken?: unknown };
type VoiceSignal = { kind?: unknown; description?: unknown; candidate?: unknown };

/** ICE configuration.
 *
 * Voice on mobile networks fails without a relay: carrier NAT blocks direct
 * peer-to-peer paths, which is why calls connected and then dropped a couple
 * of minutes later. STUN alone is not enough — a TURN relay is required for
 * the fails; the endpoints can be overridden through build-time env vars.
 * (This mirrors how large-scale voice backends work: every client always has
 * a relayed path available.)
 */
const ENV_TURN_URL = process.env.EXPO_PUBLIC_TURN_URL ?? "";
const ENV_TURN_USERNAME = process.env.EXPO_PUBLIC_TURN_USERNAME ?? "";
const ENV_TURN_CREDENTIAL = process.env.EXPO_PUBLIC_TURN_CREDENTIAL ?? "";
const DEFAULT_TURN: { urls: string; username?: string; credential?: string }[] = [
  { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
];
const VOICE_ICE_SERVERS: RTCIceServerLike[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  ...(ENV_TURN_URL ? [{ urls: ENV_TURN_URL, username: ENV_TURN_USERNAME, credential: ENV_TURN_CREDENTIAL }] : []),
  ...(ENV_TURN_URL ? [] : DEFAULT_TURN),
];
type RTCIceServerLike = { urls: string; username?: string; credential?: string };

const MESH_HEALTH_INTERVAL_MS = 15_000;

function readSocketAuth(socket: unknown): RoomSocketAuth | null {
  if (!socket || typeof socket !== "object") return null;
  const auth = (socket as { auth?: unknown }).auth;
  return auth && typeof auth === "object" ? (auth as RoomSocketAuth) : null;
}

/** The production relay forwards microphoneEnabled/speakerEnabled/voiceChannel
 * and may drop isSpeaking, so an enabled microphone counts as voice activity. */
function readSpeaking(payload: VoiceStatusPayload): boolean {
  if (!payload?.microphoneEnabled) return false;
  return payload.isSpeaking === undefined ? true : Boolean(payload.isSpeaking);
}

function VoiceControls({
  onMicChange, onSpeakerChange, onChannelChange,
  microphoneEnabled, speakerEnabled, voiceChannel, connectedCount, status, speakingMembers, members, localMemberId,
}: {
  onMicChange: (enabled: boolean) => Promise<void>;
  onSpeakerChange: (enabled: boolean) => void;
  onChannelChange?: (channel: VoiceChannel) => void;
  microphoneEnabled: boolean;
  speakerEnabled: boolean;
  voiceChannel: VoiceChannel;
  connectedCount: number;
  status: string;
  speakingMembers?: Map<number, boolean>;
  members?: VoiceMember[];
  localMemberId?: number;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  const toggleMic = async () => {
    if (busy) return;
    setBusy(true);
    try { await onMicChange(!microphoneEnabled); } finally { setBusy(false); }
  };

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Text style={styles.title}>🎙️ {t("voice")}</Text>
        <View style={styles.counter}><Text style={styles.counterText}>{connectedCount} ONLINE</Text></View>
      </View>
      <Text style={styles.status}>{status}</Text>

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
          <Text style={styles.membersTitle}>VOICE ACTIVITY</Text>
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
        <Pressable disabled={busy} onPress={toggleMic} style={({ pressed }) => [styles.action, microphoneEnabled && styles.actionActive, pressed && styles.pressed]}>
          <Text style={styles.actionLabel}>{microphoneEnabled ? t("micOn") : t("micOff")}</Text>
        </Pressable>
        <Pressable onPress={() => onSpeakerChange(!speakerEnabled)} style={({ pressed }) => [styles.action, speakerEnabled && styles.actionActive, pressed && styles.pressed]}>
          <Text style={styles.actionLabel}>{speakerEnabled ? t("speakerOn") : t("speakerOff")}</Text>
        </Pressable>
      </View>
      {!speakerEnabled && <Text style={styles.hint}>{t("voiceSpeakerMuted")}</Text>}
    </View>
  );
}

/** LiveKit path: used only when the room service issues a media token. */
function LiveKitVoiceControls({ members, localMemberId, socket }: { members?: VoiceMember[]; localMemberId?: number; socket?: unknown }) {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const [speaker, setSpeaker] = useState(true);
  const [voiceChannel, setVoiceChannel] = useState<VoiceChannel>("room");
  const [speakingMap, setSpeakingMap] = useState<Map<number, boolean>>(new Map());
  const socketRef = useRef(socket as SocketLike | undefined);

  useEffect(() => { socketRef.current = socket as SocketLike | undefined; }, [socket]);

  const ensureAudioSession = () => {
    AudioSession.startAudioSession().catch(() => undefined);
    InCallManager.start({ media: "audio" });
    // Android keeps a connected wired/Bluetooth headset as the preferred route;
    // forcing the loudspeaker only decides the fallback when nothing is attached.
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

  // Speaking heartbeat (the relay may strip isSpeaking, mic-on is the signal).
  useEffect(() => {
    if (!isMicrophoneEnabled) return;
    const emitSpeaking = () => socketRef.current?.emit?.("netplay:voice-status", { microphoneEnabled: true, speakerEnabled: speaker, voiceChannel, isSpeaking: true });
    emitSpeaking();
    const timer = setInterval(emitSpeaking, 2_000);
    return () => clearInterval(timer);
  }, [isMicrophoneEnabled, speaker, voiceChannel]);

  const handleChannelChange = (channel: VoiceChannel) => {
    setVoiceChannel(channel);
    socketRef.current?.emit?.("netplay:voice-status", { microphoneEnabled: isMicrophoneEnabled, speakerEnabled: speaker, voiceChannel: channel });
  };

  // PUBG semantics: the speaker button mutes every incoming voice stream.
  const applySpeaker = (enabled: boolean) => {
    setSpeaker(enabled);
    ensureAudioSession();
    try {
      const { Room, RoomEvent } = require("livekit-client");
      void Room; void RoomEvent;
    } catch { /* optional */ }
    const publicationTracks = participants.flatMap((participant) => participant.audioTrackPublications ? [...participant.audioTrackPublications.values()] : []);
    for (const publication of publicationTracks) {
      const track = (publication as { track?: { mediaStreamTrack?: { enabled: boolean } } }).track;
      if (track?.mediaStreamTrack) track.mediaStreamTrack.enabled = enabled;
    }
  };

  return (
    <VoiceControls
      microphoneEnabled={isMicrophoneEnabled}
      speakerEnabled={speaker}
      voiceChannel={voiceChannel}
      connectedCount={Math.max(0, participants.length - 1)}
      status={connectionState === ConnectionState.Connected ? `LiveKit · ${voiceChannel}` : `Voice ${String(connectionState).toLowerCase()}…`}
      onMicChange={async (enabled) => {
        ensureAudioSession();
        await localParticipant.setMicrophoneEnabled(enabled);
        socketRef.current?.emit?.("netplay:voice-status", { microphoneEnabled: enabled, speakerEnabled: speaker, voiceChannel, isSpeaking: enabled });
      }}
      onSpeakerChange={applySpeaker}
      onChannelChange={handleChannelChange}
      speakingMembers={speakingMap}
      members={members}
      localMemberId={localMemberId}
    />
  );
}

/** Built-in voice: peer-to-peer WebRTC mesh over the room socket.
 *
 * Guaranteed path when the room service has no LiveKit credentials. It uses
 * only the events the relay forwards (netplay:signal, netplay:voice-status),
 * always offers a TURN relay for NAT traversal, restarts ICE when a peer
 * drops, and re-greets everyone when the app returns to the foreground. */
function BuiltInVoiceControls({ socket, memberId, members, memberRole, expose }: {
  socket?: unknown; memberId?: number; members?: VoiceMember[]; memberRole?: VoiceMember["role"];
  expose: (handle: RoomVoiceChatHandle) => void;
}) {
  const [voiceChannel, setVoiceChannel] = useState<VoiceChannel>("room");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const [connectedCount, setConnectedCount] = useState(0);
  const [speakingMap, setSpeakingMap] = useState<Map<number, boolean>>(new Map());
  const [status, setStatus] = useState("");

  const socketRef = useRef<SocketLike | undefined>(socket as SocketLike | undefined);
  const streamRef = useRef<any>(null);
  const peersRef = useRef<Map<number, any>>(new Map());
  const remoteTracksRef = useRef<Set<any>>(new Set());
  const pendingCandidatesRef = useRef<Map<number, any[]>>(new Map());
  const makingOfferRef = useRef<Set<number>>(new Set());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const channelRef = useRef<VoiceChannel>("room");
  const micRef = useRef(false);
  const speakerRef = useRef(true);
  const { t } = useLanguage();

  const localRole = memberRole ?? members?.find((member) => member.id === memberId)?.role;
  const isSpectator = localRole === "spectator";
  const canSpeak = !isSpectator || voiceChannel === "room";

  useEffect(() => { socketRef.current = socket as SocketLike | undefined; }, [socket]);
  useEffect(() => { channelRef.current = voiceChannel; }, [voiceChannel]);
  useEffect(() => { micRef.current = microphoneEnabled; }, [microphoneEnabled]);

  const emitStatus = () => {
    socketRef.current?.emit?.("netplay:voice-status", {
      microphoneEnabled: micRef.current,
      speakerEnabled: speakerRef.current,
      isSpeaking: micRef.current,
      voiceChannel: channelRef.current,
    });
  };

  const ensureAudioSession = () => {
    AudioSession.startAudioSession().catch(() => undefined);
    InCallManager.start({ media: "audio" });
    // A connected wired/Bluetooth headset keeps priority on Android; forcing the
    // loudspeaker only matters when nothing is attached (PUBG-like behaviour).
    InCallManager.setForceSpeakerphoneOn(true);
  };

  const applySpeaker = (enabled: boolean) => {
    setSpeakerEnabled(enabled);
    speakerRef.current = enabled;
    ensureAudioSession();
    // Speaker OFF = hear nothing at all (mute every incoming voice stream).
    for (const track of remoteTracksRef.current) {
      try { track.enabled = enabled; } catch { /* track may be closed */ }
    }
    emitStatus();
  };

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
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      } as unknown as Record<string, never>,
      video: false,
    });
    stream.getAudioTracks().forEach((track: any) => { track.enabled = false; });
    streamRef.current = stream;
    for (const peer of peersRef.current.values()) stream.getTracks().forEach((track: any) => peer.addTrack(track, stream));
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
    micRef.current = enabled;
    emitStatus();
    if (enabled) {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(emitStatus, 2_000);
    } else if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  useEffect(() => {
    expose({
      setMicrophoneEnabled: setMicEnabled,
      setSpeakerEnabled: async (enabled) => applySpeaker(enabled),
      setVoiceChannel: (channel) => { setVoiceChannel(channel); channelRef.current = channel; emitStatus(); },
    });
  });

  useEffect(() => {
    const currentSocket = socketRef.current;
    const localId = Number(memberId);
    const peers = peersRef.current;
    const remoteTracks = remoteTracksRef.current;
    const pendingCandidates = pendingCandidatesRef.current;
    const makingOffer = makingOfferRef.current;
    const retryTimers = retryTimersRef.current;
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
      const peer = new RTCPeerConnection({
        iceServers: VOICE_ICE_SERVERS as never,
        iceCandidatePoolSize: 4,
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require",
      });
      if (streamRef.current) streamRef.current.getTracks().forEach((track: any) => peer.addTrack(track, streamRef.current));
      else peer.addTransceiver("audio", { direction: "sendrecv" });
      peer.onicecandidate = (event: any) => {
        if (event.candidate) currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-candidate", candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate } });
      };
      peer.oniceconnectionstatechange = () => {
        // Carrier NAT and network switches break the path: restart ICE instead
        // of tearing the call down (this is what caused mid-session dropouts).
        if (peer.iceConnectionState === "failed" && !disposed) peer.restartIce?.();
      };
      peer.ontrack = (event: any) => {
        const stream = event.streams?.[0];
        const track = event.track;
        if (track) {
          track.enabled = speakerRef.current;
          remoteTracks.add(track);
        }
        void stream;
        updateCount();
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed" || peer.connectionState === "closed") {
          if (peers.get(remoteId) === peer) peers.delete(remoteId);
          try { peer.close(); } catch { /* already closed */ }
          if (!disposed) {
            const existingTimer = retryTimers.get(remoteId);
            if (existingTimer) clearTimeout(existingTimer);
            retryTimers.set(remoteId, setTimeout(() => {
              retryTimers.delete(remoteId);
              if (disposed || peers.has(remoteId)) return;
              currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-hello" } });
            }, 1_500));
          }
        }
        updateCount();
      };
      peers.set(remoteId, peer);
      return peer;
    };

    const sendOffer = async (remoteId: number, restart = false) => {
      if (makingOffer.has(remoteId)) return;
      makingOffer.add(remoteId);
      try {
        const peer = ensurePeer(remoteId);
        if (peer.signalingState !== "stable") return;
        if (restart) peer.restartIce?.();
        const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false, iceRestart: restart });
        await peer.setLocalDescription(offer);
        currentSocket.emit?.("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-offer", description: offer } });
      } catch {
        // The retry timer re-attempts.
      } finally {
        makingOffer.delete(remoteId);
      }
    };

    const onVoiceStatus = (payload: VoiceStatusPayload) => {
      const from = Number(payload?.memberId);
      if (!Number.isInteger(from) || from <= 0) return;
      const sameChannel = !payload.voiceChannel || payload.voiceChannel === channelRef.current;
      setSpeakingMap((previous) => {
        const next = new Map(previous);
        next.set(from, sameChannel ? readSpeaking(payload) : false);
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
        await peer.setRemoteDescription(new RTCSessionDescription(signal.description as never));
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
        if (peer && peer.signalingState !== "stable") await peer.setRemoteDescription(new RTCSessionDescription(signal.description as never));
        return;
      }
      if (kind === "voice-candidate" && signal.candidate) {
        const peer = peers.get(remoteId);
        if (peer?.remoteDescription) await peer.addIceCandidate(new RTCIceCandidate(signal.candidate as never));
        else pendingCandidates.set(remoteId, [...(pendingCandidates.get(remoteId) ?? []), signal.candidate]);
      }
    };

    currentSocket.on?.("netplay:signal", onSignal);
    currentSocket.on?.("netplay:voice-status", onVoiceStatus);
    setStatus(t("voiceBuiltInReady"));
    const greet = () => currentSocket.emit?.("netplay:signal", { signal: { kind: "voice-hello" } });
    const greetTimer = setTimeout(greet, 600);

    // Mesh health: if peers are expected but none is connected, re-greet.
    const healthTimer = setInterval(() => {
      if (disposed || !currentSocket.connected) return;
      const expected = Math.max(0, (members?.length ?? 1) - 1);
      const connected = Array.from(peers.values()).filter((peer: any) => peer.connectionState === "connected").length;
      if (expected > 0 && connected === 0) greet();
    }, MESH_HEALTH_INTERVAL_MS);

    // Coming back from the background: sockets may be stale and peers dropped.
    const appStateSubscription = AppState.addEventListener("change", (next) => {
      if (next !== "active" || disposed) return;
      ensureAudioSession();
      greet();
      for (const [remoteId, peer] of peers) {
        const anyPeer = peer as any;
        if (anyPeer.connectionState !== "connected") void sendOffer(remoteId, true);
      }
      emitStatus();
    });

    return () => {
      disposed = true;
      clearTimeout(greetTimer);
      clearInterval(healthTimer);
      appStateSubscription.remove();
      currentSocket.off?.("netplay:signal", onSignal);
      currentSocket.off?.("netplay:voice-status", onVoiceStatus);
      for (const timer of retryTimers.values()) clearTimeout(timer);
      retryTimers.clear();
      peers.forEach((peer: any) => peer.close?.());
      peers.clear();
      remoteTracks.clear();
      pendingCandidates.clear();
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      streamRef.current?.getTracks().forEach((track: any) => track.stop());
      streamRef.current = null;
      InCallManager.stop();
      AudioSession.stopAudioSession().catch(() => undefined);
    };
  }, [socket, memberId, t]);

  return (
    <VoiceControls
      microphoneEnabled={microphoneEnabled}
      speakerEnabled={speakerEnabled}
      voiceChannel={voiceChannel}
      connectedCount={connectedCount}
      status={status || t("voiceBuiltInReady")}
      onMicChange={setMicEnabled}
      onSpeakerChange={applySpeaker}
      onChannelChange={(channel) => { setVoiceChannel(channel); channelRef.current = channel; emitStatus(); }}
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
            audioPreset: { maxBitrate: 64_000, priority: "high" } as never,
            dtx: true,
            red: true,
            forceStereo: false,
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          } as never,
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
  actionLabel: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", textAlign: "center" },
  hint: { color: "#9086A6", fontSize: 10, lineHeight: 15, marginTop: 8 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
});
