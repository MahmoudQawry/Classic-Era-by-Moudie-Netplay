ALTER TABLE `game_rooms`
  MODIFY COLUMN `system` ENUM('psp','nes','sega','ps1','arcade','n64','ps2') NOT NULL;
