/** End-to-end relay test against the DEPLOYED room service.
 * Two real socket.io clients (host + guest) run the full session handshake,
 * input relay, chat, voice-signalling and voice-status exchange. */
const { io } = require("socket.io-client");

const base = (process.env.NETPLAY_E2E_BASE_URL || "https://moudienet-7h7tawv.manus.space").replace(/\/$/, "");
const FINGERPRINT = "b".repeat(64);
const CORE = "pcsx-rearmed-e2e-test";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function trpc(procedure, json, method = "POST") {
  const url = method === "GET" ? `${base}/api/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify({ json }))}` : `${base}/api/trpc/${procedure}`;
  const response = await fetch(url, method === "GET" ? { headers: { accept: "application/json" } } : { method, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ json }) });
  const text = await response.text();
  if (!text.trim()) throw new Error(`${procedure}: empty HTTP ${response.status} response from ${base}`);
  let body;
  try { body = JSON.parse(text); } catch { throw new Error(`${procedure}: invalid JSON HTTP ${response.status}: ${text.slice(0, 160)}`); }
  if (body?.error) throw new Error(`${procedure}: ${body.error.json?.message || body.error.message || "error"}`);
  const data = body?.result?.data;
  if (data && typeof data === "object" && Object.prototype.hasOwnProperty.call(data, "json")) return data.json;
  return data;
}

function connect(credential, label) {
  const socket = io(base, {
    path: "/api/netplay",
    transports: ["websocket", "polling"],
    auth: { roomId: credential.roomId, memberId: credential.memberId, memberToken: credential.memberToken, clientKind: "room-ui" },
    reconnection: false,
    timeout: 15000,
  });
  socket.received = [];
  socket.onAny((event, payload) => socket.received.push({ event, payload }));
  socket.on("connect", () => console.log(`[${label}] connected ${socket.id}`));
  socket.on("connect_error", (error) => console.log(`[${label}] connect_error ${error.message}`));
  return socket;
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} :: ${name}${detail ? " :: " + detail : ""}`);
}

(async () => {
  const health = await fetch(`${base}/api/health`, { headers: { accept: "application/json" } });
  check("deployed relay health endpoint", health.ok, `HTTP ${health.status}`);
  if (!health.ok) throw new Error(`relay health failed: HTTP ${health.status}`);

  const created = await trpc("rooms.create", { name: "E2E Relay", system: "ps1", hostName: "Host", visibility: "private" });
  const joined = await trpc("rooms.join", { joinCode: created.joinCode, displayName: "Guest", joinAs: "player" });
  console.log("room", created.roomId, "code", created.joinCode);

  const host = connect(created, "host");
  const guest = connect(joined, "guest");
  await wait(3500);

  check("host receives netplay:joined", host.received.some((m) => m.event === "netplay:joined"));
  check("guest receives netplay:joined", guest.received.some((m) => m.event === "netplay:joined"));
  check("presence relayed to peer", guest.received.some((m) => m.event === "netplay:presence") || host.received.some((m) => m.event === "netplay:presence"));

  host.received.length = 0; guest.received.length = 0;
  host.emit("netplay:session-ready", { system: "ps1", fingerprint: FINGERPRINT, coreVersion: CORE });
  guest.emit("netplay:session-ready", { system: "ps1", fingerprint: FINGERPRINT, coreVersion: CORE });
  await wait(800);
  check("session-ready accepted by host", host.received.some((m) => m.event === "netplay:session-ready-accepted"));
  check("session-presence seen by guest", guest.received.some((m) => m.event === "netplay:session-presence"));

  host.received.length = 0; guest.received.length = 0;
  host.emit("netplay:session-start-request", { system: "ps1" });
  await wait(1500);
  const startHost = host.received.find((m) => m.event === "netplay:session-start");
  const startGuest = guest.received.find((m) => m.event === "netplay:session-start");
  check("host got session-start", Boolean(startHost), startHost ? JSON.stringify(startHost.payload).slice(0, 120) : "");
  check("guest got session-start", Boolean(startGuest));
  const refused = host.received.find((m) => m.event === "netplay:session-start-refused");
  if (refused) console.log("  start-refused:", JSON.stringify(refused.payload).slice(0, 200));

  host.received.length = 0; guest.received.length = 0;
  host.emit("netplay:ps1-ready", { fingerprint: FINGERPRINT, coreVersion: CORE });
  guest.emit("netplay:ps1-ready", { fingerprint: FINGERPRINT, coreVersion: CORE });
  await wait(1200);
  const waiter = guest.received.find((m) => m.event === "netplay:ps1-waiting");
  if (waiter) console.log("  ps1-waiting:", JSON.stringify(waiter.payload).slice(0, 160));

  host.received.length = 0; guest.received.length = 0;
  host.emit("netplay:ps1-state", { snapshot: "c25hcHNob3Q=", syncId: 1, encoding: "base64" });
  await wait(900);
  check("guest received ps1-state", guest.received.some((m) => m.event === "netplay:ps1-state"));
  guest.emit("netplay:ps1-sync-ack", { syncId: 0 });
  await wait(900);
  check("session-go broadcast", host.received.some((m) => m.event === "netplay:ps1-session-go") || guest.received.some((m) => m.event === "netplay:ps1-session-go"));

  guest.received.length = 0;
  host.emit("netplay:ps1-input", { frame: 1, mask: 16 });
  await wait(900);
  const input = guest.received.find((m) => m.event === "netplay:ps1-input");
  check("guest received ps1-input", Boolean(input), input ? JSON.stringify(input.payload).slice(0, 120) : "");

  guest.received.length = 0;
  host.emit("netplay:chat", { text: "e2e chat" });
  await wait(900);
  check("guest received chat", guest.received.some((m) => m.event === "netplay:chat"));

  guest.received.length = 0;
  host.emit("netplay:signal", { targetMemberId: joined.memberId, signal: { kind: "voice-offer", description: { type: "offer", sdp: "x" } } });
  await wait(900);
  check("guest received voice-offer signal", guest.received.some((m) => m.event === "netplay:signal"));

  guest.received.length = 0;
  host.emit("netplay:voice-status", { microphoneEnabled: true, speakerEnabled: true, voiceMode: "ptt", voiceChannel: "room", isSpeaking: true });
  await wait(900);
  check("guest received voice-status", guest.received.some((m) => m.event === "netplay:voice-status"));

  // LiveKit is optional: the production app has a built-in WebRTC voice path
  // when no LiveKit credentials are configured. The signalling checks above are
  // therefore the required voice E2E; mediaToken is reported, not required.
  try {
    const mediaToken = await trpc("rooms.mediaToken", { roomId: created.roomId, memberId: created.memberId, memberToken: created.memberToken });
    check("rooms.mediaToken endpoint responds", Boolean(mediaToken), JSON.stringify(mediaToken).slice(0, 160));
  } catch (error) {
    check("rooms.mediaToken endpoint responds", false, error.message);
  }

  host.close(); guest.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) console.log("FAILED:", failed.map((f) => f.name).join(", "));
  process.exit(failed.length ? 1 : 0);
})();
