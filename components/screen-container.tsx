import { Image, View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { cn } from "@/lib/utils";

export interface ScreenContainerProps extends ViewProps {
  edges?: Edge[];
  className?: string;
  containerClassName?: string;
  safeAreaClassName?: string;
}

/**
 * Canonical Classic Era screen shell.
 * Every React Native interface uses the supplied MN circuit image as its
 * actual background; legacy neon canvases remain transparent overlays only.
 */
export function ScreenContainer({
  children,
  edges = ["top", "left", "right"],
  className,
  containerClassName,
  safeAreaClassName,
  style,
  ...props
}: ScreenContainerProps) {
  return (
    <View className={cn("flex-1", "bg-background", containerClassName)} {...props}>
      <Image
        source={require("@/assets/images/classic-era-ui-background.jpg")}
        style={styles.background}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <View pointerEvents="none" style={styles.dim} />
      <SafeAreaView edges={edges} className={cn("flex-1", safeAreaClassName)} style={style}>
        <View className={cn("flex-1", className)}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = {
  background: {
    position: "absolute" as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.52,
  },
  dim: {
    position: "absolute" as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(2, 9, 18, 0.30)",
  },
};
