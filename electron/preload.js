const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("auralCanvas", {
  platform: process.platform,
  isDesktop: true,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
});
