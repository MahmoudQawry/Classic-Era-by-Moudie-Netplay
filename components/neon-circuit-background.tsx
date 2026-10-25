import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

/**
 * Animated Circuit Background with central MN Processor
 * - Background Image: circuit-processor-bg.jpg with circuit board and central processor chip
 * - Animation: Electric energy pulses travel from screen edges into the center processor
 * - Impact: When electric signals hit the processor, an energy surge pulses and the "MN" letters illuminate with intense neon glow
 */
export function NeonCircuitBackground() {
  const { width, height } = useWindowDimensions();

  // Master cycle animation (0 -> 1)
  const cycleAnim = useRef(new Animated.Value(0)).current;
  const secondaryPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Primary main pulse wave cycle (3.2s)
    const primaryLoop = Animated.loop(
      Animated.timing(cycleAnim, {
        toValue: 1,
        duration: 3200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    // Staggered secondary micro-spark wave (3.2s, offset)
    const secondaryLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(450),
        Animated.timing(secondaryPulse, {
          toValue: 1,
          duration: 2750,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    );

    primaryLoop.start();
    secondaryLoop.start();

    return () => {
      primaryLoop.stop();
      secondaryLoop.stop();
    };
  }, [cycleAnim, secondaryPulse]);

  // Center coordinates of processor chip
  const centerX = width * 0.5;
  const centerY = height * 0.485;

  // Approximate half-width and half-height of chip in screen coordinates
  const chipHalfW = Math.min(width * 0.17, 62);
  const chipHalfH = Math.min(height * 0.055, 48);

  // --- Interpolations for Primary Wave ---
  // 1. Travel from edge to chip (0.0 -> 0.52 of cycle)
  const travelProgress = cycleAnim.interpolate({
    inputRange: [0, 0.52, 1],
    outputRange: [0, 1, 1],
    extrapolate: "clamp",
  });

  const sparkOpacity = cycleAnim.interpolate({
    inputRange: [0, 0.05, 0.48, 0.53, 1],
    outputRange: [0, 1, 1, 0, 0],
    extrapolate: "clamp",
  });

  // 2. Shockwave / Surge at processor arrival (0.50 -> 0.72)
  const surgeScale = cycleAnim.interpolate({
    inputRange: [0, 0.50, 0.58, 0.72, 1],
    outputRange: [0.8, 0.8, 1.35, 1.7, 1.7],
    extrapolate: "clamp",
  });

  const surgeOpacity = cycleAnim.interpolate({
    inputRange: [0, 0.50, 0.54, 0.65, 0.75, 1],
    outputRange: [0, 0, 0.95, 0.4, 0, 0],
    extrapolate: "clamp",
  });

  // 3. Letters "MN" Illumination (0.52 -> 0.95)
  const mnGlowOpacity = cycleAnim.interpolate({
    inputRange: [0, 0.51, 0.56, 0.68, 0.88, 0.98, 1],
    outputRange: [0.18, 0.18, 1.0, 0.92, 0.75, 0.18, 0.18],
    extrapolate: "clamp",
  });

  const mnScale = cycleAnim.interpolate({
    inputRange: [0, 0.51, 0.56, 0.66, 0.95, 1],
    outputRange: [1.0, 1.0, 1.18, 1.04, 1.0, 1.0],
    extrapolate: "clamp",
  });

  const mnBloomScale = cycleAnim.interpolate({
    inputRange: [0, 0.51, 0.58, 0.75, 0.95, 1],
    outputRange: [0.85, 0.85, 1.6, 1.2, 0.85, 0.85],
    extrapolate: "clamp",
  });

  // --- Interpolations for Staggered Secondary Wave ---
  const secTravelProgress = secondaryPulse.interpolate({
    inputRange: [0, 0.52, 1],
    outputRange: [0, 1, 1],
    extrapolate: "clamp",
  });

  const secSparkOpacity = secondaryPulse.interpolate({
    inputRange: [0, 0.08, 0.46, 0.53, 1],
    outputRange: [0, 0.85, 0.85, 0, 0],
    extrapolate: "clamp",
  });

  // Calculate distances from edges to chip
  const topDist = centerY - chipHalfH;
  const bottomDist = height - (centerY + chipHalfH);
  const leftDist = centerX - chipHalfW;
  const rightDist = width - (centerX + chipHalfW);

  return (
    <View pointerEvents="none" style={styles.canvas}>
      {/* 1. Official Background Image */}
      <Image
        source={require("@/assets/images/circuit-processor-bg.jpg")}
        style={styles.bgImage}
        resizeMode="cover"
      />

      {/* 2. Soft Darkening Overlay for Content Readability */}
      <View style={styles.darkOverlay} />

      {/* 3. Primary Electrical Sparks (Edge -> Processor) */}

      {/* Top Center Conduit */}
      <Animated.View
        style={[
          styles.sparkPulse,
          {
            left: centerX - 4,
            top: 0,
            opacity: sparkOpacity,
            transform: [
              {
                translateY: travelProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, topDist],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.sparkCore} />
        <View style={[styles.sparkTrail, { height: 16, top: -14 }]} />
      </Animated.View>

      {/* Top Left Conduit */}
      <Animated.View
        style={[
          styles.sparkPulse,
          {
            left: centerX - width * 0.22,
            top: 0,
            opacity: sparkOpacity,
            transform: [
              {
                translateY: travelProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, topDist - 6],
                }),
              },
              {
                translateX: travelProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, width * 0.16],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.sparkCoreCyan} />
        <View style={[styles.sparkTrailDiagonal, { transform: [{ rotate: "35deg" }] }]} />
      </Animated.View>

      {/* Top Right Conduit */}
      <Animated.View
        style={[
          styles.sparkPulse,
          {
            left: centerX + width * 0.22,
            top: 0,
            opacity: sparkOpacity,
            transform: [
              {
                translateY: travelProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, topDist - 6],
                }),
              },
              {
                translateX: travelProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -width * 0.16],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.sparkCoreCyan} />
        <View style={[styles.sparkTrailDiagonal, { transform: [{ rotate: "-35deg" }] }]} />
      </Animated.View>

      {/* Bottom Center Conduit */}
      <Animated.View
        style={[
          styles.sparkPulse,
          {
            left: centerX - 4,
            top: height,
            opacity: sparkOpacity,
            transform: [
              {
                translateY: travelProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -bottomDist],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.sparkCore} />
        <View style={[styles.sparkTrail, { height: 16, top: 8 }]} />
      </Animated.View>

      {/* Bottom Left Conduit */}
      <Animated.View
        style={[
          styles.sparkPulse,
          {
            left: centerX - width * 0.24,
            top: height,
            opacity: sparkOpacity,
            transform: [
              {
                translateY: travelProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -bottomDist + 8],
                }),
              },
              {
                translateX: travelProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, width * 0.18],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.sparkCoreCyan} />
      </Animated.View>

      {/* Bottom Right Conduit */}
      <Animated.View
        style={[
          styles.sparkPulse,
          {
            left: centerX + width * 0.24,
            top: height,
            opacity: sparkOpacity,
            transform: [
              {
                translateY: travelProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -bottomDist + 8],
                }),
              },
              {
                translateX: travelProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -width * 0.18],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.sparkCoreCyan} />
      </Animated.View>

      {/* Left Lateral Conduit */}
      <Animated.View
        style={[
          styles.sparkPulse,
          {
            left: 0,
            top: centerY - 4,
            opacity: sparkOpacity,
            transform: [
              {
                translateX: travelProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, leftDist],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.sparkCore} />
        <View style={[styles.sparkTrailHoriz, { left: -14 }]} />
      </Animated.View>

      {/* Right Lateral Conduit */}
      <Animated.View
        style={[
          styles.sparkPulse,
          {
            left: width,
            top: centerY - 4,
            opacity: sparkOpacity,
            transform: [
              {
                translateX: travelProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -rightDist],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.sparkCore} />
        <View style={[styles.sparkTrailHoriz, { left: 8 }]} />
      </Animated.View>

      {/* --- Staggered Secondary Pulses --- */}
      <Animated.View
        style={[
          styles.sparkPulseSmall,
          {
            left: centerX + 12,
            top: 0,
            opacity: secSparkOpacity,
            transform: [
              {
                translateY: secTravelProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, topDist - 4],
                }),
              },
            ],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.sparkPulseSmall,
          {
            left: centerX - 14,
            top: height,
            opacity: secSparkOpacity,
            transform: [
              {
                translateY: secTravelProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -bottomDist + 4],
                }),
              },
            ],
          },
        ]}
      />

      {/* 4. Processor Arrival Shockwave & Pin Sparks */}
      <Animated.View
        style={[
          styles.shockwaveRing,
          {
            left: centerX - chipHalfW - 8,
            top: centerY - chipHalfH - 8,
            width: chipHalfW * 2 + 16,
            height: chipHalfH * 2 + 16,
            opacity: surgeOpacity,
            transform: [{ scale: surgeScale }],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.shockwaveHalo,
          {
            left: centerX - chipHalfW,
            top: centerY - chipHalfH,
            width: chipHalfW * 2,
            height: chipHalfH * 2,
            opacity: surgeOpacity,
          },
        ]}
      />

      {/* 5. Central "MN" Letters Illumination Layer */}
      <View
        style={[
          styles.processorCenterBox,
          {
            left: centerX - 46,
            top: centerY - 28,
          },
        ]}
      >
        {/* Neon Bloom Glow behind the Letters */}
        <Animated.View
          style={[
            styles.mnBloomLayer,
            {
              opacity: mnGlowOpacity,
              transform: [{ scale: mnBloomScale }],
            },
          ]}
        />

        {/* Illuminated Neon "MN" Letters */}
        <Animated.View
          style={[
            styles.mnLettersRow,
            {
              opacity: mnGlowOpacity,
              transform: [{ scale: mnScale }],
            },
          ]}
        >
          <Text style={[styles.letter, styles.letterM]}>M</Text>
          <Text style={[styles.letter, styles.letterN]}>N</Text>
        </Animated.View>

        {/* Corner Neon Micro-Flares */}
        <Animated.View
          style={[
            styles.cornerFlare,
            styles.flareTopLeft,
            { opacity: mnGlowOpacity },
          ]}
        />
        <Animated.View
          style={[
            styles.cornerFlare,
            styles.flareTopRight,
            { opacity: mnGlowOpacity },
          ]}
        />
        <Animated.View
          style={[
            styles.cornerFlare,
            styles.flareBottomLeft,
            { opacity: mnGlowOpacity },
          ]}
        />
        <Animated.View
          style={[
            styles.cornerFlare,
            styles.flareBottomRight,
            { opacity: mnGlowOpacity },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    backgroundColor: "#050811",
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5, 8, 17, 0.40)",
  },

  // Spark pulses
  sparkPulse: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#00F0FF",
    shadowColor: "#00F0FF",
    shadowRadius: 10,
    shadowOpacity: 1,
    elevation: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  sparkPulseSmall: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#38BDF8",
    shadowColor: "#38BDF8",
    shadowRadius: 8,
    shadowOpacity: 0.9,
    elevation: 4,
  },
  sparkCore: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
  sparkCoreCyan: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#A7F3D0",
  },
  sparkTrail: {
    position: "absolute",
    width: 2,
    backgroundColor: "rgba(0, 240, 255, 0.45)",
    borderRadius: 1,
  },
  sparkTrailHoriz: {
    position: "absolute",
    height: 2,
    width: 14,
    backgroundColor: "rgba(0, 240, 255, 0.45)",
    borderRadius: 1,
  },
  sparkTrailDiagonal: {
    position: "absolute",
    height: 12,
    width: 2,
    backgroundColor: "rgba(0, 240, 255, 0.45)",
    borderRadius: 1,
  },

  // Processor impact effects
  shockwaveRing: {
    position: "absolute",
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#00F0FF",
    shadowColor: "#00F0FF",
    shadowRadius: 16,
    shadowOpacity: 1,
    elevation: 8,
  },
  shockwaveHalo: {
    position: "absolute",
    borderRadius: 14,
    backgroundColor: "rgba(0, 240, 255, 0.28)",
  },

  // Central Letters & Bloom
  processorCenterBox: {
    position: "absolute",
    width: 92,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  mnBloomLayer: {
    position: "absolute",
    width: 80,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(56, 189, 248, 0.42)",
    shadowColor: "#38BDF8",
    shadowRadius: 24,
    shadowOpacity: 1,
    elevation: 10,
  },
  mnLettersRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  letter: {
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
    includeFontPadding: false,
  },
  letterM: {
    color: "#4ADE80",
    textShadowColor: "#22C55E",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  letterN: {
    color: "#F43F5E",
    textShadowColor: "#E11D48",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },

  // Corner micro-flares
  cornerFlare: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#67E8F9",
    shadowColor: "#67E8F9",
    shadowRadius: 6,
    shadowOpacity: 1,
  },
  flareTopLeft: { top: 4, left: 6 },
  flareTopRight: { top: 4, right: 6 },
  flareBottomLeft: { bottom: 4, left: 6 },
  flareBottomRight: { bottom: 4, right: 6 },
});
