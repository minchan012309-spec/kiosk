import { contextBridge, ipcRenderer } from "electron";
const allowed = new Set([
  "resetAdmin",
  "hostInfo",
  "openWeb",
  "adminUnlock",
  "configureGame",
  "exportConnection",
  "openData",
  "openKiosk",
  "state",
  "importConnection",
  "enroll",
  "login",
  "launchGame",
  "stopGame",
  "purchase",
  "extend",
  "requestExit",
  "exitPassword",
  "recoverExit",
  "closeOverlay",
  "quitUnregistered",
]);
contextBridge.exposeInMainWorld("cafe", {
  invoke: (action: string, payload?: unknown) => {
    if (!allowed.has(action))
      return Promise.reject(Error("허용하지 않은 동작입니다."));
    return ipcRenderer.invoke("cafe:invoke", action, payload);
  },
  onState: (callback: (state: unknown) => void) => {
    const handler = (_: unknown, state: unknown) => callback(state);
    ipcRenderer.on("cafe:state", handler);
    return () => ipcRenderer.removeListener("cafe:state", handler);
  },
});
