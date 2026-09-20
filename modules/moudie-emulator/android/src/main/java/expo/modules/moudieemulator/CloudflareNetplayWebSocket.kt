package expo.modules.moudieemulator

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.math.abs

class CloudflareNetplayWebSocket(
  serverUrl:String,
  private val roomId:Int,
  private val memberId:Int,
  private val memberToken:String,
  private val onEvent:(String,JSONObject)->Unit,
  private val onConnected:()->Unit,
  private val onDisconnected:()->Unit,
  private val onError:(String)->Unit,
  private val onQuality:(NetplayQuality)->Unit,
){
  private val handler=Handler(Looper.getMainLooper())
  private val client=OkHttpClient.Builder().pingInterval(15,TimeUnit.SECONDS).build()
  private val url=serverUrl.trimEnd('/').replaceFirst(Regex("^http:"),"ws:").replaceFirst(Regex("^https:"),"wss:")+"/ws/room/$roomId"
  private var ws:WebSocket?=null
  private var running=false
  private var seq=0L
  private val pending=HashMap<Long,Long>()
  private var lastRtt:Long?=null
  private var smoothedRtt:Double?=null
  private var smoothedJitter:Double?=null

  private val probe=object:Runnable{
    override fun run(){
      if(!running)return
      val s=seq++
      pending[s]=SystemClock.elapsedRealtime()
      send("netplay:quality-probe",JSONObject().put("sequence",s))
      pending.entries.removeIf{SystemClock.elapsedRealtime()-it.value>2500L}
      handler.postDelayed(this,1000L)
    }
  }

  fun connect(){
    if(ws!=null)return
    running=true
    val request=Request.Builder().url(url).build()
    ws=client.newWebSocket(request,object:WebSocketListener(){
      override fun onOpen(webSocket:WebSocket,response:okhttp3.Response){
        webSocket.send(JSONObject().put("event","auth").put("payload",JSONObject().put("roomId",roomId).put("memberId",memberId).put("memberToken",memberToken)).toString())
        handler.post(probe)
      }
      override fun onMessage(webSocket:WebSocket,text:String){
        try{
          val packet=JSONObject(text)
          val event=packet.optString("event","")
          val payload=packet.optJSONObject("payload")?:JSONObject()
          if(event=="connect"){handler.post(onConnected)}
          if(event=="netplay:quality-pong"){
            val s=payload.optLong("sequence",-1L)
            val sent=pending.remove(s)
            if(sent!=null){
              val rtt=(SystemClock.elapsedRealtime()-sent).coerceAtLeast(0L)
              val jitter=lastRtt?.let{abs(rtt-it)}?:0L
              lastRtt=rtt
              smoothedRtt=smoothedRtt?.let{it*0.7+rtt*0.3}?:rtt.toDouble()
              smoothedJitter=smoothedJitter?.let{it*0.7+jitter*0.3}?:jitter.toDouble()
              val delay=((smoothedRtt?:rtt)+(smoothedJitter?:jitter)*1.5+16.0)/16.667
              onQuality(NetplayQuality((smoothedRtt?:rtt).toLong(),(smoothedJitter?:jitter).toLong(),0,"CONNECTED",delay.toLong().coerceIn(2L,45L)))
            }
          }
          if(event.isNotBlank())handler.post{onEvent(event,payload)}
        }catch(e:Exception){handler.post{onError(e.message?:"Invalid realtime packet")}}
      }
      override fun onFailure(webSocket:WebSocket,t:Throwable,response:okhttp3.Response?){handler.post{onError(t.message?:"Realtime connection failed")};handler.post(onDisconnected)}
      override fun onClosed(webSocket:WebSocket,code:Int,reason:String){handler.post(onDisconnected)}
    })
  }
  fun send(event:String,payload:JSONObject=JSONObject()){
    ws?.send(JSONObject().put("event",event).put("payload",payload).toString())
  }
  fun close(){running=false;handler.removeCallbacks(probe);pending.clear();ws?.close(1000,"done");ws=null;client.dispatcher.executorService.shutdown();client.connectionPool.evictAll()}
}
