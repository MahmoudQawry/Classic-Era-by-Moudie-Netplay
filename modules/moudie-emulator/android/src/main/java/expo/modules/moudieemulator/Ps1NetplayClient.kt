package expo.modules.moudieemulator

import org.json.JSONObject

data class Ps1NetplayConfig(val serverUrl:String,val roomId:Int,val memberId:Int,val memberToken:String,val fingerprint:String,val coreVersion:String,val playerIndex:Int)

class Ps1NetplayClient(
  private val config:Ps1NetplayConfig,
  private val onBootstrap:()->Unit,
  private val onSessionGo:(startAt:Long,playerMemberIds:List<Int>)->Unit,
  private val onStateRequest:()->Unit,
  private val onRemoteInput:(memberId:Int,frame:Long,mask:Int)->Unit,
  private val onRemoteState:(encodedState:String,syncId:Long,encoding:String)->Unit,
  private val onChat:(displayName:String,text:String)->Unit,
  private val onStatus:(String)->Unit,
  private val onQuality:(NetplayQuality)->Unit,
  private val onDelayUpdate:((delay:Long)->Unit)?=null,
){
  private var transport:CloudflareNetplayWebSocket?=null
  private var nextInputSequence=0L
  fun connect(){
    if(transport!=null)return
    transport=CloudflareNetplayWebSocket(config.serverUrl,config.roomId,config.memberId,config.memberToken,
       clientKind="ps1-player",
      onEvent={event,payload->handle(event,payload)},
      onConnected={transport?.send("netplay:ps1-ready",JSONObject().put("fingerprint",config.fingerprint).put("coreVersion",config.coreVersion));onStatus("PS1 channel connected. adaptive sync active.")},
      onDisconnected={onStatus("PS1 paused; auto-reconnecting...")},
      onError={onStatus("PS1 realtime: "+it)},
      onQuality={quality->onQuality(quality);onDelayUpdate?.invoke(quality.recommendedDelay)},
    )
    transport?.connect()
  }
  private fun handle(event:String,p:JSONObject){
    when(event){
      "netplay:joined"->onBootstrap()
      "netplay:session-start"->{transport?.send("netplay:ps1-ready",JSONObject().put("fingerprint",config.fingerprint).put("coreVersion",config.coreVersion))}
      "netplay:ps1-session-bootstrap"->{onBootstrap()}
      "netplay:ps1-session-go"->{val start=p.optLong("startAt",-1L);val ids=p.optJSONArray("playerMemberIds").toIntList();if(start>0L&&ids.size>=2)onSessionGo(start,ids)}
      "netplay:session-state"->{onStatus("PS1 session: "+p.optString("state","unknown"))}
      "netplay:session-start-refused"->onStatus(p.optString("message","The room refused this session start."))
      "netplay:ps1-state-request"->onStateRequest()
      "netplay:ps1-input"->{val id=p.optInt("memberId",-1);val frame=p.optLong("frame",-1L);val mask=p.optInt("mask",-1);if(id>0&&frame>=0&&mask in 0..0xffff)onRemoteInput(id,frame,mask)}
      "netplay:ps1-state"->{val state=p.optString("snapshot","");val sync=p.optLong("syncId",-1L);val enc=p.optString("encoding","");if(state.isNotBlank()&&sync>=0&&(enc=="gzip-base64"||enc=="base64"))onRemoteState(state,sync,enc)}
      "netplay:chat"->{val text=p.optString("text","").trim();if(text.isNotEmpty())onChat(p.optString("displayName","Other player"),text)}
      "netplay:desync-detected"->onStatus(p.optString("message","Desync detected - resyncing"))
      "netplay:frame-rejected"->onStatus("Sync: slowing down, device ahead")
      "netplay:input-ack"->{ if(p.optString("channel","")=="ps1" && !p.optBoolean("accepted",true)) onStatus("Input sequence rejected; transport resyncing.") }
      "netplay:delay-update"->{val d=p.optLong("delay",-1L);if(d in 2..45)onDelayUpdate?.invoke(d)}
    }
  }
  fun sendInputFrame(frame:Long,mask:Int){if(frame>=0&&mask in 0..0xffff){val sequence=nextInputSequence++;transport?.send("netplay:ps1-input",JSONObject().put("frame",frame).put("mask",mask).put("sequence",sequence))}}
  fun sendState(encodedState:String,syncId:Long,encoding:String){if(encodedState.isNotBlank()&&syncId>=0)transport?.send("netplay:ps1-state",JSONObject().put("snapshot",encodedState).put("syncId",syncId).put("encoding",encoding))}
  fun requestState(minimumSyncId:Long=-1L){transport?.send("netplay:ps1-state-request",JSONObject().put("minimumSyncId",minimumSyncId))}
  fun acknowledgeState(syncId:Long){if(syncId>=0)transport?.send("netplay:ps1-sync-ack",JSONObject().put("syncId",syncId))}
  fun setSessionReady(isReady:Boolean){
    if(isReady) transport?.send("netplay:ps1-ready",JSONObject().put("fingerprint",config.fingerprint).put("coreVersion",config.coreVersion))
  }
  fun requestSessionStart(){
    transport?.send("netplay:session-start-request",JSONObject().put("system","ps1"))
  }
  fun sendChat(text:String){val safe=text.trim().take(400);if(safe.isNotEmpty())transport?.send("netplay:chat",JSONObject().put("text",safe))}
  fun requestDelayIncrease(delay:Long,reason:String){if(delay in 2..45)transport?.send("netplay:delay-request",JSONObject().put("delay",delay).put("reason",reason))}
  fun reportDesync(frame:Long,predictedFrames:Int){transport?.send("netplay:desync-report",JSONObject().put("frame",frame).put("predictedFrames",predictedFrames))}
  fun close(){nextInputSequence=0L;transport?.close();transport=null}
}

private fun org.json.JSONArray?.toIntList():List<Int>{if(this==null)return emptyList();return buildList{for(i in 0 until length()){val id=optInt(i,0);if(id>0)add(id)}}.distinct()}