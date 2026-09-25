import { ImageBackground, StyleSheet, View } from "react-native";

const BACKGROUND_IMAGE = require("@/assets/images/classic-era-ui-background.jpg");

export function ClassicEraBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <ImageBackground
        source={BACKGROUND_IMAGE}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
        imageStyle={styles.image}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", height: "100%" },
});