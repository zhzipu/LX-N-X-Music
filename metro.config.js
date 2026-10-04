const path = require('path')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  resolver: {
    extraNodeModules: {
      // crypto: require.resolve('react-native-quick-crypto'),
      // stream: require.resolve('stream-browserify'),
      buffer: require.resolve('@craftzdog/react-native-buffer'),
    },
    // react-native-qrcode-svg@6.3.12 静态 import `react-native-svg/css`（仅 svg>=14 才有），
    // 但本项目锁定 svg@13.x。该入口只在传 logo 时用到，本项目不传 logo，
    // 用 stub 满足 Metro 静态解析即可。
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'react-native-svg/css') {
        return {
          type: 'sourceFile',
          filePath: path.resolve(__dirname, 'stubs/react-native-svg-css.js'),
        }
      }
      return context.resolveRequest(context, moduleName, platform)
    },
  },
}

const defaultConfig = getDefaultConfig(__dirname)
defaultConfig.transformer.transformIgnorePatterns = [
  'node_modules/(?!(react-native-qrcode-svg|qrcode|react-native|@react-native|@react-native-community|@react-navigation)/)',
]

module.exports = mergeConfig(defaultConfig, config)
