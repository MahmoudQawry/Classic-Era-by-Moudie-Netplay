package expo.modules.moudieemulator

import android.view.KeyEvent

data class EmulatorTouchButton(val id: String, val label: String, val keyCode: Int)
data class DirectionalControlGroup(val up: EmulatorTouchButton, val down: EmulatorTouchButton, val left: EmulatorTouchButton, val right: EmulatorTouchButton)
data class EmulatorControlProfile(
  val systemId: String,
  val directions: DirectionalControlGroup,
  val actionButtons: List<EmulatorTouchButton>,
  val systemButtons: List<EmulatorTouchButton>,
  val shoulderButtons: List<EmulatorTouchButton> = emptyList(),
)

object EmulatorControlProfiles {
  private fun dpad() = DirectionalControlGroup(
    EmulatorTouchButton("up", "↑", KeyEvent.KEYCODE_DPAD_UP), EmulatorTouchButton("down", "↓", KeyEvent.KEYCODE_DPAD_DOWN),
    EmulatorTouchButton("left", "←", KeyEvent.KEYCODE_DPAD_LEFT), EmulatorTouchButton("right", "→", KeyEvent.KEYCODE_DPAD_RIGHT),
  )

  val FAMICOM = EmulatorControlProfile("nes", dpad(), listOf(EmulatorTouchButton("a", "A", KeyEvent.KEYCODE_BUTTON_A), EmulatorTouchButton("b", "B", KeyEvent.KEYCODE_BUTTON_B)), listOf(EmulatorTouchButton("select", "SELECT", KeyEvent.KEYCODE_BUTTON_SELECT), EmulatorTouchButton("start", "START", KeyEvent.KEYCODE_BUTTON_START)))
  val PS1 = EmulatorControlProfile("ps1", dpad(), listOf(EmulatorTouchButton("triangle", "△", KeyEvent.KEYCODE_BUTTON_X), EmulatorTouchButton("circle", "○", KeyEvent.KEYCODE_BUTTON_A), EmulatorTouchButton("square", "□", KeyEvent.KEYCODE_BUTTON_Y), EmulatorTouchButton("cross", "×", KeyEvent.KEYCODE_BUTTON_B)), listOf(EmulatorTouchButton("select", "SELECT", KeyEvent.KEYCODE_BUTTON_SELECT), EmulatorTouchButton("start", "START", KeyEvent.KEYCODE_BUTTON_START)), listOf(EmulatorTouchButton("l1", "L1", KeyEvent.KEYCODE_BUTTON_L1), EmulatorTouchButton("l2", "L2", KeyEvent.KEYCODE_BUTTON_L2), EmulatorTouchButton("r1", "R1", KeyEvent.KEYCODE_BUTTON_R1), EmulatorTouchButton("r2", "R2", KeyEvent.KEYCODE_BUTTON_R2)))
  val PSP = EmulatorControlProfile("psp", dpad(), listOf(EmulatorTouchButton("triangle", "△", KeyEvent.KEYCODE_BUTTON_X), EmulatorTouchButton("circle", "○", KeyEvent.KEYCODE_BUTTON_A), EmulatorTouchButton("square", "□", KeyEvent.KEYCODE_BUTTON_Y), EmulatorTouchButton("cross", "×", KeyEvent.KEYCODE_BUTTON_B)), listOf(EmulatorTouchButton("select", "SELECT", KeyEvent.KEYCODE_BUTTON_SELECT), EmulatorTouchButton("start", "START", KeyEvent.KEYCODE_BUTTON_START)), listOf(EmulatorTouchButton("l", "L", KeyEvent.KEYCODE_BUTTON_L1), EmulatorTouchButton("r", "R", KeyEvent.KEYCODE_BUTTON_R1)))
  val SEGA = EmulatorControlProfile("sega", dpad(), listOf(EmulatorTouchButton("a", "A", KeyEvent.KEYCODE_BUTTON_A), EmulatorTouchButton("b", "B", KeyEvent.KEYCODE_BUTTON_B), EmulatorTouchButton("c", "C", KeyEvent.KEYCODE_BUTTON_C), EmulatorTouchButton("x", "X", KeyEvent.KEYCODE_BUTTON_X), EmulatorTouchButton("y", "Y", KeyEvent.KEYCODE_BUTTON_Y), EmulatorTouchButton("z", "Z", KeyEvent.KEYCODE_BUTTON_Z)), listOf(EmulatorTouchButton("start", "START", KeyEvent.KEYCODE_BUTTON_START)))

  // N64 keeps the familiar face-button cluster while exposing C/Z/L/R for games that use them.
  val N64 = EmulatorControlProfile("n64", dpad(), listOf(
    EmulatorTouchButton("a", "A", KeyEvent.KEYCODE_BUTTON_A), EmulatorTouchButton("b", "B", KeyEvent.KEYCODE_BUTTON_B),
    EmulatorTouchButton("c", "C", KeyEvent.KEYCODE_BUTTON_C), EmulatorTouchButton("x", "C↑", KeyEvent.KEYCODE_BUTTON_X),
    EmulatorTouchButton("y", "C↓", KeyEvent.KEYCODE_BUTTON_Y), EmulatorTouchButton("z", "Z", KeyEvent.KEYCODE_BUTTON_Z),
  ), listOf(EmulatorTouchButton("start", "START", KeyEvent.KEYCODE_BUTTON_START)), listOf(EmulatorTouchButton("l", "L", KeyEvent.KEYCODE_BUTTON_L1), EmulatorTouchButton("r", "R", KeyEvent.KEYCODE_BUTTON_R1)))

  // Play! uses the PS-style face/shoulder layout; analog is handled by the physical controller when available.
  val PS2 = EmulatorControlProfile("ps2", dpad(), listOf(
    EmulatorTouchButton("triangle", "△", KeyEvent.KEYCODE_BUTTON_X), EmulatorTouchButton("circle", "○", KeyEvent.KEYCODE_BUTTON_A),
    EmulatorTouchButton("square", "□", KeyEvent.KEYCODE_BUTTON_Y), EmulatorTouchButton("cross", "×", KeyEvent.KEYCODE_BUTTON_B),
  ), listOf(EmulatorTouchButton("select", "SELECT", KeyEvent.KEYCODE_BUTTON_SELECT), EmulatorTouchButton("start", "START", KeyEvent.KEYCODE_BUTTON_START)), listOf(
    EmulatorTouchButton("l1", "L1", KeyEvent.KEYCODE_BUTTON_L1), EmulatorTouchButton("l2", "L2", KeyEvent.KEYCODE_BUTTON_L2), EmulatorTouchButton("r1", "R1", KeyEvent.KEYCODE_BUTTON_R1), EmulatorTouchButton("r2", "R2", KeyEvent.KEYCODE_BUTTON_R2),
  ))
}
