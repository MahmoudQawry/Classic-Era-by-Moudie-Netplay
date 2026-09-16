import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BrandLogo } from "@/components/brand-logo";
import { useLanguage } from "@/lib/language";

type Props = { children: ReactNode };

/** Official boot video with a shared MN brand overlay so the launch experience uses the same Moudie NetPlay mark as the app UI. */
export function MoudieLaunchIntro({ children }: Props) {
  const { t } = useLanguage();
  const [introVisible, setIntroVisible] = useState(true);
  const bootVideo = useVideoPlayer(require("@/assets/videos/classic-era-official-boot.mp4"), (player) => {
    player.muted = true;
    player.loop = false;
    player.play();
  });

  useEffect(() => {
    const endSubscription = bootVideo.addListener("playToEnd", () => setIntroVisible(false));
    return () => endSubscription.remove();
  }, [bootVideo]);

  return <View style={styles.host}>
    {children}
    {introVisible && <View style={styles.screen} accessibilityLabel={t("introBootLabel")}>
      <VideoView player={bootVideo} style={styles.video} nativeControls={false} contentFit="cover" />
      <View pointerEvents="none" style={styles.brandOverlay}><BrandLogo size={58} /><Text style={styles.brandText}>Moudie NetPlay</Text></View>
      <Pressable style={styles.skip} onPress={() => setIntroVisible(false)} accessibilityRole="button"><Text style={styles.skipText}>{t("introSkip")}</Text></Pressable>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  host: { flex: 1 }, screen: { ...StyleSheet.absoluteFillObject, backgroundColor: "#030711", overflow: "hidden", zIndex: 20 }, video: { ...StyleSheet.absoluteFillObject },
  brandOverlay: { position: "absolute", left: 0, right: 0, top: "42%", alignItems: "center", justifyContent: "center", opacity: 0.96 },
  brandText: { marginTop: 8, color: "#EAFBFF", fontSize: 11, letterSpacing: 2.1, fontWeight: "900", textShadowColor: "#20DFFF", textShadowRadius: 10 },
  skip: { position: "absolute", right: 18, bottom: 28, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.55)" },
  skipText: { color: "#FFFFFF", fontSize: 11, letterSpacing: 1.2, fontWeight: "900" },
});
