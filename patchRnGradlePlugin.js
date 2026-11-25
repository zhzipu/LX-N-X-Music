/**
 * 修补 @react-native/gradle-plugin 的构建脚本，解除 Kotlin 编译的 -Werror 阻塞。
 *
 * 背景：
 *   RN 0.73 的 gradle 插件是以 includeBuild 的方式从 node_modules 源码参与构建的，
 *   其 build.gradle.kts 中硬编码了 `allWarningsAsErrors = true`。
 *   当把 Gradle 升级到 8.11+（AGP 8.9+ 要求 >= 8.11.1，AGP 8.12 要求 >= 8.13）之后，
 *   Gradle API 自身引入了两处新的编译告警：
 *     1. org.gradle.api.Project#exec(Action) 自 Gradle 8.11 起被标注 @Deprecated
 *        -> BundleHermesCTask.kt:130 'exec(Action<in ExecSpec!>!): ExecResult!' is deprecated
 *     2. org.gradle.internal.jvm.Jvm#current() 的可空注解变化
 *        -> ReactPlugin.kt:91 Unnecessary safe call on a non-null receiver of type Jvm!
 *   这两处告警都在第三方源码里，与本仓库的业务代码无关，却被 -Werror 提升为编译错误，
 *   导致 :gradle-plugin:compileKotlin FAILED，整个 assembleRelease 无法开始。
 *
 * 处理方式：
 *   仅把该第三方 included build 的 allWarningsAsErrors 置为 false，
 *   保留 apiVersion / jvmTarget 等其他编译约束，不跳过任何 Gradle 任务。
 *   该脚本幂等：已打过补丁时直接跳过。
 *
 * 用法：node patchRnGradlePlugin.js
 */
const fs = require('fs');
const path = require('path');

const target = path.join(
    __dirname,
    'node_modules',
    '@react-native',
    'gradle-plugin',
    'build.gradle.kts'
);

if (!fs.existsSync(target)) {
    console.log('[patchRnGradlePlugin] @react-native/gradle-plugin not found, skipped.');
    process.exit(0);
}

let content = fs.readFileSync(target, 'utf8');

const marker = '// patched-by: patchRnGradlePlugin.js (allWarningsAsErrors=false)';

if (content.includes(marker)) {
    console.log('[patchRnGradlePlugin] Already patched, skipped.');
    process.exit(0);
}

const pattern = /([ \t]*)allWarningsAsErrors\s*=\s*true/;

if (!pattern.test(content)) {
    console.log('[patchRnGradlePlugin] allWarningsAsErrors = true not found, skipped.');
    process.exit(0);
}

content = content.replace(pattern, (match, indent) => {
    return (
        `${indent}// patched-by: patchRnGradlePlugin.js (allWarningsAsErrors=false)\n` +
        `${indent}// Gradle 8.11+ 把 Project#exec(Action) 标注为 @Deprecated，并调整了\n` +
        `${indent}// org.gradle.internal.jvm.Jvm#current() 的可空注解，导致 RN 0.73 自带的\n` +
        `${indent}// gradle-plugin 源码产生两条与本项目无关的告警；这里关闭 -Werror，\n` +
        `${indent}// 但保留 apiVersion / jvmTarget 等其余编译约束。\n` +
        `${indent}allWarningsAsErrors = false`
    );
});

fs.writeFileSync(target, content, 'utf8');
console.log('[patchRnGradlePlugin] Patched allWarningsAsErrors = false in', target);
