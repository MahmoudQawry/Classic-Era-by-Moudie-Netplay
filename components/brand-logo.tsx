import { StyleSheet, Text, View } from "react-native";

type Props = { size?: number };

/** Shared Moudie NetPlay brand mark. The MN monogram replaces the old single-M mark in UI chrome. */
export function BrandLogo({ size = 44 }: Props) {
  const radius = Math.round(size * 0.28);
  return (
    <View accessibilityLabel="MN — Moudie NetPlay" style={[styles.mark, { width: size, height: size, borderRadius: radius }]}>
      <Text style={[styles.monogram, { fontSize: Math.max(16, Math.round(size * 0.42)) }]}>MN</Text>
      <View style={styles.glow} />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#6A55A8",
    backgroundColor: "#111A2B",
    shadowColor: "#6AE8FF",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  monogram: { color: "#F7F4FF", fontWeight: "900", letterSpacing: -1, zIndex: 2 },
  glow: { position: "absolute", width: "80%", height: "32%", bottom: -6, borderRadius: 30, backgroundColor: "#38DFFF", opacity: 0.18 },
});
