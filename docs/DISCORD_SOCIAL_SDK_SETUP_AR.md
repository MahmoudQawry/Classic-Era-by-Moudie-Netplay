# Discord Integration — Classic Era by Moudie

## Implemented in this branch

- Secure server-side Discord OAuth2 account linking with the identify scope.
- Signed, short-lived OAuth state bound to the authenticated Classic Era account.
- Discord access token is used only for the identity lookup and then revoked; it is not stored.
- Discord user ID is stored without storing Discord credentials.
- Link/unlink/status endpoints.
- Android callback scheme can be configured from DISCORD_APPLICATION_ID.
- Settings screen exposes the official account-link flow.

## Native Social SDK

Discord Social SDK 1.10+ supports Android and provides Rich Presence, account linking, activity invites, friends, lobbies, and communication capabilities. The SDK is distributed from the Discord Developer Portal as native SDK artifacts; it is not a normal npm dependency.

The repository therefore deliberately does not contain a fabricated or third-party replacement for discordpp. Before enabling native Rich Presence, Activity Invites, Friends, Discord Lobby, or Discord Voice in the APK:

1. Create the Discord application in the Discord Developer Portal.
2. Configure the Social SDK section and obtain the Android SDK package.
3. Add the official SDK Android/arm64-v8a native libraries and headers to the native module.
4. Configure the discord-APPLICATION_ID:/authorize/callback redirect in Discord and Android.
5. Implement discordpp::Client lifecycle/callback pumping in the native module.
6. Use only the default presence scopes until communication features are explicitly approved and required.
7. Test Rich Presence, Join/Activity Invite, reconnect, app background/foreground, Discord-not-installed, and token refresh on physical Android devices.

## Security rules

- Never put DISCORD_CLIENT_SECRET in the APK or an EXPO_PUBLIC_* variable.
- Do not log access or refresh tokens.
- Keep OAuth state short-lived and bound to the Classic Era account.
- Do not treat Discord as the NetPlay transport. The existing authenticated NetPlay channel remains authoritative.
- Update the privacy policy before enabling Discord friends, messages, lobbies, or voice.

## Official references

- Discord Social SDK: https://discord.com/developers/docs/social-sdk/
- Getting started: https://discord.com/developers/docs/social-sdk/getting_started.html
- Authentication: https://discord.com/developers/docs/social-sdk/authentication.html
- OAuth2 security: https://discord.com/developers/docs/topics/oauth2
