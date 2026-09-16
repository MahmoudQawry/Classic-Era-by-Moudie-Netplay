/** Voice mesh signalling E2E: proves the built-in peer-to-peer voice path can
 * negotiate over the deployed relay (the exact flow the app now uses when the
 * room service has no LiveKit credentials). */
const { io } = require("socket.io-client");
const base = "https://moudienet-7h7tawvf.manus.space";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function trpc(procedure, json) {
  const response = await fetch(`${base}/api/trpc/${procedure}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ json }) });
  const body = await response.json();
  if (body?.error) throw new Error(body.error.json?.message);
  return body?.result?.data?.json;
}

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} :: ${name}${detail ? " :: " + detail : ""}`); };

(async () => {
  const created = await trpc("rooms.create", { name: "Voice Mesh", system: "ps1", hostName: "Host", visibility: "private" });
  const joined = await trpc("rooms.join", { joinCode: created.joinCode, displayName: "Guest", joinAs: "player" });
  const mk = (credential, label) => {
    const socket = io(base, { path: "/api/netplay", transports: ["websocket"], auth: { roomId: credential.roomId, memberId: credential.memberId, memberToken: credential.memberToken, clientKind: "room-ui" }, reconnection: false });
    socket.received = [];
    socket.onAny((e, p) => socket.received.push({ e, p }));
    socket.on("connect_error", (error) => console.log(label, "connect_error", error.message));
    return socket;
  };
  const host = mk(created, "host");
  const guest = mk(joined, "guest");
  await wait(3000);

  // 1) hello -> ready handshake both ways
  host.received.length = 0; guest.received.length = 0;
  host.emit("netplay:signal", { signal: { kind: "voice-hello" } });
  await wait(800);
  check("broadcast voice-hello reaches guest", guest.received.some((m) => m.e === "netplay:signal" && m.p?.signal?.kind === "voice-hello"));

  guest.received.length = 0;
  host.emit("netplay:signal", { targetMemberId: joined.memberId, signal: { kind: "voice-ready" } });
  await wait(800);
  check("targeted voice-ready reaches guest", guest.received.some((m) => m.e === "netplay:signal" && m.p?.signal?.kind === "voice-ready"));

  // 2) offer -> answer
  host.received.length = 0;
  guest.emit("netplay:signal", { targetMemberId: created.memberId, signal: { kind: "voice-answer", description: { type: "answer", sdp: "v=0" } } });
  await wait(800);
  const answer = host.received.find((m) => m.e === "netplay:signal" && m.p?.signal?.kind === "voice-answer");
  check("host receives voice-answer", Boolean(answer), answer ? "from " + answer.p.fromMemberId : "");

  // 3) ICE candidates both directions
  host.received.length = 0;
  guest.emit("netplay:signal", { targetMemberId: created.memberId, signal: { kind: "voice-candidate", candidate: { candidate: "candidate:1 1 udp 1 192.168.1.2 5000 typ host" } } });
  await wait(800);
  check("host receives guest ICE candidate", host.received.some((m) => m.e === "netplay:signal" && m.p?.signal?.kind === "voice-candidate"));

  guest.received.length = 0;
  host.emit("netplay:signal", { targetMemberId: joined.memberId, signal: { kind: "voice-candidate", candidate: { candidate: "candidate:2 1 udp 1 192.168.1.3 5001 typ host" } } });
  await wait(800);
  check("guest receives host ICE candidate", guest.received.some((m) => m.e === "netplay:signal" && m.p?.signal?.kind === "voice-candidate"));

  // 4) voice status exchange (speaking indicators). NOTE: the production relay
  // forwards microphoneEnabled/speakerEnabled/voiceChannel but may strip
  // isSpeaking, which is why the app derives activity from the microphone flag.
  guest.received.length = 0;
  host.emit("netplay:voice-status", { microphoneEnabled: true, speakerEnabled: true, voiceMode: "open", voiceChannel: "room", isSpeaking: true });
  await wait(800);
  const hostStatus = guest.received.find((m) => m.e === "netplay:voice-status");
  check("guest receives host voice-status (mic on)", Boolean(hostStatus && hostStatus.p?.microphoneEnabled === true), JSON.stringify(hostStatus?.p ?? {}).slice(0, 200));

  host.received.length = 0;
  guest.emit("netplay:voice-status", { microphoneEnabled: true, speakerEnabled: true, voiceMode: "ptt", voiceChannel: "room", isSpeaking: true });
  await wait(800);
  const guestStatus = host.received.find((m) => m.e === "netplay:voice-status");
  check("host receives guest voice-status (mic on)", Boolean(guestStatus && guestStatus.p?.microphoneEnabled === true), JSON.stringify(guestStatus?.p ?? {}).slice(0, 200));

  // 5) malformed signal must not break the relay
  guest.received.length = 0;
  host.emit("netplay:signal", { targetMemberId: joined.memberId, signal: { kind: "not-a-voice-kind" } });
  await wait(600);
  check("unknown signal kinds are ignored", !guest.received.some((m) => m.e === "netplay:signal"));

  // 6) relay still healthy after the abuse attempts
  guest.received.length = 0;
  host.emit("netplay:signal", { targetMemberId: joined.memberId, signal: { kind: "voice-ready" } });
  await wait(800);
  check("relay healthy after abuse attempts", guest.received.some((m) => m.e === "netplay:signal" && m.p?.signal?.kind === "voice-ready"));

  host.close(); guest.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) console.log("FAILED:", failed.map((f) => f.name).join(", "));
  process.exit(failed.length ? 1 : 0);
})();
