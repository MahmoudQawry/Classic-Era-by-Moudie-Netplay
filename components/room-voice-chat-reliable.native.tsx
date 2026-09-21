import { AudioSession, registerGlobals } from "@livekit/react-native";
import InCallManager from "react-native-incall-manager";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import { useLanguage } from "@/lib/language";

registerGlobals();

type VoiceMember = { id: number; displayName: string; role: "host" | "player" | "spectator" };

export type RoomVoiceChatHandle = {
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setSpeakerEnabled?: (enabled: boolean) => Promise<void>;
};

type MediaToken = {
  configured: boolean;
  url?: string;
  roomName?: string;
  token?: string;
  canPublish?: boolean;
  message?: string;
};

type Props = {
  memberId?: number;
  members?: VoiceMember[];
  memberRole?: VoiceMember["role"];
  mediaToken?: MediaToken | null;
  teamMediaToken?: MediaToken | null;
  onChatPress?: () => void;
};

/**
 * Production voice path.
 *
 * Voice media is deliberately handled by LiveKit SFU rather than a peer-to-peer
 * mesh. Socket.IO remains the control plane for room presence/chat/NetPlay.
 * The room token and team token are separate authorization boundaries issued by
 * the Express backend.
 */
export const RoomVoiceChat = forwardRef<RoomVoiceChatHandle, Props>(function RoomVoiceChat(
  { memberRole, mediaToken, teamMediaToken, onChatPress },
  ref,
) {
  const { t } = useLanguage();
  const roomRef = useRef<Room | null>(null);
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

  const applySpeaker = (enabled: boolean) => {
    try {
      InCallManager.start({ media: "audio", auto: true });
      InCallManager.setForceSpeakerphoneOn(enabled);
      InCallManager.setSpeakerphoneOn(enabled);
    } catch {
      // LiveKit still owns the media session if the optional routing helper fails.
    }
  };

  const connectVoice = async () => {
    if (!selectedToken?.configured || !selectedToken.token || !selectedUrl) {
      setStatus(selectedToken?.message || "VOICE SERVER NOT CONFIGURED");
      return;
    }

    setStatus("VOICE CONNECTING");
    try {
      await AudioSession.startAudioSession();

      const room = new Room({
        adaptiveStream: false,
        dynacast: false,
      });
      roomRef.current = room;

      const updateParticipants = () => {
        setParticipantCount(room.numParticipants);
        setSpeakingCount(room.activeSpeakers.length);
      };

      room.on(RoomEvent.ParticipantConnected, updateParticipants);
      room.on(RoomEvent.ParticipantDisconnected, updateParticipants);
      room.on(RoomEvent.ActiveSpeakersChanged, updateParticipants);
      room.on(RoomEvent.Reconnecting, () => setStatus("VOICE RECONNECTING"));
      room.on(RoomEvent.Reconnected, () => {
        updateParticipants();
        setStatus("VOICE CONNECTED");
      });
      room.on(RoomEvent.Disconnected, () => {
        updateParticipants();
        setStatus("VOICE DISCONNECTED");
      });
      room.on(RoomEvent.MediaDevicesError, () => setStatus("MICROPHONE DEVICE ERROR"));

      await room.connect(selectedUrl, selectedToken.token);
      updateParticipants();
      applySpeaker(speakerEnabled);
      setStatus("VOICE CONNECTED");

      if (microphoneEnabled && selectedToken.canPublish !== false) {
        await room.localParticipant.setMicrophoneEnabled(true);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "VOICE CONNECTION FAILED");
      try {
        await roomRef.current?.disconnect();
      } catch {
        // ignore cleanup failure
      }
      roomRef.current = null;
    }
  };

  const disconnectVoice = async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      try {
        await room.disconnect();
      } catch {
        // ignore cleanup failure
      }
    }
    setParticipantCount(0);
    setSpeakingCount(0);
  };

  const enableMicrophone = async (enabled: boolean) => {
    const room = roomRef.current;
    setMicrophoneEnabledState(enabled);

    if (!room || room.state === "disconnected") {
      if (enabled) await connectVoice();
      return;
    }

    if (selectedToken?.canPublish === false) {
      setMicrophoneEnabledState(false);
      setStatus("VOICE CHANNEL IS LISTEN-ONLY");
      return;
    }

    try {
      await room.localParticipant.setMicrophoneEnabled(enabled);
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

  useImperativeHandle(ref, () => ({
    setMicrophoneEnabled: enableMicrophone,
    setSpeakerEnabled: toggleSpeaker,
  }));

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await disconnectVoice();
      if (cancelled) return;
      await connectVoice();
    })();

    return () => {
      cancelled = true;
      void disconnectVoice();
      void AudioSession.stopAudioSession();
      try {
        InCallManager.stop();
      } catch {
        // ignore optional audio-route cleanup
      }
    };
  }, [selectedTokenKey, selectedUrl, voiceChannel]);

  const selectChannel = async (channel: "room" | "team") => {
    if (channel === "team" && (!teamMediaToken?.configured || !teamMediaToken.token)) {
      setStatus(memberRole === "spectator" ? "TEAM VOICE IS FOR PLAYERS ONLY" : "TEAM VOICE NOT CONFIGURED");
      return;
    }
    setVoiceChannel(channel);
  };

  const pttPressIn = () => {
    if (voiceMode === "ptt") void enableMicrophone(true);
  };
  const pttPressOut = () => {
    if (voiceMode === "ptt") void enableMicrophone(false);
  };

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <Text style={styles.title}>🎙️ {t("voice")}</Text>
        <Text style={styles.online}>{participantCount} PEERS</Text>
      </View>

      <Text style={styles.status}>{status}</Text>
      <Text style={styles.speakers}>{speakingCount} SPEAKING · {voiceChannel.toUpperCase()} CHANNEL</Text>

      <View style={styles.row}>
        <Pressable
          onPressIn={pttPressIn}
          onPressOut={pttPressOut}
          onPress={voiceMode === "open" ? () => void enableMicrophone(!microphoneEnabled) : undefined}
          style={[styles.action, microphoneEnabled && styles.active]}
        >
          <Text style={styles.actionText}>{voiceMode === "ptt" ? "HOLD TO TALK" : microphoneEnabled ? t("micOn") : t("micOff")}</Text>
        </Pressable>
        <Pressable onPress={() => void toggleSpeaker(!speakerEnabled)} style={[styles.action, speakerEnabled && styles.active]}>
          <Text style={styles.actionText}>{speakerEnabled ? t("speakerOn") : t("speakerOff")}</Text>
        </Pressable>
        <Pressable onPress={() => setVoiceMode((mode) => mode === "open" ? "ptt" : "open")} style={[styles.action, voiceMode === "ptt" && styles.active]}>
          <Text style={styles.actionText}>{voiceMode === "ptt" ? "PTT" : "OPEN MIC"}</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        <Pressable onPress={() => void selectChannel("room")} style={[styles.channel, voiceChannel === "room" && styles.channelActive]}>
          <Text style={styles.actionText}>ROOM VOICE</Text>
        </Pressable>
        <Pressable onPress={() => void selectChannel("team")} style={[styles.channel, voiceChannel === "team" && styles.channelActive, !teamMediaToken?.configured && styles.disabled]}>
          <Text style={styles.actionText}>TEAM VOICE</Text>
        </Pressable>
        <Pressable onPress={onChatPress} style={styles.channel}>
          <Text style={styles.actionText}>CHAT</Text>
        </Pressable>
      </View>

      <Text style={styles.members}>
        {members?.length ? members.map((member) => member.id === memberId ? member.displayName + " (YOU)" : member.displayName).join(" · ") : "Waiting for room members"}
      </Text>
    </View>
  );
});

RoomVoiceChat.displayName = "RoomVoiceChat";

const styles = StyleSheet.create({
  card: { backgroundColor: "#160D29", borderWidth: 1, borderColor: "#4B3370", borderRadius: 18, padding: 14, marginTop: 16 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#DCA7FF", fontSize: 13, fontWeight: "900" },
  online: { color: "#9EEBFF", fontSize: 10, fontWeight: "800" },
  status: { color: "#C5BDD3", fontSize: 11, marginTop: 6, lineHeight: 16 },
  speakers: { color: "#8F84A6", fontSize: 9, fontWeight: "800", marginTop: 3 },
  row: { flexDirection: "row", gap: 7, marginTop: 10 },
  action: { flex: 1, minHeight: 46, borderRadius: 13, backgroundColor: "#231836", borderWidth: 1, borderColor: "#433054", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  channel: { flex: 1, minHeight: 40, borderRadius: 12, backgroundColor: "#17102A", borderWidth: 1, borderColor: "#3B2B50", alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  active: { backgroundColor: "#5A2993", borderColor: "#B768FF" },
  channelActive: { backgroundColor: "#234A60", borderColor: "#73E8FF" },
  disabled: { opacity: 0.42 },
  actionText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900", textAlign: "center" },
  members: { color: "#9086A6", fontSize: 10, marginTop: 9, lineHeight: 15 },
});
