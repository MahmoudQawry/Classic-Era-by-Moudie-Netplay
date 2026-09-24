const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withDiscordSocialSdk(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
    if (!applicationId) {
      return configWithManifest;
    }

    const application = configWithManifest.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error("Discord Social SDK requires an Android application manifest.");
    }

    const activities = application.activity ?? [];
    const activityName = "com.discord.socialsdk.AuthenticationActivity";
    const scheme = `discord-${applicationId}`;

    const existing = activities.find((activity) => activity.$?.["android:name"] === activityName);
    if (existing) {
      return configWithManifest;
    }

    activities.push({
      $: {
        "android:name": activityName,
        "android:exported": "true",
      },
      "intent-filter": [
        {
          action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
          category: [
            { $: { "android:name": "android.intent.category.DEFAULT" } },
            { $: { "android:name": "android.intent.category.BROWSABLE" } },
          ],
          data: [{ $: { "android:scheme": scheme } }],
        },
      ],
    });

    application.activity = activities;
    return configWithManifest;
  });
};
