import { app, ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";

/**
 * Хранилище цен по device.id. Лежит в userData/prices.json — переживает
 * обновления приложения (electron-builder сохраняет userData между версиями).
 *
 * Формат файла: { "<device.id>": <number в рублях> }
 */
const PRICES_FILE = path.join(app.getPath("userData"), "prices.json");

type PriceMap = Record<string, number>;

function load(): PriceMap {
  try {
    const raw = fs.readFileSync(PRICES_FILE, "utf8");
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") return obj;
  } catch {}
  return {};
}

function save(p: PriceMap) {
  fs.mkdirSync(path.dirname(PRICES_FILE), { recursive: true });
  fs.writeFileSync(PRICES_FILE, JSON.stringify(p, null, 2), "utf8");
}

export function registerPriceIpc() {
  ipcMain.handle("prices:get", () => load());

  ipcMain.handle("prices:set", (_e, id: string, price: number | null) => {
    const p = load();
    if (price === null || price === undefined || !Number.isFinite(price) || price <= 0) {
      delete p[id];
    } else {
      p[id] = Math.round(price * 100) / 100;
    }
    save(p);
    return p;
  });
}
