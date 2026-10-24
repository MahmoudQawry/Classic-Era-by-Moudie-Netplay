import React from "react";
import { StyleSheet, Text, View, Pressable, StyleProp, ViewStyle } from "react-native";
import { useVoiceChat } from "@/lib/voice-chat-context";
import { useLanguage } from "@/lib/language";

type Props = {
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function SquadVoiceControls({ compact = false, style }: Props) {
  const { t } = useLanguage();
  const {
    isVoiceConnected,
    isMuted,
    isDeafened,
    micMode,
    toggleMic,
    toggleDeafen,
    setMicMode,
    connectedPeers,
    status,
  } = useVoiceChat();

  return (
    <View style={[styles.container, compact && styles.compactContainer, style]}>
      {!compact && (
        <View style={styles.header}>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, isVoiceConnected ? styles.dotConnected : styles.dotOffline]} />
            <Text style={styles.title}>🎙️ {t("voice") || "SQUAD VOICE"}</Text>
          </View>
          <Text style={styles.peersText}>
            {isVoiceConnected ? `${connectedPeers} PEERS` : status}
          </Text>
        </View>
      )}

      <View style={[styles.controlsRow, compact && styles.compactControlsRow]}>
        {/* 1. Open Mic Button */}
        <Pressable
          onPress={() => void setMicMode(micMode === "open" ? "mute" : "open")}
          style={({ pressed }) => [
            styles.button,
            compact && styles.compactButton,
            micMode === "open" && !isDeafened && styles.btnActiveOpen,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.iconText}>🎙️</Text>
          <Text style={[styles.buttonText, compact && styles.compactButtonText]}>
            {micMode === "open" ? (compact ? "OPEN" : "OPEN MIC") : (compact ? "MIC PTT" : "OPEN MIC")}
          </Text>
        </Pressable>

        {/* 2. Mic Mute Button */}
        <Pressable
          onPress={() => void toggleMic()}
          style={({ pressed }) => [
            styles.button,
            compact && styles.compactButton,
            isMuted ? styles.btnMuted : styles.btnActiveMic,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.iconText}>{isMuted ? "🔇" : "🔊"}</Text>
          <Text style={[styles.buttonText, compact && styles.compactButtonText]}>
            {isMuted ? (compact ? "MUTED" : "MIC MUTED") : (compact ? "LIVE" : "MIC ON")}
          </Text>
        </Pressable>

        {/* 3. Team Deafen Button */}
        <Pressable
          onPress={() => void toggleDeafen()}
          style={({ pressed }) => [
            styles.button,
            compact && styles.compactButton,
            isDeafened ? styles.btnDeafened : styles.btnNormal,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.iconText}>{isDeafened ? "🔕" : "🎧"}</Text>
          <Text style={[styles.buttonText, compact && styles.compactButtonText]}>
            {isDeafened ? (compact ? "DEAF" : "DEAFENED") : (compact ? "SQUAD" : "DEAFEN")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#160D29",
    borderWidth: 1,
    borderColor: "#4B3370",
    borderRadius: 18,
    padding: 14,
    marginVertical: 10,
  },
  compactContainer: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: "rgba(22, 13, 41, 0.88)",
    borderWidth: 1,
    borderColor: "#6C3BAA",
    marginVertical: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotConnected: {
    backgroundColor: "#48C78E",
  },
  dotOffline: {
    backgroundColor: "#FF6B6B",
  },
  title: {
    color: "#DCA7FF",
    fontSize: 13,
    fontWeight: "900",
  },
  peersText: {
    color: "#9EEBFF",
    fontSize: 10,
    fontWeight: "800",
  },
  controlsRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  compactControlsRow: {
    gap: 5,
  },
  button: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#231836",
    borderWidth: 1,
    borderColor: "#433054",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 6,
  },
  compactButton: {
    minHeight: 32,
    borderRadius: 8,
    paddingHorizontal: 4,
  },
  btnActiveOpen: {
    backgroundColor: "#2E5C38",
    borderColor: "#48C78E",
  },
  btnActiveMic: {
    backgroundColor: "#3A2B5E",
    borderColor: "#A366FF",
  },
  btnMuted: {
    backgroundColor: "#521F28",
    borderColor: "#FF4757",
  },
  btnDeafened: {
    backgroundColor: "#5C3A1E",
    borderColor: "#FFA502",
  },
  btnNormal: {
    backgroundColor: "#231836",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "900",
  },
  compactButtonText: {
    fontSize: 8,
  },
  iconText: {
    fontSize: 13,
  },
  pressed: {
    opacity: 0.75,
  },
});
