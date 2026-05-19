const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const sharedDir = path.resolve(__dirname, '../shared');

const config = getDefaultConfig(__dirname);

config.watchFolders = [...(config.watchFolders || []), sharedDir];

config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    '@hestia/shared': sharedDir,
  },
};

module.exports = withNativeWind(config, { input: './global.css' });
