const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Désactive le nouveau comportement "package exports" qui casse beaucoup de choses en SDK 53
config.resolver.unstable_enablePackageExports = false;

module.exports = config;