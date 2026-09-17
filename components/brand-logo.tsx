import { Image, StyleSheet, View } from "react-native";

type Props = { size?: number };

/** Shared MN brand mark. Uses the canonical app icon asset everywhere in the UI. */
export function BrandLogo({ size = 44 }: Props) {
  const radius = Math.round(size * 0.28);
  return (
    <View accessibilityLabel="MN — Classic Era" style={[styles.mark, { width: size, height: size, borderRadius: radius }]}>
      <Image source={require("@/assets/images/classic-era-new-icon.png")} style={styles.image} resizeMode="cover" />
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
  image: { width: "100%", height: "100%" },
});
