# Liquid Tabs

This is an Android View port of `D:/code/AndroidLiquidGlass-kmp`, not a Compose dependency. The optical shader sources and interaction design originate from Kyant's Apache-2.0 Backdrop project.

## Reference mapping

| Reference | Implementation |
| --- | --- |
| `LiquidBottomTabs.kt`: 64dp container, 4dp padding, 56dp selection | `LiquidTabsView.kt` + `LiquidTabs.tsx` |
| Hidden `tabsBackdrop` + `rememberCombinedBackdrop` | Separate RenderNode containing the page, 56dp glass row and accent-tinted RN children |
| Foreground lens `(10dp × progress, 14dp × progress)` | Persistent lens, full upstream dispersion, no blur or vibrancy |
| `InverseLayerScope` | Inverse sampling scale before the outer layer transform; icons do not grow with the whole capsule |
| `DampedDragAnimation` | UI-thread Choreographer with the same damping/stiffness and 78/56 pressed scale |
| `InteractiveHighlight` | Additive touch illumination, following the lens; the radial falloff uses Android RadialGradient |
| StudioState initial preset | `DEFAULT_GLASS_TABS_PARAMS`: blur 10, lens 20/28, depth on, white 40%, blue `#0088FF`, 0.5dp highlight |

The base surface, hidden row and lens have independent effect nodes. Do not sample the whole composite back into itself: that creates a RenderNode cycle. `LiquidTabsView.draw()` stays empty when hosted; `GlassBackdropHost` explicitly draws the composite after the page has been recorded. Ordinary glass surfaces retain their previous optics; reference constants and corrected highlighting are opt-in for the new tabs helpers.

RN keeps the real icon children and accessible tab names, without visible labels. Native gestures cancel RN's parallel press stream, then emit one selection event on release. Taps navigate immediately; a second tap on Menu within 320ms opens the studio. Both navigation and preview have four tabs with fixed dimensions; saved preview counts from older versions are ignored. Preview selection only affects the preview.

The studio uses the same native renderers and an independent backdrop host. Double-tapping Menu pushes `GlassTabsSettingsScreen` onto the native navigation stack as a full page, with a header back button and system-back support.

The target picker has five independent profiles: tabs, mini player, back/more, loop/favorite, and previous/next. `glassControlSettings.ts` owns the shared state and serialized, debounced persistence at `lxnx.glassControls.v1`; it imports the existing v4 tabs preset on first use, without deleting old storage. Leaving the screen or backgrounding the app flushes pending changes. Reset applies only to the selected profile. The tab index/accent controls only appear for tabs.

Standalone controls and previews share `glassSurfaceParams.ts`; `ConfiguredGlassSurface` subscribes to the selected profile even inside memoized player components. `GlassIconButton` is reused in button previews. The mini player preview uses a fixed sample title and the same glass surface, without triggering playback. Both portrait and landscape player controls use the corresponding profiles. Their existing navigation, playback, collection and long-press handlers remain connected.

`LiquidGlassView.invalidate()` also invalidates its nearest backdrop host. Hosted glass intentionally has an empty display list, while the host owns the visible composite; invalidating only the child can leave that composite unchanged until another interaction redraws the host. Property changes and asynchronous image updates now request both redraws, without a polling loop or remounting the preview. The studio header contains only Back and the title; the JSON copy action has been removed.

## Validation

- `tools/check-liquid-tabs.ps1` compiles and checks the actual Kotlin spring at 60/90/120Hz, press/release, reversal, dropped frames and equivalent elapsed times across refresh rates.
- `node tools/check-glass-controls.cjs` checks the production settings store against an in-memory storage boundary: legacy migration, per-group update/reset isolation, restoration after restart, parameter mapping, serialized writes and recovery after invalid data or a failed save.
- Multi-control Release built and installed on 2026-11-17. On the API 37 phone, switched all five targets, applied different colors to the four new groups, confirmed the actual mini player and portrait player buttons reflected those colors, opened More and returned, force-stopped/relaunched to verify persistence, and used each new group's reset button. Existing tabs settings were retained. No runtime/JS/shader errors appeared. Landscape wiring compiled but was not visually exercised on the device. TypeScript diagnostics match the pre-change baseline.
- Preview refresh regression, 2026-11-17: before the native fix, selecting blue updated the swatch selection but left the pink mini-player preview pixel-identical. After the fix, the same tap changed 147,441 pixels in the preview immediately, without switching targets. Moving the opacity slider while keeping the touch down changed the mini-player and header-button previews (147,472 and 30,984 pixels respectively). Restored the tested values, confirmed Copy is absent and runtime/shader logs are clean; Release build passed and TypeScript diagnostics remained unchanged.
- Android release build and lint passed on 2026-11-17. Windows needed a short external CMake staging directory because this checkout's existing quick-base64 prefab path exceeded Ninja's path handling. The final build compiled native libraries; no CMake tasks were skipped.
- Tested on connected PLP120, API 37, 1140×2616: tap navigation, horizontal drag selection, held lens, return to rest, Menu double-tap, actual shader preview and checker background. Compared resting/held states with the installed KMP Studio. No AndroidRuntime, ReactNativeJS or glass shader errors appeared during these checks.
- Full `tsc --noEmit` still reports pre-existing errors across the project; none refer to the changed tabs files.

The real AGSL lens requires Android 13/API 33+. Lower APIs keep a drawable/tappable fallback, with blur where supported. Only the API 37 device was visually tested. The host uses the project's existing translation-based position tracking; arbitrary ancestor rotation/scale and cross-device pixel identity are not claimed.

## Repeat the Windows build

The normal command is `android/gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a`. If Ninja reports `manifest 'build.ninja' still dirty after 100 tries` for quick-base64, use a local Gradle init script to move CMake intermediates to a short path, for example:

```groovy
gradle.beforeProject { project ->
    project.pluginManager.withPlugin('com.android.library') {
        project.extensions.getByName('androidComponents').finalizeDsl { androidDsl ->
            if (androidDsl.externalNativeBuild.cmake.path != null) {
                androidDsl.externalNativeBuild.cmake.buildStagingDirectory = new File('C:/AndroidDev/cxx-liquid-tabs', project.name)
                androidDsl.defaultConfig.externalNativeBuild.cmake.arguments.add('-DCMAKE_OBJECT_PATH_MAX=180')
            }
        }
    }
}
```

Pass the script using `-I path/to/local-script.gradle`. It only changes build intermediates, not source or packaged behavior.
