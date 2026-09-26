import { AudioSession, LiveKitRoom, registerGlobals, useRoomContext } from "@livekit/react-native";
import { ConnectionState, RoomEvent } from "livekit-client";
import { AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useLanguage } from "@/lib/language";

registerGlobals();

type VoiceMember = { id:number; displayName:string; role:"host"|"player"|"spectator" };
export type RoomVoiceChatHandle = {
  setMicrophoneEnabled:(enabled:boolean)=>Promise<void>;
  setSpeakerEnabled?:(enabled:boolean)=>Promise<void>;
};
type MediaToken = { configured:boolean; url?:string; roomName?:string; token?:string; canPublish?:boolean; message?:string };
type Props = {
  memberId?:number;
  members?:VoiceMember[];
  memberRole?:VoiceMember["role"];
  socket?:unknown;
  mediaToken?:MediaToken|null;
  teamMediaToken?:MediaToken|null;
  onChatPress?:()=>void;
};

export const RoomVoiceChat = forwardRef<RoomVoiceChatHandle, Props>(function RoomVoiceChat({members=[],mediaToken,onChatPress},ref){
  const {t}=useLanguage();
  const [audioSessionReady,setAudioSessionReady]=useState(false);

  useEffect(()=>{
    if(Platform.OS==="web" || !mediaToken?.configured) return;
    let active=true;
    void AudioSession.startAudioSession().then(()=>{if(active)setAudioSessionReady(true)}).catch(()=>setAudioSessionReady(false));
    return ()=>{active=false; void AudioSession.stopAudioSession();};
  },[mediaToken?.configured]);

  if(Platform.OS==="web") return null;
  if(!mediaToken?.configured || !mediaToken.url || !mediaToken.token){
    return <View style={styles.card}>
      <View style={styles.heading}><Text style={styles.title}>🎙️ {t("voice")}</Text><Text style={styles.offline}>LIVEKIT</Text></View>
      <Text style={styles.status}>{mediaToken?.message || "خدمة الصوت الإنتاجية غير متاحة حاليًا."}</Text>
    </View>;
  }

  return <View style={styles.card}>
    <LiveKitRoom
      serverUrl={mediaToken.url}
      token={mediaToken.token}
      connect={audioSessionReady}
      audio={false}
      video={false}
      options={{adaptiveStream:true,dynacast:true}}
      onError={(error)=>console.warn("[Moudie LiveKit]",error)}
    >
      <LiveKitVoiceControls members={members} onChatPress={onChatPress} ref={ref}/>
    </LiveKitRoom>
  </View>;
});

type ControlsProps={members:VoiceMember[];onChatPress?:()=>void};
const LiveKitVoiceControls=forwardRef<RoomVoiceChatHandle,ControlsProps>(function LiveKitVoiceControls({members,onChatPress},ref){
  const {t}=useLanguage();
  const room=useRoomContext();
  const [microphoneEnabled,setMicrophoneEnabled]=useState(false);
  const [speakerEnabled,setSpeakerEnabled]=useState(true);
  const [status,setStatus]=useState("VOICE CONNECTING");
  const [connectedPeers,setConnectedPeers]=useState(0);

  useEffect(()=>{
    const update=()=>{
      setStatus(room.state===ConnectionState.Connected?"VOICE CONNECTED":"VOICE CONNECTING");
      setConnectedPeers(room.remoteParticipants.size);
    };
    update();
    const onConnected=()=>update();
    const onDisconnected=()=>{setStatus("VOICE RECONNECTING");setConnectedPeers(0)};
    const onParticipant=()=>update();
    room.on(RoomEvent.Connected,onConnected);
    room.on(RoomEvent.Disconnected,onDisconnected);
    room.on(RoomEvent.ParticipantConnected,onParticipant);
    room.on(RoomEvent.ParticipantDisconnected,onParticipant);
    room.on(RoomEvent.ConnectionQualityChanged,onParticipant);
    return ()=>{
      room.off(RoomEvent.Connected,onConnected);
      room.off(RoomEvent.Disconnected,onDisconnected);
      room.off(RoomEvent.ParticipantConnected,onParticipant);
      room.off(RoomEvent.ParticipantDisconnected,onParticipant);
      room.off(RoomEvent.ConnectionQualityChanged,onParticipant);
    };
  },[room]);

  useEffect(()=>{
    const onAppState=(state:string)=>{
      if(state==="active" && room.state===ConnectionState.Disconnected) void room.reconnect();
    };
    const sub=AppState.addEventListener("change",onAppState);
    return ()=>sub.remove();
  },[room]);

  const setMic=async(enabled:boolean)=>{
    try{
      await room.localParticipant.setMicrophoneEnabled(enabled);
      setMicrophoneEnabled(enabled);
      setStatus(enabled?"MICROPHONE ON":"MICROPHONE OFF");
    }catch(error){
      setStatus(error instanceof Error?error.message:"Microphone unavailable");
      setMicrophoneEnabled(false);
    }
  };

  const setSpeaker=async(enabled:boolean)=>{
    setSpeakerEnabled(enabled);
    try{
      if(enabled) await AudioSession.selectAudioOutput("speaker");
      else {
        const outputs=await AudioSession.getAudioOutputs();
        const headset=outputs.find((x:any)=>x==="headset"||x==="bluetooth"||x==="earpiece");
        if(headset) await AudioSession.selectAudioOutput(headset);
      }
      setStatus(enabled?"SPEAKER ON":"AUDIO ROUTED");
    }catch{setStatus("AUDIO ROUTING UNAVAILABLE");}
  };

  useImperativeHandle(ref,()=>({setMicrophoneEnabled:setMic,setSpeakerEnabled:setSpeaker}),[room]);

  return <View>
    <View style={styles.heading}>
      <Text style={styles.title}>🎙️ {t("voice")}</Text>
      <Text style={styles.online}>{connectedPeers} PEERS</Text>
    </View>
    <Text style={styles.status}>{status}</Text>
    <View style={styles.row}>
      <Pressable onPress={()=>void setMic(!microphoneEnabled)} style={[styles.action,microphoneEnabled&&styles.active]}>
        <Text style={styles.actionText}>{microphoneEnabled?t("micOn"):t("micOff")}</Text>
      </Pressable>
      <Pressable onPress={onChatPress} style={styles.action}><Text style={styles.actionText}>CHAT</Text></Pressable>
      <Pressable onPress={()=>void setSpeaker(!speakerEnabled)} style={[styles.action,speakerEnabled&&styles.active]}>
        <Text style={styles.actionText}>{speakerEnabled?t("speakerOn"):t("speakerOff")}</Text>
      </Pressable>
    </View>
    <Text style={styles.members}>{members.length?members.map(m=>m.displayName).join(" · "):"Waiting for room members"}</Text>
  </View>;
});

RoomVoiceChat.displayName="RoomVoiceChat";
LiveKitVoiceControls.displayName="LiveKitVoiceControls";

const styles=StyleSheet.create({
  card:{backgroundColor:"#160D29",borderWidth:1,borderColor:"#4B3370",borderRadius:18,padding:14,marginTop:16},
  heading:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  title:{color:"#DCA7FF",fontSize:13,fontWeight:"900"},
  online:{color:"#9EEBFF",fontSize:10,fontWeight:"800"},
  offline:{color:"#FFB3B3",fontSize:10,fontWeight:"800"},
  status:{color:"#C5BDD3",fontSize:11,marginTop:6,lineHeight:16},
  row:{flexDirection:"row",gap:7,marginTop:10},
  action:{flex:1,minHeight:46,borderRadius:13,backgroundColor:"#231836",borderWidth:1,borderColor:"#433054",alignItems:"center",justifyContent:"center"},
  active:{backgroundColor:"#5A2993",borderColor:"#B768FF"},
  actionText:{color:"#FFFFFF",fontSize:10,fontWeight:"900"},
  members:{color:"#9086A6",fontSize:10,marginTop:9,lineHeight:15}
});
