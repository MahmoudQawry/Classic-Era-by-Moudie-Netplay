import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, mediaDevices, registerGlobals, type MediaStream, type MediaStreamTrack } from "@livekit/react-native-webrtc";
import InCallManager from "react-native-incall-manager";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useLanguage } from "@/lib/language";

registerGlobals();

type VoiceMember = { id:number; displayName:string; role:"host"|"player"|"spectator" };
type VoiceChannel = "room"|"team";
export type RoomVoiceChatHandle = {
  setMicrophoneEnabled:(enabled:boolean)=>Promise<void>;
  setSpeakerEnabled?:(enabled:boolean)=>Promise<void>;
  setVoiceChannel?:(channel:VoiceChannel)=>void;
};
type Props = {
  memberId?:number;
  members?:VoiceMember[];
  memberRole?:VoiceMember["role"];
  socket?:{ on?:(event:string,cb:(payload:any)=>void)=>unknown; off?:(event:string,cb:(payload:any)=>void)=>unknown; emit?:(event:string,payload?:unknown)=>unknown; connected?:boolean }|null;
  mediaToken?:{configured:boolean;message?:string}|null;
  teamMediaToken?:{configured:boolean;message?:string}|null;
};

type PeerEntry={pc:RTCPeerConnection; pendingIce:RTCIceCandidate[]; channel:VoiceChannel};

const ICE_CONFIG={iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun.cloudflare.com:3478"}]};

export const RoomVoiceChat=forwardRef<RoomVoiceChatHandle,Props>(function RoomVoiceChat({memberId,members=[],memberRole,socket},ref){
  const {t}=useLanguage();
  const [channel,setChannel]=useState<VoiceChannel>("room");
  const [microphoneEnabled,setMicrophoneEnabled]=useState(false);
  const [speakerEnabled,setSpeakerEnabled]=useState(true);
  const [connectedPeers,setConnectedPeers]=useState(0);
  const [status,setStatus]=useState("VOICE READY");
  const peers=useRef(new Map<number,PeerEntry>());
  const localStream=useRef<MediaStream|null>(null);
  const socketRef=useRef(socket);
  socketRef.current=socket;
  const channelRef=useRef(channel);
  channelRef.current=channel;
  const micRef=useRef(microphoneEnabled);
  micRef.current=microphoneEnabled;

  const send=(event:string,payload:unknown)=>socketRef.current?.emit?.(event,payload);

  const closePeer=(remoteId:number)=>{
    const entry=peers.current.get(remoteId);
    if(!entry)return;
    try{entry.pc.close();}catch{}
    peers.current.delete(remoteId);
    setConnectedPeers(peers.current.size);
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
    if(existing && existing.channel===channelRef.current)return existing.pc;
    if(existing)closePeer(remoteId);
    const pc=new RTCPeerConnection(ICE_CONFIG as any);
    const entry:PeerEntry={pc,pendingIce:[],channel:channelRef.current};
    peers.current.set(remoteId,entry);
    setConnectedPeers(peers.current.size);
    pc.addEventListener("icecandidate",(event:any)=>{
      if(event.candidate)send("voice:signal",{targetMemberId:remoteId,channel:channelRef.current,type:"ice",candidate:event.candidate});
    });
    pc.addEventListener("track",()=>{setStatus("VOICE CONNECTED");});
    pc.addEventListener("connectionstatechange",()=>{
      const state=pc.connectionState;
      if(state==="connected")setStatus("VOICE CONNECTED");
      if(["failed","closed","disconnected"].includes(state)){closePeer(remoteId);}
    });
    await attachLocalTrack(pc);
    if(!localStream.current){
      try{(pc as any).addTransceiver("audio",{direction:"recvonly"});}catch{}
    }
    if(initiator){
      const offer=await pc.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:false} as any);
      await pc.setLocalDescription(offer);
      send("voice:signal",{targetMemberId:remoteId,channel:channelRef.current,type:"offer",description:offer});
    }
    return pc;
  };

  const renegotiate=async(remoteId:number)=>{
    const entry=peers.current.get(remoteId);
    if(!entry)return;
    await attachLocalTrack(entry.pc);
    const offer=await entry.pc.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:false} as any);
    await entry.pc.setLocalDescription(offer);
    send("voice:signal",{targetMemberId:remoteId,channel:channelRef.current,type:"offer",description:offer});
  };

  const handleSignal=async(payload:any)=>{
    if(!memberId || !payload || payload.channel!==channelRef.current)return;
    const from=Number(payload.fromMemberId);
    if(!from || from===memberId)return;
    const peer=await createPeer(from,false);
    if(!peer)return;
    if(payload.type==="offer"){
      await peer.setRemoteDescription(new (RTCSessionDescription as any)(payload.description));
      const entry=peers.current.get(from);
      if(entry){for(const candidate of entry.pendingIce){await peer.addIceCandidate(candidate).catch(()=>undefined);}entry.pendingIce=[];}
      const answer=await peer.createAnswer({offerToReceiveAudio:true,offerToReceiveVideo:false} as any);
      await peer.setLocalDescription(answer);
      send("voice:signal",{targetMemberId:from,channel:channelRef.current,type:"answer",description:answer});
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

  const enableMic=async(enabled:boolean)=>{
    if(enabled){
      try{
        if(!localStream.current){
          localStream.current=await mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false} as any);
        }
        localStream.current.getAudioTracks().forEach(track=>{track.enabled=true;});
        InCallManager.start({media:"audio"});
        InCallManager.setForceSpeakerphoneOn(speakerEnabled);
        setMicrophoneEnabled(true);
        for(const [id] of peers.current)await renegotiate(id);
        send("netplay:voice-status",{microphoneEnabled:true,speakerEnabled,voiceChannel:channelRef.current});
        setStatus("MICROPHONE ON");
      }catch(error){setStatus(error instanceof Error?error.message:"Microphone permission failed");setMicrophoneEnabled(false);}
    }else{
      localStream.current?.getAudioTracks().forEach(track=>{track.enabled=false;});
      setMicrophoneEnabled(false);
      send("netplay:voice-status",{microphoneEnabled:false,speakerEnabled,voiceChannel:channelRef.current});
      setStatus("MICROPHONE OFF");
    }
  };

  const switchChannel=(next:VoiceChannel)=>{
    if(next==="team" && memberRole==="spectator")return;
    setChannel(next);
    channelRef.current=next;
    for(const [id] of peers.current)closePeer(id);
    setTimeout(()=>{const online=members.filter(m=>m.id!==memberId && (next==="room" || m.role!=="spectator"));for(const m of online)if(memberId && memberId<m.id)void createPeer(m.id,true);},0);
  };

  useImperativeHandle(ref,()=>({setMicrophoneEnabled:enableMic,setSpeakerEnabled:async(enabled)=>{setSpeakerEnabled(enabled);InCallManager.setForceSpeakerphoneOn(enabled);},setVoiceChannel:switchChannel}),[speakerEnabled,memberRole,members,memberId]);

  useEffect(()=>{
    if(Platform.OS==="web")return;
    const onSignal=(p:any)=>void handleSignal(p);
    const onJoined=(p:any)=>{
      const online=Array.isArray(p?.onlineMemberIds)?p.onlineMemberIds.map(Number).filter((id:number)=>id&&id!==memberId):[];
      for(const id of online)if(memberId && memberId<id && (channelRef.current==="room" || members.find(m=>m.id===id)?.role!=="spectator"))void createPeer(id,true);
    };
    const onPresence=(p:any)=>{
      const id=Number(p?.memberId);
      if(!id||id===memberId)return;
      if(p?.online && memberId && memberId<id && (channelRef.current==="room" || members.find(m=>m.id===id)?.role!=="spectator"))void createPeer(id,true);
      if(!p?.online)closePeer(id);
    };
    socket?.on?.("voice:signal",onSignal);
    socket?.on?.("netplay:joined",onJoined);
    socket?.on?.("netplay:presence",onPresence);
    return()=>{socket?.off?.("voice:signal",onSignal);socket?.off?.("netplay:joined",onJoined);socket?.off?.("netplay:presence",onPresence);};
  },[socket,memberId,members,memberRole]);

  useEffect(()=>()=>{for(const [id] of peers.current)closePeer(id);localStream.current?.getTracks().forEach(t=>t.stop());try{InCallManager.stop();}catch{}},[]);

  if(Platform.OS==="web")return null;
  return <View style={styles.card}>
    <View style={styles.heading}><Text style={styles.title}>🎙️ {t("voice")}</Text><Text style={styles.online}>{connectedPeers} PEERS</Text></View>
    <Text style={styles.status}>{status}</Text>
    <View style={styles.row}>
      <Pressable onPress={()=>switchChannel("room")} style={[styles.chip,channel==="room"&&styles.active]}><Text style={styles.chipText}>🌍 {t("voiceChannelRoom")}</Text></Pressable>
      {memberRole!=="spectator"&&<Pressable onPress={()=>switchChannel("team")} style={[styles.chip,channel==="team"&&styles.active]}><Text style={styles.chipText}>👥 {t("voiceChannelTeam")}</Text></Pressable>}
    </View>
    <View style={styles.row}>
      <Pressable onPress={()=>void enableMic(!microphoneEnabled)} style={[styles.action,microphoneEnabled&&styles.active]}><Text style={styles.actionText}>{microphoneEnabled?t("micOn"):t("micOff")}</Text></Pressable>
      <Pressable onPress={()=>{const next=!speakerEnabled;setSpeakerEnabled(next);InCallManager.setForceSpeakerphoneOn(next);}} style={[styles.action,speakerEnabled&&styles.active]}><Text style={styles.actionText}>{speakerEnabled?t("speakerOn"):t("speakerOff")}</Text></Pressable>
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
  chip:{flex:1,paddingHorizontal:10,paddingVertical:8,borderRadius:12,backgroundColor:"#231836",borderWidth:1,borderColor:"#433054"},
  active:{backgroundColor:"#5A2993",borderColor:"#B768FF"},
  chipText:{color:"#FFFFFF",fontSize:10,fontWeight:"800",textAlign:"center"},
  action:{flex:1,minHeight:46,borderRadius:13,backgroundColor:"#231836",borderWidth:1,borderColor:"#433054",alignItems:"center",justifyContent:"center"},
  actionText:{color:"#FFFFFF",fontSize:10,fontWeight:"900"},
  members:{color:"#9086A6",fontSize:10,marginTop:9,lineHeight:15}
});
