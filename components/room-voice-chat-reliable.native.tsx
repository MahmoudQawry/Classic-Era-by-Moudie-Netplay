import { AudioSession, LiveKitRoom, registerGlobals, useConnectionState, useLocalParticipant, useParticipants } from "@livekit/react-native";
import { ConnectionState } from "livekit-client";
import InCallManager from "react-native-incall-manager";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/language";

registerGlobals();

type VoiceMember = { id: number; displayName: string; role: "host" | "player" | "spectator" };
type MediaToken = { configured: boolean; url?: string; roomName?: string; token?: string; canPublish?: boolean; message?: string };
type VoiceChannel = "room" | "team";
export type RoomVoiceChatHandle = { setMicrophoneEnabled: (enabled: boolean) => Promise<void>; setSpeakerEnabled?: (enabled: boolean) => Promise<void>; setVoiceChannel?: (channel: VoiceChannel) => void };
type Props = {
  mediaToken?: MediaToken | null;
  teamMediaToken?: MediaToken | null;
  memberRole?: VoiceMember["role"];
  socket?: unknown;
  memberId?: number;
  members?: VoiceMember[];
};

type SocketLike = {
  emit?: (event: string, payload?: unknown) => unknown;
};

function AudioGuard() {
  useEffect(() => {
    AudioSession.startAudioSession().catch(() => undefined);
    InCallManager.start({ media: "audio" });
    InCallManager.setForceSpeakerphoneOn(true);
    return () => {
      InCallManager.stop();
      AudioSession.stopAudioSession().catch(() => undefined);
    };
  }, []);
  return null;
}

function Controls({
  channel,
  connectedCount,
  microphoneEnabled,
  speakerEnabled,
  members,
  localMemberId,
  onMic,
  onSpeaker,
  onChannel,
}: {
  channel: VoiceChannel;
  connectedCount: number;
  microphoneEnabled: boolean;
  speakerEnabled: boolean;
  members?: VoiceMember[];
  localMemberId?: number;
  onMic: (enabled: boolean) => Promise<void>;
  onSpeaker: (enabled: boolean) => void;
  onChannel: (channel: VoiceChannel) => void;
}) {
  const { t } = useLanguage();
  return <View style={styles.card}>
    <View style={styles.heading}>
      <Text style={styles.title}>🎙️ {t("voice")}</Text>
      <Text style={styles.online}>{connectedCount} ONLINE</Text>
    </View>
    <Text style={styles.status}>LiveKit SFU · {channel === "team" ? t("voiceChannelTeam") : t("voiceChannelRoom")}</Text>
    <View style={styles.row}>
      <Pressable onPress={() => onChannel("room")} style={[styles.chip, channel === "room" && styles.active]}><Text style={styles.chipText}>🌍 {t("voiceChannelRoom")}</Text></Pressable>
      {members?.some((m) => m.id === localMemberId && m.role !== "spectator") && <Pressable onPress={() => onChannel("team")} style={[styles.chip, channel === "team" && styles.active]}><Text style={styles.chipText}>👥 {t("voiceChannelTeam")}</Text></Pressable>}
    </View>
    <View style={styles.row}>
      <Pressable onPress={() => void onMic(!microphoneEnabled)} style={[styles.action, microphoneEnabled && styles.active]}><Text style={styles.actionText}>{microphoneEnabled ? t("micOn") : t("micOff")}</Text></Pressable>
      <Pressable onPress={() => onSpeaker(!speakerEnabled)} style={[styles.action, speakerEnabled && styles.active]}><Text style={styles.actionText}>{speakerEnabled ? t("speakerOn") : t("speakerOff")}</Text></Pressable>
    </View>
    {members && members.length > 0 && <Text style={styles.members}>{members.map((m) => m.id === localMemberId ? `${m.displayName} (YOU)` : m.displayName).join(" · ")}</Text>}
  </View>;
}

function LiveKitControls({
  channel,
  mediaToken,
  members,
  localMemberId,
  socket,
  microphoneEnabled,
  onMicState,
  speakerEnabled,
  onSpeakerState,
}: {
  channel: VoiceChannel;
  mediaToken: MediaToken;
  members?: VoiceMember[];
  localMemberId?: number;
  socket?: unknown;
  microphoneEnabled: boolean;
  onMicState: (enabled: boolean) => void;
  speakerEnabled: boolean;
  onSpeakerState: (enabled: boolean) => void;
}) {
  const { isMicrophoneEnabled, localParticipant } = useLocalParticipant();
  const participants = useParticipants();
  const state = useConnectionState();
  const sock = socket as SocketLike | undefined;

  useEffect(() => {
    const beat = () => sock?.emit?.("netplay:voice-status", {
      microphoneEnabled: isMicrophoneEnabled,
      speakerEnabled,
      voiceChannel: channel,
      isSpeaking: isMicrophoneEnabled,
    });
    beat();
    const timer = setInterval(beat, 3000);
    return () => clearInterval(timer);
  }, [channel, isMicrophoneEnabled, speakerEnabled, sock]);

  useEffect(() => {
    void localParticipant.setMicrophoneEnabled(microphoneEnabled).catch(() => undefined);
  }, [localParticipant, microphoneEnabled]);

  const mic = async (enabled: boolean) => {
    await localParticipant.setMicrophoneEnabled(enabled);
    onMicState(enabled);
    sock?.emit?.("netplay:voice-status", { microphoneEnabled: enabled, speakerEnabled, voiceChannel: channel, isSpeaking: enabled });
  };

  const speaker = (enabled: boolean) => {
    AudioSession.startAudioSession().catch(() => undefined);
    InCallManager.setForceSpeakerphoneOn(enabled);
    onSpeakerState(enabled);
    sock?.emit?.("netplay:voice-status", { microphoneEnabled: isMicrophoneEnabled, speakerEnabled: enabled, voiceChannel: channel });
  };

  return <Controls
    channel={channel}
    connectedCount={Math.max(0, participants.length - 1)}
    microphoneEnabled={isMicrophoneEnabled}
    speakerEnabled={speakerEnabled}
    members={members}
    localMemberId={localMemberId}
    onMic={mic}
    onSpeaker={speaker}
    onChannel={() => undefined}
  />;
}

function UnavailableVoice({ message }: { message?: string }) {
  const { t } = useLanguage();
  return <View style={styles.card}><Text style={styles.title}>🎙️ {t("voice")}</Text><Text style={styles.status}>{message || "LiveKit is not configured on the realtime service."}</Text></View>;
}

export const RoomVoiceChat = ({ mediaToken, teamMediaToken, memberId, members, socket, memberRole }: Props) => {
  const [channel, setChannel] = useState<VoiceChannel>("room");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);

  if (Platform.OS === "web") return null;
  const activeToken = channel === "team" ? teamMediaToken : mediaToken;
  const canUseTeam = memberRole !== "spectator" && Boolean(teamMediaToken?.configured && teamMediaToken.token && teamMediaToken.url);
  const safeChannel = channel === "team" && !canUseTeam ? "room" : channel;
  const token = safeChannel === "team" ? teamMediaToken : mediaToken;

  if (!token?.configured || !token.url || !token.token) return <UnavailableVoice message={token?.message || mediaToken?.message} />;
  if (activeToken !== token && safeChannel === "team") return <UnavailableVoice message="Team voice is not available for this room." />;

  return <>
    <AudioGuard />
    <LiveKitRoom
      key={`${safeChannel}:${token.roomName || "room"}`}
      serverUrl={token.url}
      token={token.token}
      connect
      audio={false}
      video={false}
      options={{
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: {
          dtx: true,
          red: true,
          forceStereo: false,
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        } as never,
        stopLocalTrackOnUnpublish: false,
      }}
    >
      <LiveKitControls
        channel={safeChannel}
        mediaToken={token}
        members={members}
        localMemberId={memberId}
        socket={socket}
        microphoneEnabled={microphoneEnabled}
        onMicState={setMicrophoneEnabled}
        speakerEnabled={speakerEnabled}
        onSpeakerState={setSpeakerEnabled}
      />
    </LiveKitRoom>
    <View pointerEvents="box-none" style={styles.channelOverlay}>
      <Controls
        channel={safeChannel}
        connectedCount={0}
        microphoneEnabled={microphoneEnabled}
        speakerEnabled={speakerEnabled}
        members={members}
        localMemberId={memberId}
        onMic={async (enabled) => setMicrophoneEnabled(enabled)}
        onSpeaker={setSpeakerEnabled}
        onChannel={(next) => setChannel(next)}
      />
    </View>
  </>;
};

const styles = StyleSheet.create({
  channelOverlay: { position: "relative" },
  card: { backgroundColor: "#160D29", borderWidth: 1, borderColor: "#4B3370", borderRadius: 18, padding: 14, marginTop: 16 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#DCA7FF", fontSize: 13, fontWeight: "900" },
  online: { color: "#9EEBFF", fontSize: 10, fontWeight: "800" },
  status: { color: "#C5BDD3", fontSize: 11, marginTop: 6, lineHeight: 16 },
  row: { flexDirection: "row", gap: 7, marginTop: 10 },
  chip: { flex: 1, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: "#231836", borderWidth: 1, borderColor: "#433054" },
  active: { backgroundColor: "#5A2993", borderColor: "#B768FF" },
  chipText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800", textAlign: "center" },
  action: { flex: 1, minHeight: 46, borderRadius: 13, backgroundColor: "#231836", borderWidth: 1, borderColor: "#433054", alignItems: "center", justifyContent: "center" },
  actionText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
  members: { color: "#9086A6", fontSize: 10, marginTop: 9, lineHeight: 15 },
});
