// Pass the AGP-instrumented react-android JAR, not the original dependency.
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
assert.ok(process.argv[2], 'Usage: node tools/mini-player/test-native-root.js <instrumented-react-android.jar>')
const jar = path.resolve(process.argv[2])
const out = path.resolve(__dirname, '../../dist/mini-native-root-test')
fs.mkdirSync(out, { recursive: true })
const sources = {
  'android/view/ViewParent.java': 'package android.view; public interface ViewParent {}',
  'android/view/View.java': `package android.view;
public class View implements ViewParent {
  public ViewParent parent;
  public ViewParent getParent() { return parent; }
  public void getLocationInWindow(int[] location) {}
  public void getWindowVisibleDisplayFrame(android.graphics.Rect rect) {}
}`,
  'android/graphics/Point.java': 'package android.graphics; public class Point { public Point(int x, int y) {} }',
  'android/graphics/Rect.java': 'package android.graphics; public class Rect { public int left, top; }',
  'com/facebook/react/uimanager/RootView.java': 'package com.facebook.react.uimanager; public interface RootView {}',
  'com/facebook/infer/annotation/Assertions.java': `package com.facebook.infer.annotation;
public class Assertions { public static void assertCondition(boolean condition) { if (!condition) throw new AssertionError(); } }`,
  'RootMeasureTest.java': `import android.view.*;
import com.facebook.react.uimanager.*;
public class RootMeasureTest {
  static class ReactRoot extends View implements RootView {}
  public static void main(String[] args) {
    View child = new View();
    View wrapper = new View();
    ReactRoot root = new ReactRoot();
    child.parent = wrapper; wrapper.parent = root;
    if (RootViewUtil.getRootView(child) != root) throw new AssertionError("attached root");
    if (RootViewUtil.getRootView(root) != root) throw new AssertionError("root itself");
    child.parent = null;
    if (RootViewUtil.getRootView(child) != null) throw new AssertionError("detached view");
    child.parent = wrapper;
    wrapper.parent = new ViewParent() {};
    if (RootViewUtil.getRootView(child) != null) throw new AssertionError("native overlay");
    wrapper.parent = root;
    if (RootViewUtil.getRootView(child) != root) throw new AssertionError("restored after transition");
    System.out.println("Native root: attached, root itself, detached, native overlay, restored passed.");
  }
}`,
}
const files = Object.entries(sources).map(([name, source]) => {
  const file = path.join(out, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, source)
  return file
})
execFileSync('jar', ['xf', jar, 'com/facebook/react/uimanager/RootViewUtil.class'], { cwd: out, stdio: 'inherit' })
execFileSync('javac', ['-cp', out, '-d', out, ...files], { stdio: 'inherit' })
execFileSync('java', ['-cp', out, 'RootMeasureTest'], { stdio: 'inherit' })
