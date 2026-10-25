package expo.modules.moudieemulator

import android.os.Process
import android.util.Log
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/**
 * High-performance low-latency UDP WebRTC-style Data transport.
 * Configured with { ordered: false, maxRetransmits: 0 } semantics (pure UDP).
 * Eliminates TCP head-of-line blocking for gamepad inputs.
 */
class NetplayUdpDataTransport(
  private val localMemberId: Int,
  private val onRemoteInput: (remoteMemberId: Int, frame: Long, mask: Int) -> Unit,
  private val onClockSync: ((masterFrame: Long, timestamp: Long) -> Unit)? = null,
) {
  companion object {
    private const val TAG = "NetplayUdpTransport"
    private const val MAGIC_HEADER: Short = 0x4D4E // 'MN'
    private const val TYPE_INPUT: Byte = 1
    private const val TYPE_CLOCK_SYNC: Byte = 2
    private const val PACKET_SIZE = 27
  }

  private var socket: DatagramSocket? = null
  private val running = AtomicBoolean(false)
  private var receiveThread: Thread? = null
  private val remotePeers = ConcurrentHashMap<Int, Pair<InetAddress, Int>>()

  val localPort: Int
    get() = socket?.localPort ?: 0

  init {
    try {
      socket = DatagramSocket().apply {
        receiveBufferSize = 64 * 1024
        sendBufferSize = 64 * 1024
        reuseAddress = true
      }
      startReceiving()
      Log.i(TAG, "Netplay UDP DataChannel listening on port ${socket?.localPort}")
    } catch (e: Exception) {
      Log.w(TAG, "Could not open Netplay UDP socket: ${e.message}")
    }
  }

  fun registerRemotePeer(memberId: Int, address: String, port: Int) {
    if (memberId <= 0 || port <= 0) return
    Thread {
      try {
        val inet = InetAddress.getByName(address)
        remotePeers[memberId] = Pair(inet, port)
        Log.i(TAG, "Registered UDP peer memberId=$memberId at $address:$port")
      } catch (e: Exception) {
        Log.w(TAG, "Could not resolve UDP peer $address: ${e.message}")
      }
    }.start()
  }

  fun isReady(): Boolean = socket != null && !socket!!.isClosed && remotePeers.isNotEmpty()

  fun sendInput(frame: Long, mask: Int) {
    val sock = socket ?: return
    if (sock.isClosed || remotePeers.isEmpty()) return

    val buffer = ByteBuffer.allocate(PACKET_SIZE).order(ByteOrder.BIG_ENDIAN).apply {
      putShort(MAGIC_HEADER)
      put(TYPE_INPUT)
      putInt(localMemberId)
      putLong(frame)
      putInt(mask)
      putLong(System.currentTimeMillis())
    }
    val bytes = buffer.array()

    for ((_, peer) in remotePeers) {
      try {
        val packet = DatagramPacket(bytes, bytes.size, peer.first, peer.second)
        sock.send(packet)
      } catch (_: Throwable) {
        // Unreliable fire-and-forget UDP: zero head-of-line blocking
      }
    }
  }

  fun sendClockSync(masterFrame: Long, timestamp: Long) {
    val sock = socket ?: return
    if (sock.isClosed || remotePeers.isEmpty()) return

    val buffer = ByteBuffer.allocate(PACKET_SIZE).order(ByteOrder.BIG_ENDIAN).apply {
      putShort(MAGIC_HEADER)
      put(TYPE_CLOCK_SYNC)
      putInt(localMemberId)
      putLong(masterFrame)
      putInt(0)
      putLong(timestamp)
    }
    val bytes = buffer.array()

    for ((_, peer) in remotePeers) {
      try {
        val packet = DatagramPacket(bytes, bytes.size, peer.first, peer.second)
        sock.send(packet)
      } catch (_: Throwable) {}
    }
  }

  private fun startReceiving() {
    running.set(true)
    receiveThread = Thread {
      Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
      val receiveData = ByteArray(PACKET_SIZE)
      val packet = DatagramPacket(receiveData, receiveData.size)

      while (running.get()) {
        try {
          val sock = socket ?: break
          sock.receive(packet)
          if (packet.length >= PACKET_SIZE) {
            val buf = ByteBuffer.wrap(packet.data, packet.offset, packet.length).order(ByteOrder.BIG_ENDIAN)
            val magic = buf.short
            if (magic == MAGIC_HEADER) {
              val type = buf.get()
              val remoteMemberId = buf.int
              val frame = buf.long
              val mask = buf.int
              val timestamp = buf.long

              if (type == TYPE_INPUT && remoteMemberId != localMemberId) {
                onRemoteInput(remoteMemberId, frame, mask)
              } else if (type == TYPE_CLOCK_SYNC && remoteMemberId != localMemberId) {
                onClockSync?.invoke(frame, timestamp)
              }
            }
          }
        } catch (_: SocketException) {
          break
        } catch (_: Throwable) {}
      }
    }.apply {
      name = "NetplayUdpReceiver"
      isDaemon = true
      start()
    }
  }

  fun close() {
    running.set(false)
    try {
      socket?.close()
    } catch (_: Throwable) {}
    socket = null
    receiveThread?.interrupt()
    receiveThread = null
    remotePeers.clear()
  }
}
