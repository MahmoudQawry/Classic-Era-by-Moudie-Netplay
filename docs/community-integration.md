# Discord + Telegram integration

## Official destinations

- Discord: https://discord.gg/9KtKFVH5m
- Telegram: https://t.me/ClassicEraByMoudieNetplay

The mobile app now exposes both destinations from Settings.

## Discord

### Implemented
- Official invite link is embedded in the safe client configuration.
- Settings opens the invite through the OS link handler.

### Next production layer
1. Add Discord OAuth2 account linking on the server with strict state and redirect validation.
2. Store only the Discord user ID and required profile fields against the Classic Era account.
3. Add a server-side bot using `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, and `DISCORD_GUILD_ID`.
4. Let the bot call the existing room API for `/room list`, `/room status`, and room-share messages. Do not create a second room database.
5. Publish only an opaque, short-lived signed room link; never publish host/member tokens.

## Telegram

Telegram supports HTTPS `t.me` deep links and bot `start` parameters. A future bot can use a short-lived signed room token rather than a room/member credential. The official Telegram documentation describes bot deep links and a 1–64 character start parameter. 

Suggested commands: `/room`, `/rooms`, `/join <code>`.

## Server-only secrets

- `DISCORD_BOT_TOKEN`
- `DISCORD_APPLICATION_ID`
- `DISCORD_GUILD_ID`
- `TELEGRAM_BOT_TOKEN`

These must never be prefixed with `EXPO_PUBLIC_` and must never be compiled into the APK.

## Future room deep link

`classicera://room/<signed-token>`

The token should be short-lived and contain only an opaque room reference. Resolve it server-side before joining.

## Credential boundary

The repository does not contain Discord application credentials or a Telegram bot token. Therefore the safe implementation boundary is: ship the community links now, prepare the server contract and environment names, and enable OAuth/bot automation only after the platform credentials are supplied through protected secrets.
