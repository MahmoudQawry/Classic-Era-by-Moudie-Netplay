import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices, registerGlobals, type MediaStream, type MediaStreamTrack } from "@livekit/react-native-webrtc";
import InCallManager from "react-native-incall-manager";
import { AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useLanguage } from "@/lib/language";

registerGlobals();

type VoiceMember = { id:number; displayName:string; role:"host"|"player"|"spectator" };
export type RoomVoiceChatHandle = {
  setMicrophoneEnabled:(enabled:boolean)=>Promise<void>;
  setSpeakerEnabled?:(enabled:boolean)=>Promise<void>;
};
type Props = {
  memberId?:number;
  members?:VoiceMember[];
  memberRole?:VoiceMember["role"];
  socket?:{ on?:(event:string,cb:(payload:any)=>void)=>unknown; off?:(event:string,cb:(payload:any)=>void)=>unknown; emit?:(event:string,payload?:unknown)=>unknown; connected?:boolean }|null;
  mediaToken?:{configured:boolean;message?:string}|null;
  teamMediaToken?:{configured:boolean;message?:string}|null;
  onChatPress?:()=>void;
};

type PeerEntry={pc:RTCPeerConnection; pendingIce:RTCIceCandidate[]};

const TURN_URL=process.env.EXPO_PUBLIC_TURN_URL?.trim();
const TURN_USERNAME=process.env.EXPO_PUBLIC_TURN_USERNAME?.trim();
const TURN_CREDENTIAL=process.env.EXPO_PUBLIC_TURN_CREDENTIAL?.trim();
const ICE_CONFIG={iceServers:[
  {urls:"stun:stun.l.google.com:19302"},
  {urls:"stun:stun.cloudflare.com:3478"},
  ...(TURN_URL&&TURN_USERNAME&&TURN_CREDENTIAL?[{urls:TURN_URL,username:TURN_USERNAME,credential:TURN_CREDENTIAL}]:[]),
]};

export const RoomVoiceChat=forwardRef<RoomVoiceChatHandle,Props>(function RoomVoiceChat({memberId,members=[],socket,onChatPress},ref){
  const {t}=useLanguage();
  const [microphoneEnabled,setMicrophoneEnabled]=useState(false);
  const [speakerEnabled,setSpeakerEnabled]=useState(true);
  const [connectedPeers,setConnectedPeers]=useState(0);
  const [status,setStatus]=useState("VOICE READY");
  const peers=useRef(new Map<number,PeerEntry>());
  const makingOffer=useRef(new Set<number>());
  const localStream=useRef<MediaStream|null>(null);
  const remoteTracks=useRef(new Map<number,MediaStreamTrack[]>());
  const socketRef=useRef(socket);
  socketRef.current=socket;
  const micRef=useRef(microphoneEnabled);
  micRef.current=microphoneEnabled;
  const speakerRef=useRef(speakerEnabled);
  const retryTimers=useRef(new Map<number,ReturnType<typeof setTimeout>>());
  speakerRef.current=speakerEnabled;

  const send=(event:string,payload:unknown)=>socketRef.current?.emit?.(event,payload);

  const ensureAudioSession=()=>{
    try{
      InCallManager.start({media:"audio",auto:true});
      InCallManager.setForceSpeakerphoneOn(speakerRef.current);
      InCallManager.setSpeakerphoneOn(speakerRef.current);
    }catch{}
  };

  const applySpeakerMute=(enabled:boolean)=>{
    for(const tracks of remoteTracks.current.values()) tracks.forEach(track=>{track.enabled=enabled;});
  };

  const closePeer=(remoteId:number)=>{
    const entry=peers.current.get(remoteId);
    if(entry){try{entry.pc.close();}catch{} peers.current.delete(remoteId);}
    remoteTracks.current.delete(remoteId);
    setConnectedPeers(Array.from(peers.current.values()).filter(x=>x.pc.connectionState==="connected").length);
  };

  const attachLocalTrack=async(pc:RTCPeerConnection)=>{
    const stream=localStream.current;
    const track=stream?.getAudioTracks?.()[0] as MediaStreamTrack|undefined;
    const transceivers=(pc as any).getTransceivers?.()||[];
    const audio=transceivers.find((x:any)=>x.receiver?.track?.kind==="audio" || x.sender?.track?.kind==="audio" || x.mid===null);
    if(track && audio?.sender){
      await audio.sender.replaceTrack(track).catch(()=>undefined);
      try{audio.direction="sendrecv";}catch{}
    }else if(track){
      pc.addTrack(track,stream!);
    }
    if(!track && audio){try{audio.direction="recvonly";}catch{}}
  };

  const createPeer=async(remoteId:number,initiator:boolean)=>{
    if(!memberId || remoteId===memberId)return;
    const existing=peers.current.get(remoteId);
    if(existing)return existing.pc;
    const pc=new RTCPeerConnection(ICE_CONFIG as any);
    peers.current.set(remoteId,{pc,pendingIce:[]});
    setConnectedPeers(peers.current.size);
    pc.addEventListener("icecandidate",(event:any)=>{
      if(event.candidate)send("voice:signal",{targetMemberId:remoteId,type:"ice",candidate:event.candidate});
    });
    pc.addEventListener("track",(event:any)=>{
      ensureAudioSession();
      const streamTracks=(event.streams?.[0]?.getAudioTracks?.()||[]).filter(Boolean) as MediaStreamTrack[];
      const fallbackTrack=event.track?.kind==="audio" ? [event.track as MediaStreamTrack] : [];
      const tracks=streamTracks.length ? streamTracks : fallbackTrack;
      if(tracks.length){
        remoteTracks.current.set(remoteId,tracks);
        applySpeakerMute(speakerRef.current);
        setStatus("VOICE CONNECTED");
      }
    });
    pc.addEventListener("iceconnectionstatechange",()=>{
      const state=pc.iceConnectionState;
      if(state==="connected" || state==="completed") setStatus("VOICE CONNECTED");
      if(state==="checking") setStatus("VOICE CONNECTING");
      if(state==="failed"){
        try{pc.restartIce();}catch{}
        closePeer(remoteId);
        if(socketRef.current?.connected && memberId && memberId<remoteId){
          setTimeout(()=>{ if(socketRef.current?.connected) void createPeer(remoteId,true).catch(()=>setStatus("VOICE CONNECTION RETRYING")); },750);
        }
      }
    });
    pc.addEventListener("connectionstatechange",()=>{
      const state=pc.connectionState;
      if(state==="connected")setStatus("VOICE CONNECTED");
      if(["failed","closed","disconnected"].includes(state))closePeer(remoteId);
    });
    await attachLocalTrack(pc);
    if(!localStream.current){
      try{(pc as any).addTransceiver("audio",{direction:"recvonly"});}catch{}
    }
    if(initiator){
      const offer=await pc.createOffer();
      await pc.setLocalDescription(offer);
      send("voice:signal",{targetMemberId:remoteId,type:"offer",description:offer});
    }
    return pc;
  };

  const renegotiate=async(remoteId:number)=>{
    const entry=peers.current.get(remoteId);
    if(!entry || entry.pc.signalingState!=="stable" || makingOffer.current.has(remoteId))return;
    makingOffer.current.add(remoteId);
    try{
      await attachLocalTrack(entry.pc);
      if(entry.pc.signalingState!=="stable")return;
      const offer=await entry.pc.createOffer();
      await entry.pc.setLocalDescription(offer);
      if(entry.pc.localDescription) send("voice:signal",{targetMemberId:remoteId,type:"offer",description:entry.pc.localDescription});
    }catch(error){
      setStatus(error instanceof Error?error.message:"VOICE NEGOTIATION FAILED");
    }finally{
      makingOffer.current.delete(remoteId);
    }
  };

  const handleSignal=async(payload:any)=>{
    if(!memberId || !payload)return;
    const from=Number(payload.fromMemberId);
    if(!from || from===memberId)return;
    const peer=await createPeer(from,false);
    if(!peer)return;
    if(payload.type==="offer"){
      const polite=Boolean(memberId && memberId>from);
      const offerCollision=makingOffer.current.has(from) || peer.signalingState!=="stable";
      if(offerCollision && !polite)return;
      await peer.setRemoteDescription(new (RTCSessionDescription as any)(payload.description));
      const entry=peers.current.get(from);
      if(entry){for(const candidate of entry.pendingIce){await peer.addIceCandidate(candidate).catch(()=>undefined);}entry.pendingIce=[];}
      const answer=await peer.createAnswer();
      await peer.setLocalDescription(answer);
      if(peer.localDescription)send("voice:signal",{targetMemberId:from,type:"answer",description:peer.localDescription});
    }else if(payload.type==="answer"){
      await peer.setRemoteDescription(new (RTCSessionDescription as any)(payload.description));
      const entry=peers.current.get(from);
      if(entry){for(const candidate of entry.pendingIce){await peer.addIceCandidate(candidate).catch(()=>undefined);}entry.pendingIce=[];}
    }else if(payload.type==="ice"){
      const candidate=new (RTCIceCandidate as any)(payload.candidate);
      if(peer.remoteDescription)await peer.addIceCandidate(candidate).catch(()=>undefined);
      else peers.current.get(from)?.pendingIce.push(candidate);
    }
  };

  const ensurePeers=()=>{
    if(!memberId || !socketRef.current?.connected) return;
    for(const member of members){
      const remoteId=Number(member.id);
      if(!remoteId || remoteId===memberId || memberId>=remoteId) continue;
      const existing=peers.current.get(remoteId);
      if(existing && (existing.pc.connectionState==="connected" || existing.pc.connectionState==="connecting")) continue;
      if(existing) closePeer(remoteId);
      void createPeer(remoteId,true).catch(()=>setStatus("VOICE CONNECTION RETRYING"));
    }
  };

  const enableMic=async(enabled:boolean)=>{
    ensurePeers();
    if(enabled){
      try{
        ensureAudioSession();
        if(!localStream.current){
          localStream.current=await mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false} as any);
        }
        localStream.current.getAudioTracks().forEach(track=>{track.enabled=true;});
        setMicrophoneEnabled(true);
        for(const [id] of peers.current)await renegotiate(id);
        send("netplay:voice-status",{microphoneEnabled:true,speakerEnabled:speakerRef.current});
        setStatus("MICROPHONE ON");
      }catch(error){
        setStatus(error instanceof Error?error.message:"Microphone permission failed");
        setMicrophoneEnabled(false);
      }
    }else{
      localStream.current?.getAudioTracks().forEach(track=>{track.enabled=false;});
      setMicrophoneEnabled(false);
      send("netplay:voice-status",{microphoneEnabled:false,speakerEnabled:speakerRef.current});
      setStatus("MICROPHONE OFF");
    }
  };

  const toggleSpeaker=async(enabled:boolean)=>{
    setSpeakerEnabled(enabled);
    speakerRef.current=enabled;
    try{InCallManager.start({media:"audio",auto:true});InCallManager.setForceSpeakerphoneOn(enabled);InCallManager.setSpeakerphoneOn(enabled);}catch{}
    applySpeakerMute(enabled);
    send("netplay:voice-status",{microphoneEnabled:micRef.current,speakerEnabled:enabled});
    setStatus(enabled?"SPEAKER ON":"SPEAKER MUTED");
  };

  useImperativeHandle(ref,()=>({setMicrophoneEnabled:enableMic,setSpeakerEnabled:toggleSpeaker}),[memberId,members]);

  useEffect(()=>{
    if(Platform.OS==="web")return;
    const onSignal=(p:any)=>void handleSignal(p);
    const onJoined=(p:any)=>{
      const online=Array.isArray(p?.onlineMemberIds)?p.onlineMemberIds.map(Number).filter((id:number)=>id&&id!==memberId):[];
      for(const id of online){
        if(!memberId || memberId>=id)continue;
        const existing=peers.current.get(id);
        if(existing?.pc.connectionState==="connected")continue;
        if(existing)closePeer(id);
        void createPeer(id,true).catch(()=>setStatus("VOICE CONNECTION RETRYING"));
      }
    };
    const onPresence=(p:any)=>{
      const id=Number(p?.memberId);
      if(!id||id===memberId)return;
      if(p?.online && memberId && memberId<id){
        const existing=peers.current.get(id);
        if(existing?.pc.connectionState!=="connected" && existing)closePeer(id);
        void createPeer(id,true).catch(()=>setStatus("VOICE CONNECTION RETRYING"));
      }
      if(!p?.online)closePeer(id);
    };
    const onDisconnect=()=>{
      for(const [id] of peers.current)closePeer(id);
      setStatus("VOICE RECONNECTING");
    };
    socket?.on?.("voice:signal",onSignal);
    socket?.on?.("netplay:joined",onJoined);
    socket?.on?.("netplay:presence",onPresence);
    socket?.on?.("disconnect",onDisconnect);
    return()=>{socket?.off?.("voice:signal",onSignal);socket?.off?.("netplay:joined",onJoined);socket?.off?.("netplay:presence",onPresence);socket?.off?.("disconnect",onDisconnect);};
  },[socket,memberId,members]);

  // Reconcile peers from the room member list too, closing late-listener/reconnect races.
  useEffect(()=>{
    if(Platform.OS==="web" || !memberId || !socket?.connected)return;
    for(const member of members){
      const remoteId=Number(member.id);
      if(!remoteId || remoteId===memberId || memberId>remoteId)continue;
      const existing=peers.current.get(remoteId);
      if(existing?.pc.connectionState==="connected" || existing?.pc.connectionState==="connecting")continue;
      if(existing)closePeer(remoteId);
      void createPeer(remoteId,true).catch(()=>setStatus("VOICE CONNECTION RETRYING"));
    }
  },[socket,memberId,members]);

  useEffect(()=>()=>{for(const [id] of peers.current)closePeer(id);makingOffer.current.clear();localStream.current?.getTracks().forEach(t=>t.stop());try{InCallManager.stop();}catch{}},[]);

  if(Platform.OS==="web")return null;
  return <View style={styles.card}>
    <View style={styles.heading}><Text style={styles.title}>🎙️ {t("voice")}</Text><Text style={styles.online}>{connectedPeers}/{Math.max(0, members.filter(m=>m.id!==memberId).length)} PEERS</Text></View>
    <Text style={styles.status}>{status}</Text>
    <View style={styles.row}>
      <Pressable onPress={()=>void enableMic(!microphoneEnabled)} style={[styles.action,microphoneEnabled&&styles.active]}><Text style={styles.actionText}>{microphoneEnabled?t("micOn"):t("micOff")}</Text></Pressable>
      <Pressable onPress={onChatPress} style={styles.action}><Text style={styles.actionText}>CHAT</Text></Pressable>
      <Pressable onPress={()=>void toggleSpeaker(!speakerEnabled)} style={[styles.action,speakerEnabled&&styles.active]}><Text style={styles.actionText}>{speakerEnabled?t("speakerOn"):t("speakerOff")}</Text></Pressable>
    </View>
    <Text style={styles.members}>{members.length?members.map(m=>m.id===memberId?m.displayName+" (YOU)":m.displayName).join(" · "):"Waiting for room members"}</Text>
  </View>;
});

RoomVoiceChat.displayName="RoomVoiceChat";
const styles=StyleSheet.create({
  card:{backgroundColor:"#160D29",borderWidth:1,borderColor:"#4B3370",borderRadius:18,padding:14,marginTop:16},
  heading:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  title:{color:"#DCA7FF",fontSize:13,fontWeight:"900"},
  online:{color:"#9EEBFF",fontSize:10,fontWeight:"800"},
  status:{color:"#C5BDD3",fontSize:11,marginTop:6,lineHeight:16},
  row:{flexDirection:"row",gap:7,marginTop:10},
  action:{flex:1,minHeight:46,borderRadius:13,backgroundColor:"#231836",borderWidth:1,borderColor:"#433054",alignItems:"center",justifyContent:"center"},
  active:{backgroundColor:"#5A2993",borderColor:"#B768FF"},
  actionText:{color:"#FFFFFF",fontSize:10,fontWeight:"900"},
  members:{color:"#9086A6",fontSize:10,marginTop:9,lineHeight:15}
});
