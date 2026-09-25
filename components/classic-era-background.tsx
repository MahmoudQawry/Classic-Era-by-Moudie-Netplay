import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";

/**
 * Canonical MN circuit background. This is rendered directly from the supplied
 * 691x1536 SVG instead of the older raster background, so every ScreenContainer
 * receives the exact new circuit artwork without depending on an SVG Metro loader.
 */
export function ClassicEraBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg viewBox="0 0 691 1536" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#071a2c" />
            <Stop offset=".5" stopColor="#061629" />
            <Stop offset="1" stopColor="#04101d" />
          </LinearGradient>
          <LinearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#20eaff" stopOpacity=".55" />
            <Stop offset="1" stopColor="#20eaff" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect width="691" height="1536" fill="url(#bg)" />
        <Rect width="691" height="1536" fill="#06182a" opacity=".55" />
        <Ellipse cx="346" cy="760" rx="230" ry="230" fill="url(#glow)" opacity=".42" />
        <G fill="none" stroke="#d4f8ff" strokeOpacity=".7" strokeWidth="2">
          <Path d="M0 90H82v76h70v76h55v110h60v118" /><Path d="M0 180h45v58h98v72h62v91h52" />
          <Path d="M0 350h104v55h91v64h55v92" /><Path d="M0 510h69v64h94v74h66v77" />
          <Path d="M0 700h135v-54h83v-86h71" /><Path d="M691 90h-82v76h-70v76h-55v110h-60v118" />
          <Path d="M691 180h-45v58h-98v72h-62v91h-52" /><Path d="M691 350h-104v55h-91v64h-55v92" />
          <Path d="M691 510h-69v64h-94v74h-66v77" /><Path d="M691 700H556v-54h-83v-86h-71" />
          <Path d="M160 1536v-160l80-80v-135l64-64V940" /><Path d="M245 1536v-145l72-72v-150l40-40V940" />
          <Path d="M330 1536v-160l36-36V940" /><Path d="M530 1536v-160l-80-80v-135l-64-64V940" />
          <Path d="M445 1536v-145l-72-72v-150l-40-40V940" /><Path d="M360 1536v-160l-36-36V940" />
        </G>
        <G fill="none" stroke="#25eaff" strokeOpacity=".95" strokeWidth="3">
          <Path d="M0 742h118l50-50h76l44-44h58" /><Path d="M691 742H573l-50-50h-76l-44-44h-58" />
          <Path d="M274 0v230l38 38v170l34 34v214" /><Path d="M417 0v230l-38 38v170l-34 34v214" />
          <Path d="M273 1536v-208l39-39v-166" /><Path d="M418 1536v-208l-39-39v-166" />
        </G>
        <G fill="#c9f8ff">
          <Circle cx="82" cy="166" r="4" /><Circle cx="152" cy="242" r="4" /><Circle cx="207" cy="352" r="4" /><Circle cx="104" cy="405" r="4" />
          <Circle cx="609" cy="166" r="4" /><Circle cx="539" cy="242" r="4" /><Circle cx="484" cy="352" r="4" /><Circle cx="587" cy="405" r="4" />
          <Circle cx="168" cy="710" r="4" /><Circle cx="523" cy="710" r="4" /><Circle cx="312" cy="268" r="4" /><Circle cx="379" cy="268" r="4" />
        </G>
        <G>
          <Rect x="267" y="655" width="157" height="157" rx="14" fill="#141a20" stroke="#a8b0b7" strokeWidth="3" />
          <Rect x="280" y="668" width="131" height="131" rx="9" fill="#0a0d11" stroke="#4c555d" strokeWidth="2" />
          <G stroke="#bfc8cf" strokeWidth="5">
            <Path d="M275 640v22M292 640v22M309 640v22M326 640v22M343 640v22M360 640v22M377 640v22M394 640v22M411 640v22" />
            <Path d="M275 812v22M292 812v22M309 812v22M326 812v22M343 812v22M360 812v22M377 812v22M394 812v22M411 812v22" />
          </G>
          <SvgText x="346" y="755" textAnchor="middle" fontFamily="Arial" fontSize="61" fontWeight="900" fill="#72d9ff">M</SvgText>
          <SvgText x="383" y="755" textAnchor="middle" fontFamily="Arial" fontSize="61" fontWeight="900" fill="#e7c84d">N</SvgText>
        </G>
      </Svg>
    </View>
  );
}
