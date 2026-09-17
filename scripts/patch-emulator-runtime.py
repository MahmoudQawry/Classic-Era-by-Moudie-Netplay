from pathlib import Path

path = Path("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalLibretroPlayerActivity.kt")
text = path.read_text(encoding="utf-8")

replacements = [
    (
        '  private var analogEnabled = false\n',
        '''  private var analogEnabled = false\n  private val localDevicePorts = mutableMapOf<Int, Int>()\n  private fun localPortForDevice(deviceId: Int): Int {\n    if (deviceId < 0) return 0\n    localDevicePorts[deviceId]?.let { return it }\n    val used = localDevicePorts.values.toSet()\n    val port = (0 until definition.maxControllerSlots).firstOrNull { it !in used } ?: 0\n    localDevicePorts[deviceId] = port\n    return port\n  }\n'''
    ),
    (
        '  override fun onKeyDown(k: Int, e: KeyEvent): Boolean { sendLocalKey(KeyEvent.ACTION_DOWN, k); return super.onKeyDown(k, e) }\n  override fun onKeyUp(k: Int, e: KeyEvent): Boolean { sendLocalKey(KeyEvent.ACTION_UP, k); return super.onKeyUp(k, e) }\n  override fun onGenericMotionEvent(e: MotionEvent?): Boolean { if (e != null) { retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_DPAD, e.getAxisValue(MotionEvent.AXIS_HAT_X), e.getAxisValue(MotionEvent.AXIS_HAT_Y), localPlayerIndex); retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_LEFT, e.getAxisValue(MotionEvent.AXIS_X), e.getAxisValue(MotionEvent.AXIS_Y), localPlayerIndex); retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_RIGHT, e.getAxisValue(MotionEvent.AXIS_Z), e.getAxisValue(MotionEvent.AXIS_RZ), localPlayerIndex) }; return super.onGenericMotionEvent(e) }\n',
        '''  override fun onKeyDown(k: Int, e: KeyEvent): Boolean {\n    sendLocalKey(KeyEvent.ACTION_DOWN, k, localPortForDevice(e.deviceId))\n    return true\n  }\n  override fun onKeyUp(k: Int, e: KeyEvent): Boolean {\n    sendLocalKey(KeyEvent.ACTION_UP, k, localPortForDevice(e.deviceId))\n    return true\n  }\n  override fun onGenericMotionEvent(e: MotionEvent?): Boolean {\n    if (e != null && ::retroView.isInitialized) {\n      val port = localPortForDevice(e.deviceId)\n      retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_DPAD, e.getAxisValue(MotionEvent.AXIS_HAT_X), e.getAxisValue(MotionEvent.AXIS_HAT_Y), port)\n      retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_LEFT, e.getAxisValue(MotionEvent.AXIS_X), e.getAxisValue(MotionEvent.AXIS_Y), port)\n      retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_RIGHT, e.getAxisValue(MotionEvent.AXIS_Z), e.getAxisValue(MotionEvent.AXIS_RZ), port)\n      return true\n    }\n    return super.onGenericMotionEvent(e)\n  }\n'''
    ),
    (
        '  private fun sendLocalKey(action: Int, keyCode: Int) {\n    if (!lockstepNetplay) { retroView.sendKeyEvent(action, keyCode, localPlayerIndex); return }\n',
        '''  private fun sendLocalKey(action: Int, keyCode: Int, port: Int = localPlayerIndex) {\n    if (!lockstepNetplay) { retroView.sendKeyEvent(action, keyCode, port.coerceIn(0, definition.maxControllerSlots - 1)); return }\n'''
    ),
    (
        '      val now = android.os.SystemClock.elapsedRealtime()\n      val targetFrame = nextLockstepFrame + netplayInputDelayFrames\n',
        '      val now = System.currentTimeMillis()\n      val targetFrame = nextLockstepFrame + netplayInputDelayFrames\n'
    ),
    (
        '  private fun addController() {\n',
        '''  private fun addController() {\n    // Touch controls are intentionally bound to player 1. Additional local players\n    // use connected physical controllers, which are assigned to free ports above.\n'''
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"Expected runtime snippet not found: {old[:90]!r}")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
print("Universal emulator runtime patched: local multi-controller ports + lockstep clock consistency")
