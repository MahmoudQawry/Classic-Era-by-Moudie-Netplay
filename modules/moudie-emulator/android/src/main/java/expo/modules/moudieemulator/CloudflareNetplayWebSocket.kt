package expo.modules.moudieemulator

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import kotlin.math.abs

/**
 * Socket.IO transport used by the native emulator.
 *
 * The old implementation spoke to the experimental Cloudflare endpoint
 * (/ws/room/:id) using a custom JSON WebSocket protocol. Production NetPlay is
 * Express + Socket.IO, so the native client must use the exact same authority
 * and authentication protocol as the React Native client.
 */
class CloudflareNetplayWebSocket(
  serverUrl:String,
  private val roomId:Int,
  private val memberId:Int,
  private val memberToken:String,
  private val clientKind:String,
  private val onEvent:(String,JSONObject)->Unit,
  private val onConnected:()->Unit,
  private val onDisconnected:()->Unit,
  private val onError:(String)->Unit,
  private val onQuality:(NetplayQuality)->Unit,
){
  private val handler=Handler(Looper.getMainLooper())
  private val socket:Socket
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

  init {
    val options=IO.Options().apply{
      path="/api/netplay"
      reconnection=true
      reconnectionAttempts=Int.MAX_VALUE
      reconnectionDelay=750
      reconnectionDelayMax=5000
      timeout=12000
      forceNew=true
      auth=hashMapOf<String,String>().apply{
        put("roomId",roomId.toString())
        put("memberId",memberId.toString())
        put("memberToken",memberToken)
        put("clientKind",clientKind)
      }
    }
    socket=IO.socket(serverUrl.trimEnd('/'),options)

    socket.on(Socket.EVENT_CONNECT){
      handler.post{
        onConnected()
        handler.post(probe)
      }
    }
    socket.on(Socket.EVENT_DISCONNECT){
      handler.post(onDisconnected)
    }
    socket.on(Socket.EVENT_CONNECT_ERROR){args->
      val message=(args.firstOrNull() as? Throwable)?.message
        ?: (args.firstOrNull()?.toString() ?: "Realtime connection failed")
      handler.post{onError(message)}
    }

    val events=listOf(
      "netplay:quality-pong",
      "netplay:joined",
      "netplay:presence",
      "netplay:session-start",
      "netplay:session-state",
      "netplay:session-start-refused",
      "netplay:ps1-session-bootstrap",
      "netplay:ps1-session-go",
      "netplay:ps1-waiting",
      "netplay:ps1-state-request",
      "netplay:ps1-input",
      "netplay:ps1-state",
      "netplay:ps1-sync-ack",
      "netplay:universal-session-bootstrap",
      "netplay:universal-session-go",
      "netplay:universal-waiting",
      "netplay:universal-state-request",
      "netplay:universal-input",
      "netplay:universal-state",
      "netplay:universal-sync-ack",
      "netplay:frame-rejected",
      "netplay:delay-update",
      "netplay:desync-detected",
      "netplay:desync-resync-request",
      "netplay:input-ack",
    )
    events.forEach{event->
      socket.on(event){args->
        val payload=(args.firstOrNull() as? JSONObject)?:JSONObject()
        if(event=="netplay:quality-pong") handleQuality(payload)
        handler.post{onEvent(event,payload)}
      }
    }
  }

  private fun handleQuality(payload:JSONObject){
    val s=payload.optLong("sequence",-1L)
    val sent=pending.remove(s)?:return
    val rtt=(SystemClock.elapsedRealtime()-sent).coerceAtLeast(0L)
    val jitter=lastRtt?.let{abs(rtt-it)}?:0L
    lastRtt=rtt
    smoothedRtt=smoothedRtt?.let{it*0.7+rtt.toDouble()*0.3}?:rtt.toDouble()
    smoothedJitter=smoothedJitter?.let{it*0.7+jitter.toDouble()*0.3}?:jitter.toDouble()
    val measuredRttMs=smoothedRtt?:rtt.toDouble()
    val measuredJitterMs=smoothedJitter?:jitter.toDouble()
    val delay=(measuredRttMs+(measuredJitterMs*1.5)+16.0)/16.667
    onQuality(NetplayQuality(
      rttMs=measuredRttMs.toLong(),
      jitterMs=measuredJitterMs.toLong(),
      probeLossPercent=0,
      grade="CONNECTED",
      recommendedDelay=delay.toLong().coerceIn(2L,45L),
    ))
  }

  fun connect(){
    if(running)return
    running=true
    socket.connect()
  }

  fun send(event:String,payload:JSONObject=JSONObject()){
    if(socket.connected()) socket.emit(event,payload)
  }

  fun close(){
    running=false
    handler.removeCallbacks(probe)
    pending.clear()
    socket.disconnect()
    socket.close()
  }
}
