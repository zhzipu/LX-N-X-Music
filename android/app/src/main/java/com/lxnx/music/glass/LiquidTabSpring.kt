package com.lxnx.music.glass

import kotlin.math.*

/** Closed-form damped spring, stable on both 60Hz and 120Hz displays. */
internal class LiquidTabSpring(initial: Float, private val damping: Float, private val stiffness: Float) {
    var value = initial
        private set
    var velocity = 0f
        private set
    var target = initial
    val settled: Boolean get() = abs(value - target) < 0.001f && abs(velocity) < 0.01f
    fun snap(next: Float) { value = next; target = next; velocity = 0f }
    fun step(dt: Float) {
        if (settled) { snap(target); return }
        val omega = sqrt(stiffness)
        val displacement = value - target
        if (damping >= 1f) {
            val c = velocity + omega * displacement
            val decay = exp(-omega * dt)
            value = target + (displacement + c * dt) * decay
            velocity = (velocity - omega * c * dt) * decay
        } else {
            val decayRate = damping * omega
            val frequency = omega * sqrt(1f - damping * damping)
            val c = (velocity + decayRate * displacement) / frequency
            val phase = frequency * dt
            val decay = exp(-decayRate * dt)
            val oscillation = displacement * cos(phase) + c * sin(phase)
            value = target + decay * oscillation
            velocity = decay * (-decayRate * oscillation + frequency * (-displacement * sin(phase) + c * cos(phase)))
        }
    }
}
