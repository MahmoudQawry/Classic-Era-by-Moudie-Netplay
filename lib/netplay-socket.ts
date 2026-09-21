import type { Socket } from "socket.io-client";
import { getApiBaseUrl, getNetplayServiceUrl, getNetplayServiceUrls } from "@/constants/oauth";

export type NetplayCredentials = { roomId: number; memberId: number; memberToken: string };
export type NetplayInput = { memberId: number; player: 1 | 2; button: "UP" | "DOWN" | "LEFT" | "RIGHT" | "A" | "B" | "START" | "SELECT"; isDown: boolean; frame: number };
export type RoomChatMessage = { id: string; memberId: number; displayName: string; text: string; sentAt: number };
export type VoiceStatus = { memberId: number; microphoneEnabled: boolean; speakerEnabled: boolean };
type Listener = (...args: any[]) => void;

function relayPool(): string[] {
  const configured = getNetplayServiceUrls().map((url) => url.replace(/\/$/, "")).filter(Boolean);
  const fallback = (getNetplayServiceUrl() || getApiBaseUrl()).replace(/\/$/, "");
  return Array.from(new Set([fallback, ...configured].filter(Boolean)));
}
function stableRelayIndex(roomId: number, count: number) { return count <= 1 ? 0 : Math.abs(Math.trunc(roomId)) % count; }
export function getRoomRelayUrl(roomId: number): string { const urls=relayPool(); return urls[stableRelayIndex(roomId,urls.length)] ?? ""; }

// Compatibility facade: the existing UI keeps its on/off/emit/connect/disconnect API,
// while the backend uses the standard WebSocket protocol provided by Durable Objects.
class CloudflareNetplaySocket {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;
  private lastJoinedPayload: any | null = null;
  public connected = false;
  constructor(private readonly credentials: NetplayCredentials) {}
  on(event:string, callback:Listener) {
    const set=this.listeners.get(event) ?? new Set<Listener>();
    set.add(callback);
    this.listeners.set(event,set);
    if(event==="netplay:joined" && this.lastJoinedPayload!==null) {
      queueMicrotask(()=>{ try{callback(this.lastJoinedPayload);}catch(error){console.warn("[NetPlay] replay listener error",error);} });
    }
    return this;
  }
  off(event:string, callback?:Listener) { const set=this.listeners.get(event); if(!set)return this; if(callback)set.delete(callback);else set.clear(); if(set.size===0)this.listeners.delete(event); return this; }
  private dispatch(event:string,...args:any[]) {
    if(event==="netplay:joined") this.lastJoinedPayload=args[0] ?? null;
    for(const callback of this.listeners.get(event) ?? []) {
      try{callback(...args);}catch(error){console.warn("[NetPlay] listener error",error);}
    }
  }
  emit(event:string,payload?:unknown) { if(!this.ws || this.ws.readyState!==WebSocket.OPEN)return false; this.ws.send(JSON.stringify({event,payload})); return true; }
  connect() {
    this.manuallyClosed=false;
    if(this.ws && (this.ws.readyState===WebSocket.OPEN || this.ws.readyState===WebSocket.CONNECTING))return this;
    const base=getRoomRelayUrl(this.credentials.roomId);
    if(!base){this.dispatch("connect_error",new Error("لم يتم إعداد رابط خادم NetPlay."));return this;}
    const url=base.replace(/^http:/,"ws:").replace(/^https:/,"wss:")+"/ws/room/"+this.credentials.roomId;
    const ws=new WebSocket(url); this.ws=ws;
    ws.onopen=()=>{ws.send(JSON.stringify({event:"auth",payload:this.credentials}));};
    ws.onmessage=(message)=>{
      try { const packet=JSON.parse(String(message.data)) as {event?:string;payload?:unknown}; if(!packet.event)return;
        if(packet.event==="connect"){this.connected=true;this.dispatch("connect");}
        this.dispatch(packet.event,packet.payload);
      } catch(error){this.dispatch("error",error);}
    };
    ws.onerror=(event)=>{this.dispatch("connect_error",event);this.dispatch("error",event);};
    ws.onclose=()=>{const wasConnected=this.connected;this.connected=false;this.ws=null;if(wasConnected)this.dispatch("disconnect");if(!this.manuallyClosed){if(this.reconnectTimer)clearTimeout(this.reconnectTimer);this.reconnectTimer=setTimeout(()=>this.connect(),1000);}};
    return this;
  }
  disconnect(){this.manuallyClosed=true;this.connected=false;if(this.reconnectTimer)clearTimeout(this.reconnectTimer);this.reconnectTimer=null;this.ws?.close();this.ws=null;return this;}
}

export function createNetplaySocket(credentials:NetplayCredentials):Socket {
  if(!getRoomRelayUrl(credentials.roomId))throw new Error("Could not determine the room server. Configure NETPLAY_SERVICE_URL or API_BASE_URL in the Android build.");
  return new CloudflareNetplaySocket(credentials) as unknown as Socket;
}
export function createUniversalNetplaySocket(credentials:NetplayCredentials):Socket { return createNetplaySocket(credentials); }
