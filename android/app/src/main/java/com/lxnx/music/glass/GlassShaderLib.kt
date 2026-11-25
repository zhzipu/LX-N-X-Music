/*
 * 本文件里的 AGSL 着色器源码原样复制自 io.github.kyant0:backdrop
 * （上游仓库 D:\code\AndroidLiquidGlass-kmp，backdrop/src/commonMain/kotlin/
 * com/kyant/backdrop/internal/Shaders.kt）。
 *
 * Copyright 2025 Kyant
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * 为什么不继续从 Maven 依赖 io.github.kyant0:backdrop 读这些常量：
 *  1. 它们在 Kotlin 里是 internal，跨模块访问只能靠 @file:Suppress 硬来；
 *  2. 该库是 Java 21 字节码（class 65），本项目 javac 目标是 17，读不了它的 class；
 *  3. 带色散的那个常量在 Kotlin 元数据里没有声明，只能反射拿 JVM 方法。
 * 复制成字符串以后 backdrop / shapes 两个依赖连同 Compose 排除块都可以删掉。
 */
package com.lxnx.music.glass

import android.os.Build

/**
 * 液态玻璃用到的 AGSL 着色器字符串。
 *
 * 上游把这些串命名为 `RoundedRectSDF` / `RoundedRectRefractionShaderString` /
 * `RoundedRectRefractionWithDispersionShaderString` / `DefaultHighlightShaderString`，
 * 这里只改了 Kotlin 常量名（全大写），内容逐字未动。
 */
internal object GlassShaderLib {

    // Upstream AmbientHighlightShaderString: directional black/white, not a white border.
    val AMBIENT_HIGHLIGHT: String get() = """
uniform float2 size;
uniform float4 cornerRadii;
uniform float angle;
uniform float falloff;
$ROUNDED_RECT_SDF
half4 main(float2 coord) {
    float2 halfSize = size * 0.5;
    float2 centeredCoord = coord - halfSize;
    float radius = radiusAt(centeredCoord, cornerRadii);
    float gradRadius = min(radius * 1.5, min(halfSize.x, halfSize.y));
    float2 grad = gradSdRoundedRect(centeredCoord, halfSize, gradRadius);
    float d = dot(grad, float2(cos(angle), sin(angle)));
    float intensity = pow(abs(d), falloff);
    float t = step(0.0, d);
    return half4(t, t, t, 1.0) * intensity;
}"""

    /**
     * 圆角矩形 SDF 工具函数（上游 `RoundedRectSDF`）。
     *
     * 注意 `radiusAt` 的四角顺序：右下角用 radii.z、左下角用 radii.w，
     * 也就是调用方传入的 float4 必须按「左上、右上、右下、左下」排列。
     */
    val ROUNDED_RECT_SDF: String = """
float radiusAt(float2 centeredCoord, float4 radii) {
    if (centeredCoord.x >= 0.0) {
        if (centeredCoord.y <= 0.0) return radii.y;
        else return radii.z;
    } else {
        if (centeredCoord.y <= 0.0) return radii.x;
        else return radii.w;
    }
}

float sdRoundedRect(float2 coord, float2 halfSize, float radius) {
    float2 cornerCoord = abs(coord) - (halfSize - float2(radius));
    float outside = length(max(cornerCoord, 0.0)) - radius;
    float inside = min(max(cornerCoord.x, cornerCoord.y), 0.0);
    return outside + inside;
}

float2 gradSdRoundedRect(float2 coord, float2 halfSize, float radius) {
    float2 cornerCoord = abs(coord) - (halfSize - float2(radius));
    if (cornerCoord.x >= 0.0 || cornerCoord.y >= 0.0) {
        return sign(coord) * normalize(max(cornerCoord, 0.0));
    } else {
        float gradX = step(cornerCoord.y, cornerCoord.x);
        return sign(coord) * float2(gradX, 1.0 - gradX);
    }
}"""

    /**
     * 圆角矩形折射（上游 `RoundedRectRefractionShaderString`）。
     *
     * 只在边缘 `refractionHeight` 宽的带子里做位移，位移量按 `circleMap` 从边缘向
     * 内衰减，方向是 SDF 梯度（外法线）再加一点指向中心的 `depthEffect`。
     */
    val ROUNDED_RECT_REFRACTION: String = """
uniform shader content;

uniform float2 size;
uniform float2 offset;
uniform float4 cornerRadii;
uniform float refractionHeight;
uniform float refractionAmount;
uniform float depthEffect;

$ROUNDED_RECT_SDF

float circleMap(float x) {
    return 1.0 - sqrt(1.0 - x * x);
}

half4 main(float2 coord) {
    float2 halfSize = size * 0.5;
    float2 centeredCoord = (coord + offset) - halfSize;
    float radius = radiusAt(centeredCoord, cornerRadii);
    
    float sd = sdRoundedRect(centeredCoord, halfSize, radius);
    if (-sd >= refractionHeight) {
        return content.eval(coord);
    }
    sd = min(sd, 0.0);
    
    float d = circleMap(1.0 - -sd / refractionHeight) * refractionAmount;
    float gradRadius = min(radius * 1.5, min(halfSize.x, halfSize.y));
    float2 grad = normalize(gradSdRoundedRect(centeredCoord, halfSize, gradRadius) + depthEffect * normalize(centeredCoord));
    
    float2 refractedCoord = coord + d * grad;
    return content.eval(refractedCoord);
}"""

    /**
     * 带色散的圆角矩形折射（上游 `RoundedRectRefractionWithDispersionShaderString`）。
     *
     * 在折射的基础上再做 7 次彩色采样，产生边缘彩虹 fringe。
     * 采样次数多、非常吃性能，`chromaticAberration` 默认取小值。
     */
    val ROUNDED_RECT_REFRACTION_DISPERSION: String = """
uniform shader content;

uniform float2 size;
uniform float2 offset;
uniform float4 cornerRadii;
uniform float refractionHeight;
uniform float refractionAmount;
uniform float depthEffect;
uniform float chromaticAberration;

$ROUNDED_RECT_SDF

float circleMap(float x) {
    return 1.0 - sqrt(1.0 - x * x);
}

half4 main(float2 coord) {
    float2 halfSize = size * 0.5;
    float2 centeredCoord = (coord + offset) - halfSize;
    float radius = radiusAt(centeredCoord, cornerRadii);
    
    float sd = sdRoundedRect(centeredCoord, halfSize, radius);
    if (-sd >= refractionHeight) {
        return content.eval(coord);
    }
    sd = min(sd, 0.0);
    
    float d = circleMap(1.0 - -sd / refractionHeight) * refractionAmount;
    float gradRadius = min(radius * 1.5, min(halfSize.x, halfSize.y));
    float2 grad = normalize(gradSdRoundedRect(centeredCoord, halfSize, gradRadius) + depthEffect * normalize(centeredCoord));
    
    float2 refractedCoord = coord + d * grad;
    float dispersionIntensity = chromaticAberration * ((centeredCoord.x * centeredCoord.y) / (halfSize.x * halfSize.y));
    float2 dispersedCoord = d * grad * dispersionIntensity;
    
    half4 color = half4(0.0);
    
    half4 red = content.eval(refractedCoord + dispersedCoord);
    color.r += red.r / 3.5;
    color.a += red.a / 7.0;
    
    half4 orange = content.eval(refractedCoord + dispersedCoord * (2.0 / 3.0));
    color.r += orange.r / 3.5;
    color.g += orange.g / 7.0;
    color.a += orange.a / 7.0;
    
    half4 yellow = content.eval(refractedCoord + dispersedCoord * (1.0 / 3.0));
    color.r += yellow.r / 3.5;
    color.g += yellow.g / 3.5;
    color.a += yellow.a / 7.0;
    
    half4 green = content.eval(refractedCoord);
    color.g += green.g / 3.5;
    color.a += green.a / 7.0;
    
    half4 cyan = content.eval(refractedCoord - dispersedCoord * (1.0 / 3.0));
    color.g += cyan.g / 3.5;
    color.b += cyan.b / 3.0;
    color.a += cyan.a / 7.0;
    
    half4 blue = content.eval(refractedCoord - dispersedCoord * (2.0 / 3.0));
    color.b += blue.b / 3.0;
    color.a += blue.a / 7.0;
    
    half4 purple = content.eval(refractedCoord - dispersedCoord);
    color.r += purple.r / 7.0;
    color.b += purple.b / 3.0;
    color.a += purple.a / 7.0;
    
    return color;
}"""

    /**
     * 默认的高光着色器（上游 `DefaultHighlightShaderString`）。
     *
     * 按 SDF 梯度与光照方向 `angle` 的点积算强度，只在描边带（调用方裁掉外侧一半）
     * 上出效果，所以这里不需要额外做形状遮罩。
     */
    val DEFAULT_HIGHLIGHT: String = """
uniform float2 size;
uniform float4 cornerRadii;
layout(color) uniform half4 color;
uniform float angle;
uniform float falloff;

$ROUNDED_RECT_SDF

half4 main(float2 coord) {
    float2 halfSize = size * 0.5;
    float2 centeredCoord = coord - halfSize;
    float radius = radiusAt(centeredCoord, cornerRadii);
    
    float gradRadius = min(radius * 1.5, min(halfSize.x, halfSize.y));
    float2 grad = gradSdRoundedRect(centeredCoord, halfSize, gradRadius);
    float2 normal = float2(cos(angle), sin(angle));
    float d = dot(grad, normal);
    float intensity = pow(abs(d), falloff);
    return color * intensity;
}"""
}

/**
 * RenderEffect / RuntimeShader 的运行时能力开关。
 *
 * 这些能力只要在真机上抛过一次异常（驱动、ROM 裁剪、AGSL 编译失败……），就永久置为
 * false，后续所有玻璃视图都走降级路径：宁可少一层效果，也不能让 onDraw 崩掉。
 */
internal object GlassCapabilities {

    /** BlurEffect / createChainEffect，API 31 起可用。 */
    @Volatile
    var renderEffects: Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

    /** AGSL 折射（RuntimeShaderEffect），API 33 起可用。 */
    @Volatile
    var runtimeShaders: Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU

    /** AGSL 高光，API 33 起可用；与折射分开降级，折射挂了高光还能留。 */
    @Volatile
    var highlightShader: Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
}
