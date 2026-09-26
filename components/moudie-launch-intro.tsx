import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState, type ReactNode } from "react";
import { ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/lib/language";

type Props = { children: ReactNode };

export function MoudieLaunchIntro({ children }: Props) {
  const { t } = useLanguage();
  const [introVisible, setIntroVisible] = useState(true);
  const bootVideoUrl = process.env.EXPO_PUBLIC_BOOT_VIDEO_URL?.trim() || null;
  const bootVideo = useVideoPlayer(bootVideoUrl, (player) => {
    player.muted = true;
    player.loop = false;
  });

  useEffect(() => {
    let active = true;
    if (!bootVideoUrl) {
      const fallbackTimer = setTimeout(() => {
        if (active) setIntroVisible(false);
      }, 1800);
      return () => {
        active = false;
        clearTimeout(fallbackTimer);
      };
    }

    const endSubscription = bootVideo.addListener("playToEnd", () => {
      if (active) setIntroVisible(false);
    });
    void bootVideo.play();
    return () => {
      active = false;
      endSubscription.remove();
    };
  }, [bootVideo, bootVideoUrl]);

  return <View style={styles.host}>
    {children}
    {introVisible && (
      <View style={styles.screen} accessibilityLabel={t("introBootLabel")}>
        {bootVideoUrl ? (
          <VideoView player={bootVideo} style={styles.video} nativeControls={false} contentFit="cover" />
        ) : (
          <ImageBackground
            source={require("@/assets/images/classic-era-ui-background.jpg")}
            style={styles.video}
            resizeMode="cover"
          />
        )}
        <View style={styles.overlay}>
          <Text style={styles.brand}>MOUDIE NETPLAY</Text>
          <Text style={styles.sub}>CLASSIC ERA</Text>
        </View>
        <Pressable style={styles.skip} onPress={() => setIntroVisible(false)} accessibilityRole="button">
          <Text style={styles.skipText}>{t("introSkip")}</Text>
        </Pressable>
      </View>
    )}
  </View>;
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: "#030711", overflow: "hidden", zIndex: 20 },
  video: { ...StyleSheet.absoluteFillObject },
  overlay: { position: "absolute", left: 0, right: 0, bottom: 90, alignItems: "center" },
  brand: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", letterSpacing: 3 },
  sub: { color: "#75E7FF", fontSize: 10, fontWeight: "900", letterSpacing: 4, marginTop: 5 },
  skip: { position: "absolute", right: 18, bottom: 28, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.55)" },
  skipText: { color: "#FFFFFF", fontSize: 11, letterSpacing: 1.2, fontWeight: "900" },
});
