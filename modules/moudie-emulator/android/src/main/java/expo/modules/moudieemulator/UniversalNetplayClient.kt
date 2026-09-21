package expo.modules.moudieemulator

import org.json.JSONObject

data class UniversalNetplayConfig(
  val serverUrl:String,val roomId:Int,val memberId:Int,val memberToken:String,
  val system:String,val fingerprint:String,val coreVersion:String,val playerIndex:Int,
)

class UniversalNetplayClient(
  private val config:UniversalNetplayConfig,
  private val onBootstrap:(playerMemberIds:List<Int>)->Unit,
  private val onSessionGo:(startAt:Long,playerMemberIds:List<Int>)->Unit,
  private val onStateRequest:()->Unit,
  private val onRemoteInput:(remoteMemberId:Int,frame:Long,mask:Int,analogX:Int,analogY:Int)->Unit,
  private val onRemoteState:(encodedState:String,syncId:Long,encoding:String)->Unit,
  private val onChat:(displayName:String,text:String)->Unit,
  private val onStatus:(String)->Unit,
  private val onQuality:(NetplayQuality)->Unit,
  private val onDelayUpdate:((delay:Long)->Unit)?=null,
){
  private var transport:CloudflareNetplayWebSocket?=null
  fun connect(){
    if(transport!=null)return
    transport=CloudflareNetplayWebSocket(config.serverUrl,config.roomId,config.memberId,config.memberToken,
      onEvent={event,payload->handle(event,payload)},
      onConnected={transport?.send("netplay:session-ready",JSONObject().put("isReady",true).put("system",config.system).put("fingerprint",config.fingerprint).put("coreVersion",config.coreVersion));onStatus(config.system.uppercase()+" channel connected - adaptive sync active")},
      onDisconnected={onStatus("Game channel paused; auto-reconnecting...")},
      onError={onStatus("Emulator realtime: "+it)},
      onQuality={quality->onQuality(quality);onDelayUpdate?.invoke(quality.recommendedDelay)},
    )
    transport?.connect()
  }
  private fun handle(event:String,p:JSONObject){
    when(event){
      "netplay:joined"->{val ids=p.optJSONArray("onlineMemberIds").toIntList();if(ids.size>=2)onBootstrap(ids)}
      "netplay:session-start"->{if(p.optString("system")==config.system){val ids=p.optJSONArray("playerMemberIds").toIntList();val start=p.optLong("startAt",-1L);if(start>0L&&ids.size>=2)onSessionGo(start,ids)}}
      "netplay:session-start-refused"->onStatus(p.optString("message","The emulator session was refused."))
      "netplay:session-start-pending"->onStatus("Waiting for both devices to finish state synchronization...")
      "netplay:universal-sync-ack"->{if(p.optLong("syncId",-1L)==0L)onStatus("Shared game state acknowledged.")}
      "netplay:delay-update"->{val d=p.optLong("delay",-1L);if(d in 2..45)onDelayUpdate?.invoke(d)}
      "netplay:universal-state-request"->onStateRequest()
      "netplay:universal-input"->{val id=p.optInt("memberId",0);val frame=p.optLong("frame",-1);val mask=p.optInt("mask",-1);if(id>0&&frame>=0&&mask in 0..0xffff)onRemoteInput(id,frame,mask,p.optInt("analogX",0).coerceIn(-127,127),p.optInt("analogY",0).coerceIn(-127,127))}
      "netplay:universal-state"->{val state=p.optString("snapshot","");val sync=p.optLong("syncId",-1);val enc=p.optString("encoding","");if(state.isNotBlank()&&sync>=0&&(enc=="gzip-base64"||enc=="base64"))onRemoteState(state,sync,enc)}
      "netplay:chat"->{val text=p.optString("text","").trim();if(text.isNotEmpty())onChat(p.optString("displayName","Player"),text)}
      "netplay:desync-detected"->onStatus(p.optString("message","Desync detected - resyncing"))
      "netplay:frame-rejected"->onStatus("Sync: device ahead, slowing down")
    }
  }
  fun sendInputFrame(frame:Long,mask:Int,analogX:Int=0,analogY:Int=0){if(frame>=0&&mask in 0..0xffff&&analogX in -127..127&&analogY in -127..127)transport?.send("netplay:universal-input",JSONObject().put("frame",frame).put("mask",mask).put("analogX",analogX).put("analogY",analogY))}
  fun sendState(encodedState:String,syncId:Long,encoding:String){if(encodedState.isNotBlank()&&syncId>=0)transport?.send("netplay:universal-state",JSONObject().put("snapshot",encodedState).put("syncId",syncId).put("encoding",encoding))}
  fun requestState(minimumSyncId:Long=-1L){transport?.send("netplay:universal-state-request",JSONObject().put("minimumSyncId",minimumSyncId))}
  fun acknowledgeState(syncId:Long){if(syncId>=0)transport?.send("netplay:universal-sync-ack",JSONObject().put("syncId",syncId))}
  fun setSessionReady(isReady:Boolean){
    transport?.send("netplay:session-ready",JSONObject().put("isReady",isReady).put("fingerprint",config.fingerprint).put("coreVersion",config.coreVersion))
  }
  fun requestSessionStart(){
    transport?.send("netplay:session-start-request",JSONObject().put("system",config.system))
  }
  fun sendChat(text:String){val safe=text.trim().take(400);if(safe.isNotEmpty())transport?.send("netplay:chat",JSONObject().put("text",safe))}
  fun requestDelayIncrease(delay:Long,reason:String){if(delay in 2..45)transport?.send("netplay:delay-request",JSONObject().put("delay",delay).put("reason",reason))}
  fun reportDesync(frame:Long,predictedFrames:Int){transport?.send("netplay:desync-report",JSONObject().put("frame",frame).put("predictedFrames",predictedFrames))}
  fun close(){transport?.close();transport=null}
}

private fun org.json.JSONArray?.toIntList():List<Int>{
  if(this==null)return emptyList()
  return buildList{for(i in 0 until length()){val id=optInt(i,0);if(id>0)add(id)}}.distinct()
}