import { DurableObject } from "cloudflare:workers";

type System = "psp" | "nes" | "sega" | "ps1" | "n64" | "ps2";
type Role = "host" | "player" | "spectator";
type RoomStatus = "waiting" | "active" | "closed";
type Env = { ROOMS: DurableObjectNamespace<NetplayRoom>; DIRECTORY: DurableObjectNamespace<RoomDirectory> };
type Member = { id:number; displayName:string; role:Role; isReady:boolean; gameFingerprint:string|null; coreVersion:string|null; tokenHash:string };
type Room = { id:number; joinCode:string; name:string; system:System; maxPlayers:number; maxSpectators:number; visibility:"public"|"private"; status:RoomStatus; createdAt:number; updatedAt:number; hostMemberId:number };

const enc = new TextEncoder();
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SYSTEMS = new Set<System>(["psp","nes","sega","ps1","n64","ps2"]);

function json(data:unknown, init:ResponseInit={}) { return new Response(JSON.stringify(data), { ...init, headers: { "content-type":"application/json; charset=utf-8", ...(init.headers||{}) } }); }
function ok(data:unknown) { return json({ result:{ data:{ json:data } } }); }
function fail(message:string,status=400) { return json({ error:{ json:{ message } } }, {status}); }
async function input(request:Request) { if(request.method==="GET"){const raw=new URL(request.url).searchParams.get("input");if(!raw)return {};const parsed=JSON.parse(raw);return parsed?.json ?? parsed;} const body=await request.json();return body?.json ?? body; }
async function sha(value:string) { const d=await crypto.subtle.digest("SHA-256",enc.encode(value)); return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,"0")).join(""); }
function limits(system:System) { return system==="n64" ? {maxPlayers:4,maxSpectators:8} : {maxPlayers:2,maxSpectators:8}; }
function code() { const b=crypto.getRandomValues(new Uint8Array(6)); return Array.from(b,x=>ALPHABET[x%ALPHABET.length]).join(""); }
function token() { return crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,""); }

export class RoomDirectory extends DurableObject<Env> {
  private sql:SqlStorage;
  constructor(ctx:DurableObjectState, env:Env) { super(ctx,env); this.sql=ctx.storage.sql; this.sql.exec("CREATE TABLE IF NOT EXISTS rooms (id INTEGER PRIMARY KEY, join_code TEXT UNIQUE, name TEXT, system TEXT, visibility TEXT, status TEXT, max_players INTEGER, max_spectators INTEGER, updated_at INTEGER)"); }
  async register(room:Room) { this.sql.exec("INSERT OR REPLACE INTO rooms VALUES(?,?,?,?,?,?,?,?,?)",room.id,room.joinCode,room.name,room.system,room.visibility,room.status,room.maxPlayers,room.maxSpectators,room.updatedAt); return true; }
  async update(room:Room) { this.sql.exec("UPDATE rooms SET name=?,system=?,visibility=?,status=?,max_players=?,max_spectators=?,updated_at=? WHERE id=?",room.name,room.system,room.visibility,room.status,room.maxPlayers,room.maxSpectators,room.updatedAt,room.id); return true; }
  async findByCode(joinCode:string) { const r=this.sql.exec("SELECT id FROM rooms WHERE join_code=?",joinCode).toArray()[0] as any; return r ? Number(r.id) : null; }
  async list(limit:number) { return this.sql.exec("SELECT id,name,system,max_players,max_spectators,status,updated_at FROM rooms WHERE visibility='public' AND status<>'closed' ORDER BY updated_at DESC LIMIT ?",Math.min(50,Math.max(1,limit))).toArray().map((r:any)=>({id:Number(r.id),name:String(r.name),system:r.system,maxPlayers:Number(r.max_players),maxSpectators:Number(r.max_spectators),status:r.status,activePlayers:0,spectators:0,readyPlayers:0,updatedAt:new Date(Number(r.updated_at)).toISOString()})); }
}

export class NetplayRoom extends DurableObject<Env> {
  private sql:SqlStorage;
  constructor(ctx:DurableObjectState, env:Env) {
    super(ctx,env); this.sql=ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)");
    this.sql.exec("CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY,display_name TEXT NOT NULL,role TEXT NOT NULL,is_ready INTEGER NOT NULL DEFAULT 0,game_fingerprint TEXT,core_version TEXT,token_hash TEXT NOT NULL)");
  }
  private room():Room|null { const r=this.sql.exec("SELECT value FROM meta WHERE key='room'").toArray()[0] as any; return r?.value ? JSON.parse(String(r.value)) : null; }
  private save(room:Room) { this.sql.exec("INSERT OR REPLACE INTO meta(key,value) VALUES('room',?)",JSON.stringify(room)); }
  private metaValue(key:string):string|null {
    const row=this.sql.exec("SELECT value FROM meta WHERE key=?",key).toArray()[0] as any;
    return row?.value == null ? null : String(row.value);
  }
  private setMeta(key:string,value:string) {
    this.sql.exec("INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)",key,value);
  }
  private sessionAcks():Set<number> {
    try {
      const parsed=JSON.parse(this.metaValue("session-acks")||"[]");
      return new Set<number>(Array.isArray(parsed)?parsed.map(Number).filter((id:number)=>Number.isSafeInteger(id)&&id>0):[]);
    } catch { return new Set<number>(); }
  }
  private setSessionAcks(acks:Set<number>) {
    this.setMeta("session-acks",JSON.stringify([...acks]));
  }
  private clearSessionAcks() { this.setSessionAcks(new Set<number>()); }
  private async tryStartSession() {
    const raw=this.metaValue("session-start-request");
    if(!raw) return false;
    let requested:{system:string};
    try { requested=JSON.parse(raw) as {system:string}; } catch { this.setMeta("session-start-request",""); return false; }
    const ms=this.members();
    const players=ms.filter(x=>x.role!=="spectator");
    const readyPlayers=players.filter(x=>x.isReady);
    if(players.length<2 || readyPlayers.length!==players.length) return false;
    const fingerprints=new Set(readyPlayers.map(x=>x.gameFingerprint).filter(Boolean));
    const cores=new Set(readyPlayers.map(x=>x.coreVersion).filter(Boolean));
    if(fingerprints.size!==1 || cores.size!==1) return false;
    const room=this.room();
    if(!room || room.system!==requested.system) return false;
    const startAt=Date.now()+3000;
    const playerMemberIds=players.map(x=>x.id);
    const payload={system:requested.system,startAt,playerMemberIds,inputDelay:3};
    this.setMeta("session-start-request","");
    this.setMeta("session-started-at",String(startAt));
    const packet=JSON.stringify({event:"netplay:session-start",payload});
    for(const ws of this.ctx.getWebSockets()) if(ws.readyState===WebSocket.OPEN) ws.send(packet);
    return true;
  }
  private members():Member[] { return this.sql.exec("SELECT id,display_name,role,is_ready,game_fingerprint,core_version,token_hash FROM members ORDER BY id").toArray().map((r:any)=>({id:Number(r.id),displayName:String(r.display_name),role:r.role,isReady:Boolean(r.is_ready),gameFingerprint:r.game_fingerprint?String(r.game_fingerprint):null,coreVersion:r.core_version?String(r.core_version):null,tokenHash:String(r.token_hash)})); }
  async create(room:Room, hostName:string, hostToken:string) {
    if(this.room()) throw new Error("الغرفة موجودة بالفعل.");
    this.save(room);
    this.sql.exec("INSERT INTO members VALUES(?,?,?,?,?,?,?)",1,hostName,"host",0,null,null,await sha(hostToken));
    return {roomId:room.id,memberId:1,memberToken:hostToken,role:"host" as const,joinCode:room.joinCode,maxPlayers:room.maxPlayers,maxSpectators:room.maxSpectators};
  }
  private async auth(memberId:number,memberToken:string) { const m=this.members().find(x=>x.id===memberId); if(!m||m.tokenHash!==await sha(memberToken)) throw new Error("لا تملك صلاحية دخول هذه الغرفة."); return m; }
  async join(displayName:string,joinAs:"player"|"spectator") {
    const room=this.room(); if(!room||room.status!=="waiting") throw new Error("الغرفة غير متاحة للانضمام.");
    const ms=this.members(); const players=ms.filter(m=>m.role!=="spectator").length; const spectators=ms.filter(m=>m.role==="spectator").length;
    if(joinAs==="player"&&players>=room.maxPlayers) throw new Error("اكتملت مقاعد اللاعبين.");
    if(joinAs==="spectator"&&spectators>=room.maxSpectators) throw new Error("اكتملت مقاعد المشاهدين.");
    const id=Math.max(...ms.map(m=>m.id))+1; const t=token();
    this.sql.exec("INSERT INTO members VALUES(?,?,?,?,?,?,?)",id,displayName,joinAs,0,null,null,await sha(t));
    room.updatedAt=Date.now(); this.save(room);
    return {roomId:room.id,memberId:id,memberToken:t,role:joinAs};
  }
  async snapshot(memberId:number,memberToken:string) {
    await this.auth(memberId,memberToken); const room=this.room(); if(!room) throw new Error("الغرفة لم تعد موجودة.");
    return {room,members:this.members().map(({tokenHash:_t,...m})=>m)};
  }
  async ready(data:{memberId:number;memberToken:string;isReady:boolean;gameFingerprint?:string;coreVersion?:string}) {
    await this.auth(data.memberId,data.memberToken);
    this.sql.exec("UPDATE members SET is_ready=?,game_fingerprint=?,core_version=? WHERE id=?",data.isReady?1:0,data.gameFingerprint??null,data.coreVersion??null,data.memberId);
    const r=this.room(); if(r){r.updatedAt=Date.now();this.save(r);} return true;
  }
  async socket(request:Request) {
    if(request.headers.get("Upgrade")?.toLowerCase()!=="websocket") return new Response("Expected WebSocket",{status:426});
    const pair=new WebSocketPair(); const client=pair[0], server=pair[1];
    this.ctx.acceptWebSocket(server);
    (server as any).serializeAttachment({memberId:null});
    return new Response(null,{status:101,webSocket:client});
  }

  async webSocketMessage(server:WebSocket,message:ArrayBuffer|string) {
    try {
      const msg=JSON.parse(typeof message==="string"?message:new TextDecoder().decode(message));
      if(msg?.event==="auth"){
        const memberId=Number(msg.payload?.memberId);
        const memberToken=String(msg.payload?.memberToken||"");
        const m=await this.auth(memberId,memberToken);
        (server as any).serializeAttachment({memberId:m.id});
        const active=this.members().filter(x=>x.role!=="spectator");
        const assignedPlayer=m.role==="spectator"?null:(active.findIndex(x=>x.id===m.id)+1);
        const onlineMemberIds=this.ctx.getWebSockets().map(ws=>{
          const a=(ws as any).deserializeAttachment() as any;
          return a?.memberId;
        }).filter((x):x is number=>typeof x==="number");
        server.send(JSON.stringify({event:"connect",payload:{ok:true,memberId:m.id}}));
        server.send(JSON.stringify({event:"netplay:joined",payload:{memberId:m.id,assignedPlayer,onlineMemberIds}}));
        this.broadcast({event:"netplay:presence",payload:{memberId:m.id,displayName:m.displayName,role:m.role,online:true}},server);
        return;
      }

      const attachment=(server as any).deserializeAttachment() as any;
      const memberId=Number(attachment?.memberId);
      if(!Number.isSafeInteger(memberId)) return;
      const member=this.members().find(x=>x.id===memberId);
      if(!member) return;

      if(msg?.event==="netplay:chat"){
        const text=String(msg.payload?.text||"").trim().slice(0,500);
        if(!text) return;
        const packet=JSON.stringify({
          event:"netplay:chat",
          payload:{id:crypto.randomUUID(),memberId:member.id,displayName:member.displayName,text,sentAt:Date.now()}
        });
        for(const ws of this.ctx.getWebSockets()) if(ws.readyState===WebSocket.OPEN) ws.send(packet);
        return;
      }

      if(msg?.event==="netplay:quality-probe"){
        server.send(JSON.stringify({event:"netplay:quality-pong",payload:{sequence:Number(msg.payload?.sequence)||0}}));
        return;
      }

      if(msg?.event==="netplay:session-ready"){
        const isReady=Boolean(msg.payload?.isReady);
        const system=String(msg.payload?.system||"");
        const fingerprint=String(msg.payload?.fingerprint||"");
        const coreVersion=String(msg.payload?.coreVersion||"");
        if(isReady && (!SYSTEMS.has(system as System) || !/^[a-f0-9]{64}$/i.test(fingerprint) || !coreVersion.trim())) return;
        if(isReady){
          const signature=system+"|"+fingerprint.toLowerCase()+"|"+coreVersion.trim();
          const previousSignature=this.metaValue("session-signature");
          if(previousSignature && previousSignature!==signature) this.clearSessionAcks();
          this.setMeta("session-signature",signature);
        } else {
          const acks=this.sessionAcks(); acks.delete(member.id); this.setSessionAcks(acks);
        }
        this.sql.exec("UPDATE members SET is_ready=?,game_fingerprint=?,core_version=? WHERE id=?",isReady?1:0,isReady?fingerprint.toLowerCase():null,isReady?coreVersion.trim():null,member.id);
        this.broadcast({event:"netplay:session-ready",payload:{memberId:member.id,isReady,system,fingerprint,coreVersion}});
        if(isReady) await this.tryStartSession();
        return;
      }

      if(msg?.event==="netplay:session-start-request"){
        if(member.role!=="host") return;
        const system=String(msg.payload?.system||"");
        if(!SYSTEMS.has(system as System)) return;
        this.setMeta("session-start-request",JSON.stringify({system}));
        const started=await this.tryStartSession();
        if(!started){
          const players=this.members().filter(x=>x.role!=="spectator");
          const acks=this.sessionAcks();
          server.send(JSON.stringify({event:"netplay:session-start-pending",payload:{
            waitingFor:players.filter(x=>!x.isReady || !acks.has(x.id)).map(x=>x.id)
          }}));
        }
        return;
      }

      if(msg?.event==="netplay:universal-sync-ack"){
        const syncId=Number(msg.payload?.syncId);
        if(syncId!==0) return;
        const acks=this.sessionAcks();
        acks.add(member.id);
        this.setSessionAcks(acks);
        this.broadcast({event:"netplay:universal-sync-ack",payload:{memberId:member.id,syncId:0}});
        await this.tryStartSession();
        return;
      }

      if(msg?.event==="netplay:universal-state"){
        const syncId=Number(msg.payload?.syncId);
        if(syncId===0 && member.role==="host"){
          const acks=this.sessionAcks();
          acks.add(member.id);
          this.setSessionAcks(acks);
          await this.tryStartSession();
        }
      }

      if(msg?.event==="netplay:quality-probe"){ return; }

      if(msg?.event==="netplay:voice-status"){
        this.broadcast({
          event:"netplay:voice-status",
          payload:{memberId:member.id,...(msg.payload||{})}
        });
        return;
      }

      if(msg?.event==="voice:signal"){
        const targetMemberId=Number(msg.payload?.targetMemberId);
        if(!Number.isSafeInteger(targetMemberId) || targetMemberId===member.id) return;
        const packet={event:"voice:signal",payload:{...msg.payload,fromMemberId:member.id}};
        for(const ws of this.ctx.getWebSockets()){
          const a=(ws as any).deserializeAttachment() as any;
          if(Number(a?.memberId)===targetMemberId && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(packet));
        }
        return;
      }

      const forwardedPayload = msg?.payload && typeof msg.payload==="object" ? {...msg.payload,memberId:member.id} : msg?.payload;
      this.broadcast({...msg,payload:forwardedPayload},server);
    } catch(err) {
      try { server.send(JSON.stringify({event:"error",payload:{message:err instanceof Error?err.message:"WebSocket error"}})); } catch {}
    }
  }

  async webSocketClose(server:WebSocket) {
    const attachment=(server as any).deserializeAttachment() as any;
    const memberId=Number(attachment?.memberId);
    if(Number.isSafeInteger(memberId)){
      const acks=this.sessionAcks();
      acks.delete(memberId);
      this.setSessionAcks(acks);
      const member=this.members().find(x=>x.id===memberId);
      this.broadcast({event:"netplay:presence",payload:{memberId,displayName:member?.displayName||"",role:member?.role||"player",online:false}},server);
    }
  }

  async webSocketError(server:WebSocket) {
    const attachment=(server as any).deserializeAttachment() as any;
    const memberId=Number(attachment?.memberId);
    if(Number.isSafeInteger(memberId)) this.broadcast({event:"netplay:presence",payload:{memberId,online:false}},server);
  }

  private broadcast(message:unknown,except?:WebSocket){const s=JSON.stringify(message);for(const ws of this.ctx.getWebSockets())if(ws!==except&&ws.readyState===WebSocket.OPEN)ws.send(s);}
}

function roomIdFor(env:Env,id:number){return env.ROOMS.getByName(String(id));}
function directory(env:Env){return env.DIRECTORY.getByName("global");}

export default {
  async fetch(request:Request,env:Env):Promise<Response>{
    const url=new URL(request.url);
    if(url.pathname==="/api/health") return json({ok:true,service:"classic-era-moudie-netplay",runtime:"cloudflare-workers-durable-objects"});
    const ws=url.pathname.match(/^\/ws\/room\/(\d+)$/); if(ws) return roomIdFor(env,Number(ws[1])).socket(request);
    if(!url.pathname.startsWith("/api/trpc/rooms.")) return json({error:{message:"Not found"}},{status:404});
    const p=url.pathname.slice("/api/trpc/".length);
    try {
      if(p==="rooms.create"){
        const x=await input(request); const system=String(x.system) as System; if(!SYSTEMS.has(system)) return fail("إعداد النظام غير صالح.");
        const {maxPlayers,maxSpectators}=limits(system); const id=Date.now()*1000+Math.floor(Math.random()*1000); const joinCode=code(); const hostToken=token();
        const room:Room={id,joinCode,name:String(x.name).trim(),system,maxPlayers,maxSpectators,visibility:x.visibility==="public"?"public":"private",status:"waiting",createdAt:Date.now(),updatedAt:Date.now(),hostMemberId:1};
        const result=await roomIdFor(env,id).create(room,String(x.hostName).trim(),hostToken); await directory(env).register(room); return ok(result);
      }
      if(p==="rooms.join"){const x=await input(request);const id=await directory(env).findByCode(String(x.joinCode||"").trim().toUpperCase());if(!id)return fail("رمز الغرفة غير صحيح.");return ok(await roomIdFor(env,id).join(String(x.displayName).trim(),x.joinAs==="spectator"?"spectator":"player"));}
      if(p==="rooms.joinPublic"){const x=await input(request);return ok(await roomIdFor(env,Number(x.roomId)).join(String(x.displayName).trim(),x.joinAs==="spectator"?"spectator":"player"));}
      if(p==="rooms.snapshot"){const x=await input(request);return ok(await roomIdFor(env,Number(x.roomId)).snapshot(Number(x.memberId),String(x.memberToken)));}
      if(p==="rooms.setReady"){const x=await input(request);return ok(await roomIdFor(env,Number(x.roomId)).ready(x));}
      if(p==="rooms.publicList"){const x=await input(request);return ok(await directory(env).list(Number(x.limit||30)));}
      if(p==="rooms.mediaToken"){return ok({configured:false,message:"الصوت الجماعي يحتاج ربط Cloudflare Realtime بعد نشر Worker الغرف."});}
      return fail("خدمة الغرف لا تعرف هذا الإجراء.",404);
    } catch(err){return fail(err instanceof Error?err.message:"حدث خطأ غير معروف.",400);}
  }
} satisfies ExportedHandler<Env>;
