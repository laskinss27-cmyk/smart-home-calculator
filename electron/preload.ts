import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  openExternal: (url: string) => ipcRenderer.invoke("app:openExternal", url),
  exportPdf: (html: string, suggestedName: string) =>
    ipcRenderer.invoke("pdf:export", html, suggestedName),
});
