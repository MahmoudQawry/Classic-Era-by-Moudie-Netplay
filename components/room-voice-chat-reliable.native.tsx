import { AudioSession, registerGlobals } from "@livekit/react-native";
import InCallManager from "react-native-incall-manager";
import {
  mediaDevices,
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  type MediaStream,
  type RTCPeerConnection as RTCPeerConnectionType,
} from "@livekit/react-native-webrtc";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import type { Socket } from "socket.io-client";
import { useLanguage } from "@/lib/language";

registerGlobals();

type VoiceMember = { id: number; displayName: string; role: "host" | "player" | "spectator" };
export type RoomVoiceChatHandle = { setMicrophoneEnabled: (enabled: boolean) => Promise<void>; setSpeakerEnabled?: (enabled: boolean) => Promise<void> };
type MediaToken = { configured: boolean; url?: string; roomName?: string; token?: string; canPublish?: boolean; message?: string };
type VoiceSignal = { kind?: string; description?: { type?: string; sdp?: string } | null; candidate?: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null } | null };
type Props = { memberId?: number; members?: VoiceMember[]; memberRole?: VoiceMember["role"]; mediaToken?: MediaToken | null; teamMediaToken?: MediaToken | null; onChatPress?: () => void; socket?: Socket | null; isHost?: boolean; remoteOnline?: boolean };

const STUN_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export const RoomVoiceChat = forwardRef<RoomVoiceChatHandle, Props>(function RoomVoiceChat(
  { memberId, members = [], memberRole, mediaToken, teamMediaToken, onChatPress, socket },
  ref,
) {
  const { t } = useLanguage();
  const roomRef = useRef<Room | null>(null);
  const fallbackPeers = useRef(new Map<number, RTCPeerConnectionType>());
  const localStream = useRef<MediaStream | null>(null);
  const [microphoneEnabled, setMicrophoneEnabledState] = useState(false);
  const [speakerEnabled, setSpeakerEnabledState] = useState(true);
  const [voiceChannel, setVoiceChannel] = useState<"room" | "team">("room");
  const [voiceMode, setVoiceMode] = useState<"open" | "ptt">("open");
  const [status, setStatus] = useState("VOICE CONNECTING");
  const [participantCount, setParticipantCount] = useState(0);
  const [speakingCount, setSpeakingCount] = useState(0);

  const selectedToken = voiceChannel === "team" ? teamMediaToken : mediaToken;
  const selectedTokenKey = selectedToken?.token ?? "";
  const selectedUrl = selectedToken?.url ?? "";
  const liveKitAvailable = Boolean(selectedToken?.configured && selectedToken.token && selectedUrl);

  const applySpeaker = (enabled: boolean) => {
    try {
      InCallManager.start({ media: "audio", auto: true });
      InCallManager.setForceSpeakerphoneOn(enabled);
      InCallManager.setSpeakerphoneOn(enabled);
    } catch {}
  };

  const sendSignal = (targetMemberId: number, signal: VoiceSignal) => {
    if (!socket?.connected || !memberId || targetMemberId === memberId) return;
    socket.emit("voice:signal", { targetMemberId, signal });
  };

  const createFallbackPeer = async (remote: VoiceMember, initiate: boolean) => {
    if (!memberId || remote.id === memberId || fallbackPeers.current.has(remote.id)) return;
    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    fallbackPeers.current.set(remote.id, pc);
    pc.onicecandidate = (event: any) => {
      const candidate = event?.candidate;
      if (candidate) sendSignal(remote.id, { kind: "voice-candidate", candidate: { candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex } });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("VOICE CONNECTED");
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        fallbackPeers.current.delete(remote.id);
        try { pc.close(); } catch {}
        setStatus("VOICE CONNECTION RETRYING");
      }
    };
    pc.ontrack = () => setStatus("VOICE CONNECTED");
    const stream = localStream.current;
    if (stream) stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));
    else pc.addTransceiver("audio", { direction: "recvonly" });
    if (initiate) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(remote.id, { kind: "voice-offer", description: { type: offer.type, sdp: offer.sdp ?? "" } });
    }
  };

  const connectFallback = async () => {
    if (!socket || !memberId) { setStatus("VOICE SIGNALING UNAVAILABLE"); return; }
    setStatus("VOICE FALLBACK");
    const peers = members.filter((member) => member.id !== memberId);
    for (const remote of peers) {
      await createFallbackPeer(remote, memberId < remote.id).catch(() => setStatus("VOICE CONNECTION RETRYING"));
      sendSignal(remote.id, { kind: "voice-hello" });
    }
    setParticipantCount(peers.length + 1);
  };

  const disconnectFallback = () => {
    for (const pc of fallbackPeers.current.values()) { try { pc.close(); } catch {} }
    fallbackPeers.current.clear();
    localStream.current?.getTracks().forEach((track) => track.stop());
    localStream.current = null;
  };

  const ensureLocalStream = async () => {
    if (localStream.current) return localStream.current;
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getAudioTracks().forEach((track) => { track.enabled = microphoneEnabled; });
    localStream.current = stream;
    for (const [remoteId, pc] of fallbackPeers.current) {
      for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);
      sendSignal(remoteId, { kind: "voice-offer", description: { type: offer.type, sdp: offer.sdp ?? "" } });
    }
    return stream;
  };

  const handleFallbackSignal = async (fromMemberId: number, signal: VoiceSignal) => {
    if (!memberId || fromMemberId === memberId) return;
    const remote = members.find((member) => member.id === fromMemberId);
    if (!remote) return;
    if (signal.kind === "voice-hello") {
      if (memberId < fromMemberId) {
        if (!fallbackPeers.current.has(fromMemberId)) await createFallbackPeer(remote, true);
      } else if (!fallbackPeers.current.has(fromMemberId)) await createFallbackPeer(remote, false);
      return;
    }
    let pc = fallbackPeers.current.get(fromMemberId);
    if (!pc) { await createFallbackPeer(remote, false); pc = fallbackPeers.current.get(fromMemberId); }
    if (!pc) return;
    if (signal.kind === "voice-offer" && signal.description?.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: signal.description.type === "answer" ? "answer" : "offer", sdp: signal.description.sdp }));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(fromMemberId, { kind: "voice-answer", description: { type: answer.type, sdp: answer.sdp ?? "" } });
    } else if (signal.kind === "voice-answer" && signal.description?.sdp) {
      await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: signal.description.sdp }));
    } else if (signal.kind === "voice-candidate" && signal.candidate?.candidate) {
      await pc.addIceCandidate(new RTCIceCandidate({ candidate: signal.candidate.candidate, sdpMid: signal.candidate.sdpMid ?? undefined, sdpMLineIndex: signal.candidate.sdpMLineIndex ?? undefined }));
    }
  };

  const connectLiveKit = async () => {
    if (!liveKitAvailable) return false;
    try {
      await AudioSession.startAudioSession();
      const room = new Room({ adaptiveStream: false, dynacast: false });
      roomRef.current = room;
      const updateParticipants = () => { setParticipantCount(room.numParticipants); setSpeakingCount(room.activeSpeakers.length); };
      room.on(RoomEvent.ParticipantConnected, updateParticipants);
      room.on(RoomEvent.ParticipantDisconnected, updateParticipants);
      room.on(RoomEvent.ActiveSpeakersChanged, updateParticipants);
      room.on(RoomEvent.Reconnecting, () => setStatus("VOICE RECONNECTING"));
      room.on(RoomEvent.Reconnected, () => { updateParticipants(); setStatus("VOICE CONNECTED"); });
      room.on(RoomEvent.Disconnected, () => { updateParticipants(); setStatus("VOICE DISCONNECTED"); });
      room.on(RoomEvent.MediaDevicesError, () => setStatus("MICROPHONE DEVICE ERROR"));
      await room.connect(selectedUrl, selectedToken!.token!);
      updateParticipants();
      applySpeaker(speakerEnabled);
      setStatus("VOICE CONNECTED");
      if (microphoneEnabled && selectedToken?.canPublish !== false) await room.localParticipant.setMicrophoneEnabled(true);
      return true;
    } catch {
      try { await roomRef.current?.disconnect(); } catch {}
      roomRef.current = null;
      return false;
    }
  };

  const connectVoice = async () => {
    if (await connectLiveKit()) return;
    await connectFallback();
  };

  const disconnectVoice = async () => {
    try { await roomRef.current?.disconnect(); } catch {}
    roomRef.current = null;
    disconnectFallback();
    setParticipantCount(0);
    setSpeakingCount(0);
  };

  const enableMicrophone = async (enabled: boolean) => {
    setMicrophoneEnabledState(enabled);
    try {
      if (roomRef.current && liveKitAvailable) {
        if (selectedToken?.canPublish === false) throw new Error("VOICE CHANNEL IS LISTEN-ONLY");
        await roomRef.current.localParticipant.setMicrophoneEnabled(enabled);
      } else {
        const stream = await ensureLocalStream();
        stream.getAudioTracks().forEach((track) => { track.enabled = enabled; });
      }
      applySpeaker(speakerEnabled);
      setStatus(enabled ? "MICROPHONE ON" : "MICROPHONE OFF");
    } catch (error) {
      setMicrophoneEnabledState(false);
      setStatus(error instanceof Error ? error.message : "MICROPHONE FAILED");
    }
  };

  const toggleSpeaker = async (enabled: boolean) => {
    setSpeakerEnabledState(enabled);
    applySpeaker(enabled);
    setStatus(enabled ? "SPEAKER ON" : "SPEAKER MUTED");
  };

  useImperativeHandle(ref, () => ({ setMicrophoneEnabled: enableMicrophone, setSpeakerEnabled: toggleSpeaker }));

  useEffect(() => {
    let cancelled = false;
    const signalHandler = (payload: { fromMemberId?: number; signal?: VoiceSignal }) => {
      if (payload?.fromMemberId && payload.signal && !cancelled) void handleFallbackSignal(payload.fromMemberId, payload.signal);
    };
    socket?.on("voice:signal", signalHandler);
    void (async () => {
      await disconnectVoice();
      if (cancelled) return;
      await connectVoice();
    })();
    return () => {
      cancelled = true;
      socket?.off("voice:signal", signalHandler);
      void disconnectVoice();
      void AudioSession.stopAudioSession();
      try { InCallManager.stop(); } catch {}
    };
  }, [selectedTokenKey, selectedUrl, voiceChannel, socket, members.map((m) => m.id).join(",")]);

  const selectChannel = async (channel: "room" | "team") => {
    if (channel === "team" && liveKitAvailable && (!teamMediaToken?.configured || !teamMediaToken.token)) {
      setStatus(memberRole === "spectator" ? "TEAM VOICE IS FOR PLAYERS ONLY" : "TEAM VOICE NOT CONFIGURED");
      return;
    }
    setVoiceChannel(channel);
  };

  const pttPressIn = () => { if (voiceMode === "ptt") void enableMicrophone(true); };
  const pttPressOut = () => { if (voiceMode === "ptt") void enableMicrophone(false); };

  return (
    <View style={styles.card}>
      <View style={styles.heading}><Text style={styles.title}>🎙️ {t("voice")}</Text><Text style={styles.online}>{participantCount} PEERS</Text></View>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.speakers}>{speakingCount} SPEAKING · {voiceChannel.toUpperCase()} CHANNEL</Text>
      <View style={styles.row}>
        <Pressable onPressIn={pttPressIn} onPressOut={pttPressOut} onPress={voiceMode === "open" ? () => void enableMicrophone(!microphoneEnabled) : undefined} style={[styles.action, microphoneEnabled && styles.active]}><Text style={styles.actionText}>{voiceMode === "ptt" ? "HOLD TO TALK" : microphoneEnabled ? t("micOn") : t("micOff")}</Text></Pressable>
        <Pressable onPress={() => void toggleSpeaker(!speakerEnabled)} style={[styles.action, speakerEnabled && styles.active]}><Text style={styles.actionText}>{speakerEnabled ? t("speakerOn") : t("speakerOff")}</Text></Pressable>
        <Pressable onPress={() => setVoiceMode((mode) => mode === "open" ? "ptt" : "open")} style={[styles.action, voiceMode === "ptt" && styles.active]}><Text style={styles.actionText}>{voiceMode === "ptt" ? "PTT" : "OPEN"}</Text></Pressable>
        <Pressable onPress={() => void selectChannel(voiceChannel === "room" ? "team" : "room")} style={[styles.action, voiceChannel === "team" && styles.active]}><Text style={styles.actionText}>{voiceChannel === "team" ? "TEAM" : "ROOM"}</Text></Pressable>
        {onChatPress ? <Pressable onPress={onChatPress} style={styles.action}><Text style={styles.actionText}>{t("roomChat")}</Text></Pressable> : null}
      </View>
      <View style={styles.memberList}>{members.map((member) => <View key={member.id} style={styles.memberRow}><Text style={styles.memberName}>{member.displayName}</Text><Text style={styles.memberRole}>{member.role.toUpperCase()}</Text></View>)}</View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: "rgba(10, 17, 31, 0.90)", borderWidth: 1, borderColor: "#28506B", borderRadius: 20, padding: 14, marginTop: 16 },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: "#F4FBFF", fontSize: 16, fontWeight: "900" },
  online: { color: "#6FE8FF", fontSize: 10, fontWeight: "900" },
  status: { color: "#92D9EA", fontSize: 10, fontWeight: "900", marginTop: 6 },
  speakers: { color: "#9AAFC3", fontSize: 9, fontWeight: "800", marginTop: 3 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 },
  action: { minHeight: 37, paddingHorizontal: 10, borderRadius: 12, backgroundColor: "#13233A", borderWidth: 1, borderColor: "#2D5573", alignItems: "center", justifyContent: "center" },
  active: { backgroundColor: "#233E5B", borderColor: "#62E8FF" },
  actionText: { color: "#EAF8FF", fontSize: 9, fontWeight: "900" },
  memberList: { marginTop: 12, gap: 7 },
  memberRow: { minHeight: 32, borderRadius: 10, backgroundColor: "#0E1829", paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  memberName: { color: "#F4F7FB", fontSize: 11, fontWeight: "800" },
  memberRole: { color: "#7EA8C0", fontSize: 8, fontWeight: "900" },
});
