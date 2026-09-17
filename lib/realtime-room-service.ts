import { getNetplayServiceUrl, getNetplayServiceUrls } from "@/constants/oauth";

export type RealtimeSystem = "ps1" | "psp" | "nes" | "sega" | "n64" | "ps2";
export type RealtimeRole = "host" | "player" | "spectator";
export type RealtimeMember = { id: number; roomId: number; displayName: string; role: RealtimeRole; isReady: boolean; gameFingerprint: string | null; coreVersion: string | null };
export type RealtimeSnapshot = { room: { id: number; joinCode: string; name: string; system: RealtimeSystem; maxPlayers: number; maxSpectators: number; visibility: "public" | "private"; status: "waiting" | "active" | "closed" }; members: RealtimeMember[] };
export type RealtimeCredential = { roomId: number; memberId: number; memberToken: string; role: RealtimeRole };
export type RealtimePublicRoom = { id: number; name: string; system: RealtimeSystem; maxPlayers: number; maxSpectators: number; status: "waiting" | "active" | "closed"; activePlayers: number; spectators: number; readyPlayers: number; updatedAt: string };

type TrpcEnvelope<T> = { result?: { data?: { json?: T; meta?: unknown } | T }; error?: { json?: { message?: string }; message?: string } };
const REQUEST_TIMEOUT_MS = 12_000;
function relayUrls(): string[] { const urls = getNetplayServiceUrls().map((url) => url.replace(/\/$/, "")).filter(Boolean); return Array.from(new Set(urls.length ? urls : [getNetplayServiceUrl().replace(/\/$/, "")].filter(Boolean))); }
function buildUrl(baseUrl: string, procedure: string, input: unknown, method: "GET" | "POST") { const root = `${baseUrl}/api/trpc/${procedure}`; return method === "GET" ? `${root}?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : root; }
async function readTrpcResponse<T>(response: Response, baseUrl: string): Promise<T> {
  const text = await response.text(); const trimmed = text.trim();
  if (!trimmed) throw new Error(`خادم الغرف أعاد استجابة فارغة (HTTP ${response.status}) من ${baseUrl}.`);
  let body: TrpcEnvelope<T>; try { body = JSON.parse(trimmed) as TrpcEnvelope<T>; } catch { const contentType = response.headers.get("content-type") || "unknown"; throw new Error(`خادم الغرف أعاد JSON غير صالح (HTTP ${response.status}, ${contentType}).`); }
  const errorMessage = body.error?.json?.message || body.error?.message; if (!response.ok || body.error) throw new Error(errorMessage || `فشل طلب خدمة الغرف (HTTP ${response.status}).`);
  const data = body.result?.data; if (data !== undefined) { if (typeof data === "object" && data !== null && "json" in data) { const jsonValue = (data as { json?: T }).json; if (jsonValue !== undefined) return jsonValue; } else return data as T; }
  throw new Error("خدمة الغرف أعادت استجابة غير مكتملة.");
}
// Mutations are never replayed to a second relay; only idempotent read-only queries may fail over.
// A failed mutation can duplicate a room or consume a second seat, so POST requests stay on one relay.
async function request<T>(procedure: string, input: unknown, method: "GET" | "POST"): Promise<T> {
  const urls = relayUrls(); let lastError: unknown = null; const candidates = method === "GET" ? urls : [urls[0]].filter(Boolean);
  for (const baseUrl of candidates) { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS); try {
    const response = await fetch(buildUrl(baseUrl, procedure, input, method), method === "POST" ? { method, headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ json: input }), signal: controller.signal } : { method, headers: { accept: "application/json" }, signal: controller.signal });
    if (method === "GET" && (response.status >= 500 || response.status === 408 || response.status === 429)) { lastError = new Error(`relay ${baseUrl} returned HTTP ${response.status}`); continue; }
    return await readTrpcResponse<T>(response, baseUrl);
  } catch (error) { lastError = error; if (method === "POST") break; } finally { clearTimeout(timer); } }
  if (lastError instanceof Error) throw lastError; throw new Error("لم يتم العثور على خادم غرف متاح حالياً.");
}
export function createRealtimeRoom(input: { name: string; system: RealtimeSystem; hostName: string; visibility?: "public" | "private" }) { return request<RealtimeCredential & { joinCode: string }>("rooms.create", input, "POST"); }
export function joinRealtimeRoom(input: { joinCode: string; displayName: string; joinAs: "player" | "spectator" }) { return request<RealtimeCredential>("rooms.join", input, "POST"); }
export function joinPublicRealtimeRoom(input: { roomId: number; displayName: string; joinAs: "player" | "spectator" }) { return request<RealtimeCredential>("rooms.joinPublic", input, "POST"); }
export function getRealtimeRoomSnapshot(input: { roomId: number; memberId: number; memberToken: string }) { return request<RealtimeSnapshot>("rooms.snapshot", input, "GET"); }
export function listPublicRealtimeRooms(limit = 30) { return request<RealtimePublicRoom[]>("rooms.publicList", { limit }, "GET"); }
export function setRealtimeRoomReady(input: { roomId: number; memberId: number; memberToken: string; isReady: boolean; fingerprint?: string; coreVersion?: string }) { return request<boolean>("rooms.setReady", input, "POST"); }
