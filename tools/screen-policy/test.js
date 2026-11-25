const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { execFileSync } = require('node:child_process')
const ts = require('typescript')
const root = path.resolve(__dirname, '../..')
const source = fs.readFileSync(path.join(root, 'src/utils/hooks/useWideLayout.ts'), 'utf8')
const screen = { width: 360, height: 800 }
const context = { exports: {}, require: () => ({ Dimensions: { get: () => screen } }) }
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context)
const { isPortraitPhoneScreen, isWideWindow } = context.exports
const cases = [
  [1140, 2616, 2.875, true], // Foldable outer display.
  [2616, 1140, 2.875, true], // Same classification while initially landscape.
  [2248, 2480, 2.875, false], // Unfolded inner display.
  [1080, 1920, 3, false], // Exactly 16:9 is not greater than 16:9.
  [1080, 1921, 3, true],
  [1800, 3600, 3, false], // Exactly 600dp must remain a tablet.
  [1797, 3600, 3, true],
  [1200, 1920, 2, false],
  [0, 0, 3, false],
]
for (const [w, h, density, expected] of cases) {
  assert.equal(isPortraitPhoneScreen(w / density, h / density), expected, `${w}x${h}@${density}`)
  assert.equal(isPortraitPhoneScreen(h / density, w / density), expected)
}
assert.equal(isWideWindow(800, 360), false, 'locked phone never selects Pad while rotating')
assert.equal(isWideWindow(640, 330, { width: 360, height: 640 }), true, 'system-bar insets must not change classification')
assert.equal(isWideWindow(600, 1200, { width: 600, height: 1200 }), true)
assert.equal(isWideWindow(393, 852, { width: 393, height: 852 }), false)

// Compile the production Java policy and check the very same boundary cases.
const out = path.join(root, 'dist/screen-policy-tests')
fs.mkdirSync(out, { recursive: true })
const checks = cases.map(([w, h, density, expected]) =>
  `if (ScreenLayoutPolicy.locksPortrait(${w}, ${h}, ${density}f) != ${expected}) throw new AssertionError("${w}x${h}");`).join('\n')
const harness = path.join(out, 'ScreenPolicyTest.java')
fs.writeFileSync(harness, `import com.lxnx.music.ScreenLayoutPolicy;
public class ScreenPolicyTest { public static void main(String[] args) {
${checks}
if (ScreenLayoutPolicy.locksPortrait(1080, 2400, 0)) throw new AssertionError("invalid density");
System.out.println("Native screen policy passed.");
} }`)
execFileSync('javac', ['-d', out, path.join(root, 'android/app/src/main/java/com/lxnx/music/ScreenLayoutPolicy.java'), harness], { stdio: 'inherit' })
execFileSync('java', ['-cp', out, 'ScreenPolicyTest'], { stdio: 'inherit' })
console.log('JS/native agreement, rotation invariance, 16:9/600dp boundaries, window insets and fold displays passed.')
