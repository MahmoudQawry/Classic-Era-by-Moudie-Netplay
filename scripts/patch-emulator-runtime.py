from pathlib import Path

path = Path("modules/moudie-emulator/android/src/main/java/expo/modules/moudieemulator/UniversalLibretroPlayerActivity.kt")
text = path.read_text(encoding="utf-8")

replacements = [
    (
        'import android.view.KeyEvent\n',
        'import android.view.KeyEvent\nimport android.view.InputDevice\n'
    ),
    (
        '  private var analogEnabled = false\n',
        '''  private var analogEnabled = false\n  private val localDevicePorts = mutableMapOf<Int, Int>()\n  private fun localPortForDevice(deviceId: Int): Int {\n    if (deviceId < 0) return 0\n    localDevicePorts[deviceId]?.let { return it }\n    val used = localDevicePorts.values.toSet()\n    val port = (0 until definition.maxControllerSlots).firstOrNull { it !in used } ?: 0\n    localDevicePorts[deviceId] = port\n    return port\n  }\n'''
    ),
    (
        '    analogEnabled = preferences.getBoolean("analog-enabled", false)\n',
        '    analogEnabled = preferences.getBoolean("analog-enabled", definition.system in setOf("n64", "ps2", "psp"))\n'
    ),
   (
        '    addController()\n    addMenu()\n',
        '    addController()\n    if (analogEnabled) attachAnalogStick()\n    addMenu()\n'
    ),
    (
        '  override fun onKeyDown(k: Int, e: KeyEvent): Boolean { sendLocalKey(KeyEvent.ACTION_DOWN, k); return super.onKeyDown(k, e) }\n  override fun onKeyUp(k: Int, e: KeyEvent): Boolean { sendLocalKey(KeyEvent.ACTION_UP, k); return super.onKeyUp(k, e) }\n  override fun onGenericMotionEvent(e: MotionEvent?): Boolean { if (e != null) { retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_DPAD, e.getAxisValue(MotionEvent.AXIS_HAT_X), e.getAxisValue(MotionEvent.AXIS_HAT_Y), localPlayerIndex); retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_LEFT, e.getAxisValue(MotionEvent.AXIS_X), e.getAxisValue(MotionEvent.AXIS_Y), localPlayerIndex); retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_RIGHT, e.getAxisValue(MotionEvent.AXIS_Z), e.getAxisValue(MotionEvent.AXIS_RZ), localPlayerIndex) }; return super.onGenericMotionEvent(e) }\n',
        '''  override fun onKeyDown(k: Int, e: KeyEvent): Boolean {\n    if (KeyEvent.isGamepadButton(k) || k == KeyEvent.KEYCODE_DPAD_UP || k == KeyEvent.KEYCODE_DPAD_DOWN || k == KeyEvent.KEYCODE_DPAD_LEFT || k == KeyEvent.KEYCODE_DPAD_RIGHT) {\n      sendLocalKey(KeyEvent.ACTION_DOWN, k, localPortForDevice(e.deviceId))\n      return true\n    }\n    return super.onKeyDown(k, e)\n  }\n  override fun onKeyUp(k: Int, e: KeyEvent): Boolean {\n    if (KeyEvent.isGamepadButton(k) || k == KeyEvent.KEYCODE_DPAD_UP || k == KeyEvent.KEYCODE_DPAD_DOWN || k == KeyEvent.KEYCODE_DPAD_LEFT || k == KeyEvent.KEYCODE_DPAD_RIGHT) {\n      sendLocalKey(KeyEvent.ACTION_UP, k, localPortForDevice(e.deviceId))\n      return true\n    }\n    return super.onKeyUp(k, e)\n  }\n  override fun onGenericMotionEvent(e: MotionEvent?): Boolean {\n    if (e != null && ::retroView.isInitialized && (e.source and InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK) {\n      val port = localPortForDevice(e.deviceId)\n      retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_DPAD, e.getAxisValue(MotionEvent.AXIS_HAT_X), e.getAxisValue(MotionEvent.AXIS_HAT_Y), port)\n      retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_LEFT, e.getAxisValue(MotionEvent.AXIS_X), e.getAxisValue(MotionEvent.AXIS_Y), port)\n      retroView.sendMotionEvent(GLRetroView.MOTION_SOURCE_ANALOG_RIGHT, e.getAxisValue(MotionEvent.AXIS_Z), e.getAxisValue(MotionEvent.AXIS_RZ), port)\n      return true\n    }\n    return super.onGenericMotionEvent(e)\n  }\n'''
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
        '    val face = arrayOf(74 to 168, 132 to 110, 16 to 110, 74 to 52)\n    p.actionButtons.forEachIndexed { i, c -> addControl(c, Gravity.RIGHT or Gravity.BOTTOM, face.getOrElse(i) { 74 to 52 }.first, face.getOrElse(i) { 74 to 52 }.second) }\n',
        '''    val face = when (definition.system) {\n      "n64" -> arrayOf(74 to 168, 132 to 110, 74 to 52, 74 to 110, 16 to 110, 132 to 52, 16 to 52)\n      "sega" -> arrayOf(74 to 168, 132 to 110, 16 to 110, 74 to 52, 132 to 52, 16 to 52)\n      else -> arrayOf(74 to 168, 132 to 110, 16 to 110, 74 to 52)\n    }\n    p.actionButtons.forEachIndexed { i, c ->\n      val position = face.getOrElse(i) { face.last() }\n      addControl(c, Gravity.RIGHT or Gravity.BOTTOM, position.first, position.second)\n    }\n'''
    ),
    (
        '    p.shoulderButtons.forEachIndexed { i, c -> addControl(c, if (i % 2 == 0) Gravity.LEFT or Gravity.TOP else Gravity.RIGHT or Gravity.TOP, 16 + (i / 2) * 72, 18) }\n',
        '    p.shoulderButtons.forEachIndexed { i, c -> val margin = 16 + (i / 2) * 72; val sideMargin = if (i % 2 == 0) margin else margin + 56; addControl(c, if (i % 2 == 0) Gravity.LEFT or Gravity.TOP else Gravity.RIGHT or Gravity.TOP, sideMargin, 18) }\n'
    ),
]

ps2_preload = '''    if (definition.system == "ps2" && !supportsPlayPs2Graphics()) {
      showError("PlayStation 2 requires OpenGL ES 3.2 or higher on Android. This device reports an older graphics level, so the game was blocked instead of crashing the app.")
      return
    }
    // Play! is an Android-specific core whose emulation thread calls into
    // Framework::CJavaVM. LibretroDroid opens cores with dlopen(), so the
    // core's JavaVM field is not initialized automatically. The native bridge
    // sets it from the current process JavaVM before the core starts.
    if (definition.system == "ps2") {
      val initialized = runCatching {
        System.loadLibrary("moudie_play_bridge")
        nativeInitializePlayJavaVm(core.absolutePath)
      }.getOrDefault(false)
      if (!initialized) {
        showError("Could not initialize the Play! PS2 Android runtime. The native JavaVM bridge could not initialize the core.")
        return
      }
    }
    private external fun nativeInitializePlayJavaVm(corePath: String): Boolean


if ps2_preload not in text:
    guard = '''    if (definition.system == "ps2" && !supportsPlayPs2Graphics()) {
      showError("PlayStation 2 requires OpenGL ES 3.2 or higher on Android. This device reports an older graphics level, so the game was blocked instead of crashing the app.")
      return
    }
'''
    if guard not in text:
        raise SystemExit("PS2 graphics guard missing")
    text = text.replace(guard, ps2_preload, 1)

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"Expected runtime snippet not found: {old[:90]!r}")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
print("Universal emulator runtime patched: local multi-controller ports + lockstep clock consistency + safe Android navigation + six-button layouts + safe HUD spacing + essential analog in all modes")
