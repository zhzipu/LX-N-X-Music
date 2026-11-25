package com.lxnx.music;

/** Screen dimensions include system bars and are independent of rotation. */
public final class ScreenLayoutPolicy {
    private ScreenLayoutPolicy() {}

    public static boolean locksPortrait(int widthPx, int heightPx, float density) {
        if (widthPx <= 0 || heightPx <= 0 || density <= 0) return false;
        int shortSide = Math.min(widthPx, heightPx);
        int longSide = Math.max(widthPx, heightPx);
        return shortSide / (double) density < 600
                && (long) longSide * 9 > (long) shortSide * 16;
    }
}
