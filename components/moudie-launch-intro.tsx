import { useEffect, useState, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/lib/language";

type Props = { children: ReactNode };

/**
 * Lightweight startup intro that depends only on an image asset.
 * The previous implementation required a large MP4 that was removed from the
 * repository, which made clean Android prebuilds fail at module resolution.
 */
export function MoudieLaunchIntro({ children }: Props) {
  const { t } = useLanguage();
  const [introVisible, setIntroVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIntroVisible(false), 1800);
    return () => clearTimeout(timer);
  }, []);

  return <View style={styles.host}>
    {children}
    {introVisible && <View style={styles.screen} accessibilityLabel={t("introBootLabel")}>
      <Image source={require("@/assets/images/classic-era-new-poster.png")} style={styles.image} resizeMode="cover" />
      <Pressable style={styles.skip} onPress={() => setIntroVisible(false)} accessibilityRole="button"><Text style={styles.skipText}>{t("introSkip")}</Text></Pressable>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: "#030711", overflow: "hidden", zIndex: 20 },
  image: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  skip: { position: "absolute", right: 18, bottom: 28, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.55)" },
  skipText: { color: "#FFFFFF", fontSize: 11, letterSpacing: 1.2, fontWeight: "900" },
});
