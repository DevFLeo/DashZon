// O @dashzon/core fica fora desta pasta (../core, ligado por "file:"):
// o Metro precisa observá-lo para empacotar e recarregar.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../core")];
module.exports = config;
