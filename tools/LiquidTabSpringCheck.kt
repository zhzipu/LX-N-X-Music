package com.lxnx.music.glass

import kotlin.math.abs

/** Run against the actual production spring, without Android or a test framework. */
fun main() {
    for (hz in listOf(60, 90, 120)) {
        val position = LiquidTabSpring(0f, 1f, 1000f)
        position.target = 3f
        repeat(hz) {
            position.step(1f / hz)
            check(position.value in 0f..3.0001f) { "Navigation overshot at $hz Hz" }
        }
        check(position.settled && abs(position.value - 3f) < 0.001f)
        val scale = LiquidTabSpring(1f, 0.6f, 250f)
        scale.target = 78f / 56f
        repeat(hz / 5) { scale.step(1f / hz) }
        check(scale.value > 1.3f) { "Press did not expand at $hz Hz" }
        scale.target = 1f
        repeat(hz * 2) { scale.step(1f / hz) }
        check(scale.settled && abs(scale.value - 1f) < 0.001f)
    }
    val sixty = LiquidTabSpring(0f, 1f, 1000f).apply { target = 3f }
    val oneTwenty = LiquidTabSpring(0f, 1f, 1000f).apply { target = 3f }
    repeat(12) { sixty.step(1f / 60f) }
    repeat(24) { oneTwenty.step(1f / 120f) }
    check(abs(sixty.value - oneTwenty.value) < 0.0001f) { "Motion depends on refresh rate" }
    sixty.target = 0f
    repeat(120) { sixty.step(1f / 60f) }
    check(sixty.settled && sixty.value == 0f) { "Interrupted selection did not return" }
    val delayed = LiquidTabSpring(0f, 0.5f, 300f).apply { target = 1f }
    repeat(30) { delayed.step(0.064f) }
    check(delayed.value.isFinite() && delayed.settled) { "Dropped frames destabilized motion" }
    println("PASS: 60/90/120Hz, press/release, reversal, dropped frames, refresh-rate invariance")
}
