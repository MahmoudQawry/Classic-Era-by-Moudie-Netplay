package expo.modules.moudieemulator

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.MotionEvent
import android.view.View

/**
 * On-screen analog stick for the PS1 and PSP players.
 *
 * The libretro views already accept analog axes through
 * `sendMotionEvent(MOTION_SOURCE_ANALOG_LEFT, x, y)`; this view provides the
 * missing touch control: a base circle with a knob, multi-touch aware, with a
 * dead zone and normalized (-1..1) output. Releasing always reports (0, 0) so
 * a stuck axis can never freeze the game.
 */
class AnalogStickView(
    context: Context,
    private val onMove: (x: Float, y: Float) -> Unit,
    private val onRelease: () -> Unit,
) : View(context) {

    companion object {
        private const val DEAD_ZONE = 0.16f
    }

    private val basePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#33000000")
        style = Paint.Style.FILL
    }
    private val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#99FFFFFF")
        style = Paint.Style.STROKE
        strokeWidth = 3f
    }
    private val knobPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.parseColor("#CCFFFFFF")
        style = Paint.Style.FILL
    }

    private var radius = 0f
    private var knobX = 0f
    private var knobY = 0f
    private var activePointerId = MotionEvent.INVALID_POINTER_ID

    override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
        radius = (minOf(width, height) / 2f) - 6f
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                activePointerId = event.getPointerId(0)
                handleMove(event)
                return true
            }
            MotionEvent.ACTION_POINTER_DOWN -> return true
            MotionEvent.ACTION_MOVE -> {
                val index = event.findPointerIndex(activePointerId)
                if (index < 0) return true
                handleMove(event)
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                activePointerId = MotionEvent.INVALID_POINTER_ID
                reset()
                return true
            }
            MotionEvent.ACTION_POINTER_UP -> {
                val id = event.getPointerId(event.actionIndex)
                if (id == activePointerId) {
                    activePointerId = MotionEvent.INVALID_POINTER_ID
                    reset()
                }
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    private fun handleMove(event: MotionEvent) {
        val index = event.findPointerIndex(activePointerId)
        if (index < 0) return
        val centerX = width / 2f
        val centerY = height / 2f
        val dx = event.getX(index) - centerX
        val dy = event.getY(index) - centerY
        val distance = kotlin.math.sqrt(dx * dx + dy * dy)
        val maxDistance = if (radius > 0f) radius else 1f
        val clamped = minOf(distance, maxDistance)
        val angle = kotlin.math.atan2(dy, dx)
        knobX = kotlin.math.cos(angle) * clamped
        knobY = kotlin.math.sin(angle) * clamped

        var nx = 0f
        var ny = 0f
        if (distance > 0f && maxDistance > 0f) {
            val magnitude = minOf(1f, distance / maxDistance)
            val shaped = if (magnitude < DEAD_ZONE) 0f else (magnitude - DEAD_ZONE) / (1f - DEAD_ZONE)
            nx = (kotlin.math.cos(angle) * shaped)
            ny = (kotlin.math.sin(angle) * shaped)
        }
        invalidate()
        onMove(nx.coerceIn(-1f, 1f), ny.coerceIn(-1f, 1f))
    }

    private fun reset() {
        knobX = 0f
        knobY = 0f
        invalidate()
        onRelease()
    }

    /** Releases the axis when the control is hidden or the player pauses. */
    fun releaseAxis() = reset()

    /** Draws the base circle and the knob at the current stick offset. */
    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val centerX = width / 2f
        val centerY = height / 2f
        canvas.drawCircle(centerX, centerY, radius, basePaint)
        canvas.drawCircle(centerX, centerY, radius, rimPaint)
        canvas.drawCircle(centerX + knobX, centerY + knobY, radius * 0.42f, knobPaint)
    }
}
