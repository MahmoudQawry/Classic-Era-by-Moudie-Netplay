import { useEffect, useState, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/lib/language";

type Props = { children: ReactNode };

/** Bundled MN launch poster keeps startup self-contained and avoids a missing external video asset. */
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
      <Image source={require("@/assets/images/classic-era-new-poster.png")} style={styles.video} resizeMode="cover" accessibilityIgnoresInvertColors />
      <Pressable style={styles.skip} onPress={() => setIntroVisible(false)} accessibilityRole="button"><Text style={styles.skipText}>{t("introSkip")}</Text></Pressable>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: "#030711", overflow: "hidden", zIndex: 20 },
  video: { ...StyleSheet.absoluteFillObject },
  skip: { position: "absolute", right: 18, bottom: 28, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.55)" },
  skipText: { color: "#FFFFFF", fontSize: 11, letterSpacing: 1.2, fontWeight: "900" },
});
