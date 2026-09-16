import { AudioSession, LiveKitRoom, registerGlobals, useConnectionState, useLocalParticipant, useParticipants } from "@livekit/react-native";
import { ConnectionState } from "livekit-client";
import { RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, mediaDevices } from "@livekit/react-native-webrtc";
import InCallManager from "react-native-incall-manager";
import { AppState, PermissionsAndroid, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/language";

registerGlobals();

type VoiceMember = { id: number; displayName: string; role: "host" | "player" | "spectator" };
type MediaToken = { configured: boolean; url?: string; roomName?: string; token?: string; canPublish?: boolean; message?: string };
type VoiceChannel = "room" | "team";
export type RoomVoiceChatHandle = { setMicrophoneEnabled: (enabled: boolean) => Promise<void>; setSpeakerEnabled?: (enabled: boolean) => Promise<void>; setVoiceChannel?: (channel: VoiceChannel) => void };
type Props = { mediaToken?: MediaToken | null; memberRole?: VoiceMember["role"]; socket?: unknown; memberId?: number; members?: VoiceMember[] };
type SocketLike = { on?: (event: string, listener: (payload: any) => void) => unknown; off?: (event: string, listener?: (payload: any) => void) => unknown; emit?: (event: string, payload?: any) => unknown; connected?: boolean };
type Signal = { kind?: string; description?: any; candidate?: any };

const TURN_URL = process.env.EXPO_PUBLIC_TURN_URL ?? "";
const TURN_USER = process.env.EXPO_PUBLIC_TURN_USERNAME ?? "";
const TURN_CREDENTIAL = process.env.EXPO_PUBLIC_TURN_CREDENTIAL ?? "";
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  ...(TURN_URL ? [{ urls: TURN_URL, username: TURN_USER, credential: TURN_CREDENTIAL }] : []),
];

function AudioSessionGuard() {
  useEffect(() => {
    const start = () => {
      AudioSession.startAudioSession().catch(() => undefined);
      InCallManager.start({ media: "audio" });
      InCallManager.setForceSpeakerphoneOn(true);
    };
    start();
    return () => { InCallManager.stop(); AudioSession.stopAudioSession().catch(() => undefined); };
  }, []);
  return null;
}

function VoiceControls({ microphoneEnabled, speakerEnabled, channel, connectedCount, status, members, localMemberId, onMic, onSpeaker, onChannel }: {
  microphoneEnabled: boolean; speakerEnabled: boolean; channel: VoiceChannel; connectedCount: number; status: string;
  members?: VoiceMember[]; localMemberId?: number; onMic: (enabled: boolean) => Promise<void>; onSpeaker: (enabled: boolean) => void; onChannel: (channel: VoiceChannel) => void;
}) {
  const { t } = useLanguage();
  return <View style={styles.card}>
    <View style={styles.heading}><Text style={styles.title}>🎙️ {t("voice")}</Text><Text style={styles.online}>{connectedCount} ONLINE</Text></View>
    <Text style={styles.status}>{status}</Text>
    <View style={styles.row}>
      <Pressable onPress={() => onChannel("room")} style={[styles.chip, channel === "room" && styles.active]}><Text style={styles.chipText}>🌍 {t("voiceChannelRoom")}</Text></Pressable>
      <Pressable onPress={() => onChannel("team")} style={[styles.chip, channel === "team" && styles.active]}><Text style={styles.chipText}>👥 {t("voiceChannelTeam")}</Text></Pressable>
    </View>
    <View style={styles.row}>
      <Pressable onPress={() => void onMic(!microphoneEnabled)} style={[styles.action, microphoneEnabled && styles.active]}><Text style={styles.actionText}>{microphoneEnabled ? t("micOn") : t("micOff")}</Text></Pressable>
      <Pressable onPress={() => onSpeaker(!speakerEnabled)} style={[styles.action, speakerEnabled && styles.active]}><Text style={styles.actionText}>{speakerEnabled ? t("speakerOn") : t("speakerOff")}</Text></Pressable>
    </View>
    {members && members.length > 0 && <Text style={styles.members}>{members.map((m) => m.id === localMemberId ? `${m.displayName} (YOU)` : m.displayName).join(" · ")}</Text>}
  </View>;
}

function LiveKitControls({ members, localMemberId, socket }: { members?: VoiceMember[]; localMemberId?: number; socket?: unknown }) {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const state = useConnectionState();
  const [speaker, setSpeaker] = useState(true);
  const [channel, setChannel] = useState<VoiceChannel>("room");
  const sock = socket as SocketLike | undefined;
  const audio = () => { AudioSession.startAudioSession().catch(() => undefined); InCallManager.start({ media: "audio" }); InCallManager.setForceSpeakerphoneOn(true); };
  useEffect(() => { audio(); return () => { InCallManager.stop(); AudioSession.stopAudioSession().catch(() => undefined); }; }, []);
  useEffect(() => {
    if (!isMicrophoneEnabled) return;
    const beat = () => sock?.emit?.("netplay:voice-status", { microphoneEnabled: true, speakerEnabled: speaker, voiceChannel: channel, isSpeaking: true });
    beat(); const timer = setInterval(beat, 2000); return () => clearInterval(timer);
  }, [isMicrophoneEnabled, speaker, channel]);
  const mic = async (enabled: boolean) => { audio(); await localParticipant.setMicrophoneEnabled(enabled); sock?.emit?.("netplay:voice-status", { microphoneEnabled: enabled, speakerEnabled: speaker, voiceChannel: channel, isSpeaking: enabled }); };
  const speakerToggle = (enabled: boolean) => { audio(); setSpeaker(enabled); };
  return <VoiceControls microphoneEnabled={isMicrophoneEnabled} speakerEnabled={speaker} channel={channel} connectedCount={Math.max(0, participants.length - 1)} status={state === ConnectionState.Connected ? `LiveKit · ${channel}` : `Voice ${String(state).toLowerCase()}…`} members={members} localMemberId={localMemberId} onMic={mic} onSpeaker={speakerToggle} onChannel={(next) => { setChannel(next); sock?.emit?.("netplay:voice-status", { microphoneEnabled: isMicrophoneEnabled, speakerEnabled: speaker, voiceChannel: next }); }} />;
}

function BuiltInVoice({ socket, memberId, members }: { socket?: unknown; memberId?: number; members?: VoiceMember[] }) {
  const { t } = useLanguage();
  const socketRef = useRef(socket as SocketLike | undefined);
  const streamRef = useRef<any>(null);
  const peersRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const retryRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const makingOfferRef = useRef<Set<number>>(new Set());
  const [mic, setMic] = useState(false);
  const micRef = useRef(false);
  const [speaker, setSpeaker] = useState(true);
  const speakerRef = useRef(true);
  const [channel, setChannel] = useState<VoiceChannel>("room");
  const channelRef = useRef<VoiceChannel>("room");
  const [connected, setConnected] = useState(0);
  const [status, setStatus] = useState(t("voiceBuiltInReady"));
  const disposedRef = useRef(false);
  const candidateQueue = useRef<Map<number, any[]>>(new Map());

  useEffect(() => { socketRef.current = socket as SocketLike | undefined; }, [socket]);
  useEffect(() => { micRef.current = mic; }, [mic]);
  useEffect(() => { speakerRef.current = speaker; }, [speaker]);
  useEffect(() => { channelRef.current = channel; }, [channel]);

  const emit = (event: string, payload?: any) => socketRef.current?.emit?.(event, payload);
  const refreshCount = () => setConnected([...peersRef.current.values()].filter((p) => p.connectionState === "connected").length);
  const greet = () => emit("netplay:signal", { signal: { kind: "voice-hello" } });

  const ensureStream = async () => {
    if (streamRef.current) return streamRef.current;
    if (Platform.OS === "android") {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (result !== PermissionsAndroid.RESULTS.GRANTED) throw new Error("microphone-permission-denied");
    }
    const stream = await mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } as any, video: false });
    stream.getAudioTracks().forEach((track: any) => { track.enabled = false; });
    streamRef.current = stream;
    for (const peer of peersRef.current.values()) for (const track of stream.getTracks()) peer.addTrack(track, stream);
    AudioSession.startAudioSession().catch(() => undefined); InCallManager.start({ media: "audio" }); InCallManager.setForceSpeakerphoneOn(true);
    return stream;
  };

  const scheduleOffer = (remoteId: number, restart = false) => {
    const old = retryRef.current.get(remoteId); if (old) clearTimeout(old);
    retryRef.current.set(remoteId, setTimeout(() => { retryRef.current.delete(remoteId); void sendOffer(remoteId, restart); }, restart ? 250 : 100));
  };

  const ensurePeer = (remoteId: number) => {
    const existing = peersRef.current.get(remoteId); if (existing) return existing;
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS as any, iceCandidatePoolSize: 4, bundlePolicy: "max-bundle", rtcpMuxPolicy: "require" });
    if (streamRef.current) for (const track of streamRef.current.getTracks()) peer.addTrack(track, streamRef.current);
    else peer.addTransceiver("audio", { direction: "sendrecv" });
    peer.onicecandidate = (e: any) => { if (e.candidate) emit("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-candidate", candidate: e.candidate.toJSON?.() ?? e.candidate } }); };
    peer.onconnectionstatechange = () => {
      refreshCount();
      if (peer.connectionState === "connected") setStatus(t("voiceBuiltInReady"));
      if ((peer.connectionState === "failed" || peer.connectionState === "disconnected") && !disposedRef.current) scheduleOffer(remoteId, true);
      if (peer.connectionState === "closed" && peersRef.current.get(remoteId) === peer) peersRef.current.delete(remoteId);
    };
    peer.oniceconnectionstatechange = () => {
      if ((peer.iceConnectionState === "failed" || peer.iceConnectionState === "disconnected") && !disposedRef.current) scheduleOffer(remoteId, true);
    };
    peer.ontrack = (e: any) => { const track = e.track; if (track) track.enabled = speakerRef.current; refreshCount(); };
    peersRef.current.set(remoteId, peer);
    return peer;
  };

  const sendOffer = async (remoteId: number, restart = false) => {
    if (disposedRef.current || makingOfferRef.current.has(remoteId)) return;
    const peer = ensurePeer(remoteId);
    if (peer.signalingState !== "stable") return;
    makingOfferRef.current.add(remoteId);
    try {
      const offer = await peer.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false, iceRestart: restart });
      await peer.setLocalDescription(offer);
      emit("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-offer", description: offer } });
    } catch { /* retry on connection-state change */ } finally { makingOfferRef.current.delete(remoteId); }
  };

  useEffect(() => {
    const sock = socketRef.current; const localId = Number(memberId); if (!sock?.on || !Number.isInteger(localId) || localId <= 0) return;
    disposedRef.current = false;
    const onSignal = async (payload: any) => {
      const remoteId = Number(payload?.fromMemberId); const signal = payload?.signal as Signal | undefined;
      if (!Number.isInteger(remoteId) || remoteId <= 0 || remoteId === localId || !signal || disposedRef.current) return;
      if (signal.kind === "voice-hello") { emit("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-ready" } }); if (localId < remoteId) scheduleOffer(remoteId); return; }
      if (signal.kind === "voice-ready") { if (localId < remoteId) scheduleOffer(remoteId); return; }
      const peer = ensurePeer(remoteId);
      if (signal.kind === "voice-offer" && signal.description) {
        await peer.setRemoteDescription(new RTCSessionDescription(signal.description as any));
        for (const c of candidateQueue.current.get(remoteId) ?? []) await peer.addIceCandidate(new RTCIceCandidate(c));
        candidateQueue.current.delete(remoteId);
        const answer = await peer.createAnswer(); await peer.setLocalDescription(answer);
        emit("netplay:signal", { targetMemberId: remoteId, signal: { kind: "voice-answer", description: answer } }); return;
      }
      if (signal.kind === "voice-answer" && signal.description && peer.signalingState !== "stable") { await peer.setRemoteDescription(new RTCSessionDescription(signal.description as any)); return; }
      if (signal.kind === "voice-candidate" && signal.candidate) {
        if (peer.remoteDescription) await peer.addIceCandidate(new RTCIceCandidate(signal.candidate as any));
        else candidateQueue.current.set(remoteId, [...(candidateQueue.current.get(remoteId) ?? []), signal.candidate]);
      }
    };
    const onConnect = () => { greet(); for (const id of peersRef.current.keys()) scheduleOffer(id, true); };
    sock.on("netplay:signal", onSignal); sock.on("connect", onConnect);
    const timer = setInterval(() => {
      if (!sock.connected || disposedRef.current) return;
      const expected = Math.max(0, (members?.length ?? 1) - 1);
      const live = [...peersRef.current.values()].filter((p) => p.connectionState === "connected").length;
      if (expected > 0 && live < expected) greet();
      for (const [id, peer] of peersRef.current) if (peer.connectionState === "disconnected" || peer.iceConnectionState === "disconnected" || peer.iceConnectionState === "failed") scheduleOffer(id, true);
    }, 5000);
    const app = AppState.addEventListener("change", (state) => { if (state === "active") { greet(); for (const id of peersRef.current.keys()) scheduleOffer(id, true); } });
    greet();
    return () => { disposedRef.current = true; clearInterval(timer); app.remove(); sock.off?.("netplay:signal", onSignal); sock.off?.("connect", onConnect); for (const timer of retryRef.current.values()) clearTimeout(timer); retryRef.current.clear(); for (const peer of peersRef.current.values()) peer.close(); peersRef.current.clear(); candidateQueue.current.clear(); streamRef.current?.getTracks().forEach((track: any) => track.stop()); streamRef.current = null; InCallManager.stop(); AudioSession.stopAudioSession().catch(() => undefined); };
  }, [socket, memberId, members?.length]);

  const onMic = async (enabled: boolean) => {
    if (enabled) { try { await ensureStream(); } catch { setStatus(t("voiceMicPermission")); return; } }
    streamRef.current?.getAudioTracks().forEach((track: any) => { track.enabled = enabled; });
    setMic(enabled); micRef.current = enabled;
    emit("netplay:voice-status", { microphoneEnabled: enabled, speakerEnabled: speakerRef.current, voiceChannel: channelRef.current, isSpeaking: enabled });
  };
  const onSpeaker = (enabled: boolean) => { setSpeaker(enabled); speakerRef.current = enabled; emit("netplay:voice-status", { microphoneEnabled: micRef.current, speakerEnabled: enabled, voiceChannel: channelRef.current }); };
  const onChannel = (next: VoiceChannel) => { setChannel(next); channelRef.current = next; emit("netplay:voice-status", { microphoneEnabled: micRef.current, speakerEnabled: speakerRef.current, voiceChannel: next }); };

  return <><AudioSessionGuard /><VoiceControls microphoneEnabled={mic} speakerEnabled={speaker} channel={channel} connectedCount={connected} status={status} members={members} localMemberId={memberId} onMic={onMic} onSpeaker={onSpeaker} onChannel={onChannel} /></>;
}

export const RoomVoiceChat = ({ mediaToken, memberId, members, socket }: Props) => {
  if (mediaToken?.configured && mediaToken.url && mediaToken.token) return <LiveKitRoom serverUrl={mediaToken.url} token={mediaToken.token} connect audio={false} video={false} options={{ adaptiveStream: true, dynacast: true, publishDefaults: { dtx: true, red: true, forceStereo: false, autoGainControl: true, echoCancellation: true, noiseSuppression: true } as never, stopLocalTrackOnUnpublish: false }}><LiveKitControls members={members} localMemberId={memberId} socket={socket} /></LiveKitRoom>;
  return <BuiltInVoice socket={socket} memberId={memberId} members={members} />;
};

const styles = StyleSheet.create({
  card: { backgroundColor: "#160D29", borderWidth: 1, borderColor: "#4B3370", borderRadius: 18, padding: 14, marginTop: 16 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#DCA7FF", fontSize: 13, fontWeight: "900" }, online: { color: "#9EEBFF", fontSize: 10, fontWeight: "800" }, status: { color: "#C5BDD3", fontSize: 11, marginTop: 6, lineHeight: 16 },
  row: { flexDirection: "row", gap: 7, marginTop: 10 }, chip: { flex: 1, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: "#231836", borderWidth: 1, borderColor: "#433054" }, active: { backgroundColor: "#5A2993", borderColor: "#B768FF" }, chipText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800", textAlign: "center" },
  action: { flex: 1, minHeight: 46, borderRadius: 13, backgroundColor: "#231836", borderWidth: 1, borderColor: "#433054", alignItems: "center", justifyContent: "center" }, actionText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" }, members: { color: "#9086A6", fontSize: 10, marginTop: 9, lineHeight: 15 },
});
