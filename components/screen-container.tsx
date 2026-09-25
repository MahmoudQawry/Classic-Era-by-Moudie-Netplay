import { View, type ViewProps } from "react-native";
import { ClassicEraBackground } from "@/components/classic-era-background";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { cn } from "@/lib/utils";

export interface ScreenContainerProps extends ViewProps {
  /**
   * SafeArea edges to apply. Defaults to ["top", "left", "right"].
   * Bottom is typically handled by Tab Bar.
   */
  edges?: Edge[];
  /**
   * Tailwind className for the content area.
   */
  className?: string;
  /**
   * Additional className for the outer container (background layer).
   */
  containerClassName?: string;
  /**
   * Additional className for the SafeAreaView (content layer).
   */
  safeAreaClassName?: string;
}

/**
 * Global app screen container.
 *
 * The supplied Classic Era circuit background is intentionally kept faint and
 * slightly softened so buttons, cards, text, and emulator controls remain easy
 * to read on every interface that uses ScreenContainer.
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
    <View
      className={cn("flex-1", "bg-background", containerClassName)}
      {...props}
    >
      <ClassicEraBackground />
      <View pointerEvents="none" style={styles.dim} />
      <SafeAreaView
        edges={edges}
        className={cn("flex-1", safeAreaClassName)}
        style={style}
      >
        <View className={cn("flex-1", className)}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = {
  dim: {
    position: "absolute" as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(3, 10, 20, 0.52)",
  },
};
