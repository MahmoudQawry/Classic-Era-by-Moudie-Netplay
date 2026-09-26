const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withDiscordSocialSdk(config) {
  return withAndroidManifest(config, (mod) => {
    const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
    if (!applicationId) return mod;

    const mainApplication = mod.modResults.manifest.application?.[0];
    if (!mainApplication) return mod;

    const queries = mod.modResults.manifest.queries ?? [];
    const discordQuery = queries.some((query) => query.package?.some((entry) => entry.$?.["android:name"] === "com.discord"));
    if (!discordQuery) queries.push({ package: [{ $: { "android:name": "com.discord" } }] });
    mod.modResults.manifest.queries = queries;

    const activities = mainApplication.activity ?? [];
    const exists = activities.some(
      (activity) => activity.$?.["android:name"] === "com.discord.socialsdk.AuthenticationActivity",
    );
    if (!exists) {
      activities.push({
        $: {
          "android:name": "com.discord.socialsdk.AuthenticationActivity",
          "android:exported": "true",
        },
        "intent-filter": [
          {
            action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
            category: [
              { $: { "android:name": "android.intent.category.DEFAULT" } },
              { $: { "android:name": "android.intent.category.BROWSABLE" } },
            ],
            data: [{ $: { "android:scheme": `discord-${applicationId}` } }],
          },
        ],
      });
    }

    mainApplication.activity = activities;
    return mod;
  });
};
