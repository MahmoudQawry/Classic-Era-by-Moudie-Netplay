#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const aar = path.resolve("android/app/libs/discord_partner_sdk.aar");

if (!fs.existsSync(aar)) {
  console.error("Discord Social SDK AAR is not present.");
  console.error("The release build requires the controlled Discord SDK artifact at android/app/libs/discord_partner_sdk.aar.");
  process.exit(2);
}

const stat = fs.statSync(aar);
// The project is arm64-v8a only, so the AAR may be a deliberately reduced
// arm64 package rather than Discord's original multi-ABI archive.
if (stat.size < 5 * 1024 * 1024) {
  console.error(`Unexpected Discord SDK AAR size: ${stat.size} bytes`);
  process.exit(3);
}

let listing;
try {
  listing = execFileSync("unzip", ["-l", aar], { encoding: "utf8" });
} catch {
  console.error("The Discord SDK file is not a readable AAR/ZIP archive.");
  process.exit(4);
}

const required = [
  "arm64-v8a/libdiscord_partner_sdk.so",
  "prefab/",
  "prefab/modules/",
  "AndroidManifest.xml",
  "discord_partner_sdk.jar",
];

for (const entry of required) {
  if (!listing.includes(entry)) {
    console.error(`Discord SDK AAR is missing required entry: ${entry}`);
    process.exit(5);
  }
}

if (listing.includes("discord_partner_sdk_krisp.aar")) {
  console.error("Unexpected nested Krisp AAR detected; Discord voice/Krisp is not part of this integration.");
  process.exit(6);
}

console.log("Discord Social SDK AAR validation passed.");
console.log(`AAR bytes: ${stat.size}`);
