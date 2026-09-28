const { withAndroidManifest, withGradleProperties } = require("@expo/config-plugins");

/**
 * Keeps the Android package correct for the whole supported matrix
 * (Android 8.0 / API 26 through the current release) and gives the bundled
 * emulator cores the memory profile they need.
 *
 * `largeHeap` matters most for the PlayStation 2 core (Play!): its dynarec,
 * texture cache and guest memory live outside the default Java heap, and the
 * activity is otherwise the first process the low-memory killer reclaims on a
 * 4 GB phone. That reclamation is exactly what looks like "the emulator slowed
 * down and then closed itself".
 */
module.exports = function withAndroidEmulatorTuning(config) {
  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) return mod;
    application.$ = application.$ ?? {};
    application.$["android:largeHeap"] = "true";
    application.$["android:hardwareAccelerated"] = "true";
    return mod;
  });

  config = withGradleProperties(config, (mod) => {
    const properties = mod.modResults;
    const set = (key, value) => {
      const entry = properties.find((item) => item.type === "property" && item.key === key);
      if (entry) entry.value = value;
      else properties.push({ type: "property", key, value });
    };
    set("android.minSdkVersion", "26");
    return mod;
  });

  return config;
};
