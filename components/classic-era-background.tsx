import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";

export function ClassicEraBackground() {
  const traces = [
    "M0 90H82v76h70v76h55v110h60v118",
    "M0 180h45v58h98v72h62v91h52",
    "M0 350h104v55h91v64h55v92",
    "M0 510h69v64h94v74h66v77",
    "M0 700h135v-54h83v-86h71",
    "M691 90h-82v76h-70v76h-55v110h-60v118",
    "M691 180h-45v58h-98v72h-62v91h-52",
    "M691 350h-104v55h-91v64h-55v92",
    "M691 510h-69v64h-94v74h-66v77",
    "M691 700H556v-54h-83v-86h-71",
    "M160 1536v-160l80-80v-135l64-64V940",
    "M245 1536v-145l72-72v-150l40-40V940",
    "M330 1536v-160l36-36V940",
    "M530 1536v-160l-80-80v-135l-64-64V940",
    "M445 1536v-145l-72-72v-150l-40-40V940",
    "M360 1536v-160l-36-36V940",
  ];
  const bright = [
    "M0 742h118l50-50h76l44-44h58",
    "M691 742H573l-50-50h-76l-44-44h-58",
    "M274 0v230l38 38v170l34 34v214",
    "M417 0v230l-38 38v170l-34 34v214",
    "M273 1536v-208l39-39v-166",
    "M418 1536v-208l-39-39v-166",
  ];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 691 1536" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="mnBg" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#071a2c"/><Stop offset=".5" stopColor="#061629"/><Stop offset="1" stopColor="#04101d"/></LinearGradient>
        </Defs>
        <Rect width="691" height="1536" fill="url(#mnBg)" />
        <Ellipse cx="346" cy="760" rx="230" ry="230" fill="#0aa8d0" opacity=".12" />
        {traces.map((d, i) => <Path key={i} d={d} fill="none" stroke="#d4f8ff" strokeOpacity=".58" strokeWidth="2" />)}
        {bright.map((d, i) => <Path key={"b"+i} d={d} fill="none" stroke="#25eaff" strokeOpacity=".9" strokeWidth="3" />)}
        {[["82","166"],["152","242"],["207","352"],["104","405"],["609","166"],["539","242"],["484","352"],["587","405"],["168","710"],["523","710"],["312","268"],["379","268"]].map(([cx,cy], i) => <Circle key={i} cx={cx} cy={cy} r="4" fill="#c9f8ff" />)}
        <Rect x="267" y="655" width="157" height="157" rx="14" fill="#141a20" stroke="#a8b0b7" strokeWidth="3" />
        <Rect x="280" y="668" width="131" height="131" rx="9" fill="#0a0d11" stroke="#4c555d" strokeWidth="2" />
        <SvgText x="346" y="755" textAnchor="middle" fontFamily="Arial" fontSize="61" fontWeight="900" fill="#72d9ff">M</SvgText>
        <SvgText x="383" y="755" textAnchor="middle" fontFamily="Arial" fontSize="61" fontWeight="900" fill="#e7c84d">N</SvgText>
      </Svg>
    </View>
  );
}
