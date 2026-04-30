import { app, BrowserWindow, shell, ipcMain, dialog } from "electron";
import * as path from "path";
import * as fs from "fs";

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#0f1115",
    title: "Калькулятор Умного Дома",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === "development") {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle("app:openExternal", (_e, url: string) => shell.openExternal(url));

  ipcMain.handle("pdf:export", async (_e, html: string, suggestedName: string) => {
    if (!win) throw new Error("No window");
    const res = await dialog.showSaveDialog(win, {
      title: "Сохранить PDF",
      defaultPath: suggestedName,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (res.canceled || !res.filePath) return null;

    const pdfWin = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true, sandbox: true, contextIsolation: true },
    });
    try {
      await pdfWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
      const buf = await pdfWin.webContents.printToPDF({
        pageSize: "A4",
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        landscape: false,
      });
      fs.writeFileSync(res.filePath, buf);
      return res.filePath;
    } finally {
      pdfWin.destroy();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
