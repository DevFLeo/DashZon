// O @dashzon/core (../core, ligado por "file:") e os temas (../../temas) ficam
// fora desta pasta: o Metro precisa observá-los para empacotar e recarregar.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, "../core"), path.resolve(__dirname, "../../temas")];
module.exports = config;
