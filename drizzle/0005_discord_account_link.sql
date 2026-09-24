ALTER TABLE users ADD COLUMN discordUserId varchar(32) NULL;
ALTER TABLE users ADD COLUMN discordLinkedAt timestamp NULL;
CREATE UNIQUE INDEX users_discord_user_id_unique ON users (discordUserId);
