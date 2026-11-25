const fs = require('node:fs')
const path = require('node:path')

const cmakePath = path.join(
  __dirname,
  'node_modules',
  'react-native-quick-md5',
  'android',
  'CMakeLists.txt',
)

if (!fs.existsSync(cmakePath)) {
  console.log('[patch16kbAlignment] react-native-quick-md5 not found, skipped.')
  process.exit(0)
}

const marker = '# patched-by: patch16kbAlignment.js'
let cmake = fs.readFileSync(cmakePath, 'utf8')
if (cmake.includes(marker)) {
  console.log('[patch16kbAlignment] Already patched, skipped.')
  process.exit(0)
}

const target = 'target_link_libraries(quickmd5)'
if (!cmake.includes(target)) {
  console.error('[patch16kbAlignment] quickmd5 link target not found.')
  process.exit(1)
}

cmake = cmake.replace(
  target,
  `${marker}\ntarget_link_options(quickmd5 PRIVATE "-Wl,-z,max-page-size=16384")\n${target}`,
)
fs.writeFileSync(cmakePath, cmake, 'utf8')
console.log('[patch16kbAlignment] Enabled 16 KB ELF alignment for libquickmd5.so.')
