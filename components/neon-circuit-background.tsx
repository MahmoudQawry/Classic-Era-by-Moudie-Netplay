import { StyleSheet, View } from "react-native";

/**
 * Decorative layer used by the legacy screens.
 *
 * The actual Classic Era background is now rendered globally by ScreenContainer.
 * This layer is intentionally transparent so it never hides the canonical
 * background image with an opaque legacy canvas.
 */
export function NeonCircuitBackground() {
  return (
    <View pointerEvents="none" style={styles.canvas}>
      <View style={[styles.glow, styles.glowPurple]} />
      <View style={[styles.glow, styles.glowCyan]} />
      <View style={[styles.dot, styles.dotCyan]} />
      <View style={[styles.dot, styles.dotViolet]} />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: "transparent" },
  glow: { position: "absolute", borderRadius: 180, opacity: 0.10 },
  glowPurple: { width: 340, height: 340, backgroundColor: "#7025CB", top: -200, right: -150 },
  glowCyan: { width: 280, height: 280, backgroundColor: "#067EAD", bottom: -165, left: -135 },
  dot: { position: "absolute", width: 8, height: 8, borderRadius: 8, shadowOpacity: 1, shadowRadius: 10, elevation: 3 },
  dotCyan: { left: 23, top: 140, backgroundColor: "#27DDF7", shadowColor: "#27DDF7" },
  dotViolet: { right: 20, top: 155, backgroundColor: "#C176FF", shadowColor: "#C176FF" },
});
