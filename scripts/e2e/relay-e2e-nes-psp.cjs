/** E2E for the NES (famicom) and universal (PSP) sync paths on the deployed service. */
const { io } = require("socket.io-client");

const base = "https://moudienet-7h7tawvf.manus.space";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function trpc(procedure, json, method = "POST") {
  const url = method === "GET" ? `${base}/api/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify({ json }))}` : `${base}/api/trpc/${procedure}`;
  const response = await fetch(url, method === "GET" ? {} : { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ json }) });
  const body = await response.json();
  if (body?.error) throw new Error(`${procedure}: ${body.error.json?.message || "error"}`);
  return body?.result?.data?.json;
}

function connect(credential, clientKind) {
  const socket = io(base, {
    path: "/api/netplay",
    transports: ["websocket"],
    auth: { roomId: credential.roomId, memberId: credential.memberId, memberToken: credential.memberToken, clientKind },
    reconnection: false,
    timeout: 15000,
  });
  socket.received = [];
  socket.onAny((event, payload) => socket.received.push({ event, payload }));
  socket.on("connect_error", (error) => console.log("connect_error", error.message));
  return socket;
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} :: ${name}${detail ? " :: " + detail : ""}`);
};

async function scenario(system, fingerprint, clientKind, extraInputEvent) {
  console.log(`\n=== ${system.toUpperCase()} ===`);
  const created = await trpc("rooms.create", { name: `${system} E2E`, system, hostName: "Host", visibility: "private" });
  const joined = await trpc("rooms.join", { joinCode: created.joinCode, displayName: "Guest", joinAs: "player" });
  const host = connect(created, clientKind === "universal-player" ? "room-ui" : clientKind);
  const guest = connect(joined, clientKind === "universal-player" ? "room-ui" : clientKind);
  const hostPlayer = connect(created, clientKind);
  const guestPlayer = connect(joined, clientKind);
  await wait(3000);

  host.received.length = 0; guest.received.length = 0; hostPlayer.received.length = 0; guestPlayer.received.length = 0;
  host.emit("netplay:session-ready", { system, fingerprint, coreVersion: "e2e-core" });
  guest.emit("netplay:session-ready", { system, fingerprint, coreVersion: "e2e-core" });
  await wait(700);
  host.received.length = 0; guest.received.length = 0;
  host.emit("netplay:session-start-request", { system });
  await wait(1500);
  const startSeen = host.received.some((m) => m.event === "netplay:session-start") && guest.received.some((m) => m.event === "netplay:session-start");
  check(`${system}: session-start broadcast`, startSeen, startSeen ? "" : JSON.stringify(host.received.map((m) => m.event)));

  hostPlayer.received.length = 0; guestPlayer.received.length = 0;
  if (system === "nes") {
    hostPlayer.emit("netplay:ps1-ready", { fingerprint, coreVersion: "e2e-core" });
    guestPlayer.emit("netplay:ps1-ready", { fingerprint, coreVersion: "e2e-core" });
  } else {
    hostPlayer.emit("netplay:universal-ready", { system, fingerprint, coreVersion: "e2e-core" });
    guestPlayer.emit("netplay:universal-ready", { system, fingerprint, coreVersion: "e2e-core" });
  }
  await wait(1200);
  const bootstrapEvents = hostPlayer.received.map((m) => m.event).concat(guestPlayer.received.map((m) => m.event));
  console.log("  player events:", JSON.stringify([...new Set(bootstrapEvents)]));

  hostPlayer.received.length = 0; guestPlayer.received.length = 0;
  if (system === "nes") {
    hostPlayer.emit("netplay:state", { snapshot: "c25hcA==", syncId: 1 });
    guestPlayer.emit("netplay:state-request", { minimumSyncId: 0 });
    await wait(900);
    check("nes: state/state-request handled", guestPlayer.received.some((m) => m.event === "netplay:state") || hostPlayer.received.some((m) => m.event === "netplay:state-request"));
  } else {
    hostPlayer.emit("netplay:universal-state", { snapshot: "c25hcA==", syncId: 1, encoding: "base64" });
    await wait(900);
    check("universal: state relayed to guest", guestPlayer.received.some((m) => m.event === "netplay:universal-state"), JSON.stringify(guestPlayer.received.map((m) => m.event)));
  }

  // Input relay for this system
  guestPlayer.received.length = 0;
  if (system === "nes") hostPlayer.emit("netplay:input", { button: "A", isDown: true, frame: 1 });
  else hostPlayer.emit("netplay:universal-input", { frame: 1, mask: 16 });
  await wait(900);
  const expected = system === "nes" ? "netplay:input" : "netplay:universal-input";
  check(`${system}: input relayed`, guestPlayer.received.some((m) => m.event === expected), JSON.stringify(guestPlayer.received.map((m) => m.event)));

  [host, guest, hostPlayer, guestPlayer].forEach((socket) => socket.close());
  await wait(300);
}

(async () => {
  await scenario("nes", "c".repeat(64), "ps1-player");
  await scenario("psp", "d".repeat(64), "universal-player");
  const failed = results.filter((r) => !r.ok);
  console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) console.log("FAILED:", failed.map((f) => f.name).join(", "));
  process.exit(failed.length ? 1 : 0);
})();
