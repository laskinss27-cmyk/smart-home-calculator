import type {
  Catalog,
  Device,
  DeviceType,
  PickedItem,
  Recommendation,
  Scenario,
  Vendor,
} from "./types";
import type { CleanCatalog, CleanDevice } from "./catalogClean";

/* ════════════════════════════════════════════════════════════════════════
 * Общие утилиты
 * ════════════════════════════════════════════════════════════════════════ */

function add(items: PickedItem[], device: Device | null | undefined, qty: number, reason: string) {
  if (!device || qty <= 0) return;
  const existing = items.find((i) => i.device.id === device.id);
  if (existing) {
    existing.qty += qty;
    if (!existing.reason.includes(reason)) existing.reason += "; " + reason;
  } else {
    items.push({ device, qty, reason });
  }
}

function unitsNeeded(points: number, channelsPerUnit: number): number {
  const k = Math.max(channelsPerUnit || 1, 1);
  return Math.ceil(points / k);
}

/* ════════════════════════════════════════════════════════════════════════
 * SHELLY: подбор по use-cases с учётом meta
 *  Регламентирует ответы из Shelly Catalog 2025 (Lighting / Shutters /
 *  Heating / Plugs / Sensors / Smart Panels).
 * ════════════════════════════════════════════════════════════════════════ */

type ShellyDevs = CleanDevice[];

function findByTitle(devs: ShellyDevs, ...needles: string[]): CleanDevice | undefined {
  const n = needles.map((s) => s.toLowerCase());
  return devs.find((d) => {
    const t = d.title.toLowerCase();
    return n.every((needle) => t.includes(needle));
  });
}

/** Все устройства, у которых заголовок содержит ВСЕ needles. */
function allByTitle(devs: ShellyDevs, ...needles: string[]): CleanDevice[] {
  const n = needles.map((s) => s.toLowerCase());
  return devs.filter((d) => {
    const t = d.title.toLowerCase();
    return n.every((needle) => t.includes(needle));
  });
}

interface ShellyContext {
  devs: ShellyDevs;
  s: Scenario;
  notes: string[];
  gaps: string[];
}

/** Выбор реле освещения по use-case Shelly Lighting Solutions. */
function pickLightRelay(ctx: ShellyContext, channelsNeeded: number): CleanDevice | undefined {
  const { devs, s, notes } = ctx;

  // 1) Нет нейтрали → 1L Gen3 (1 канал) либо 2L Gen3 (2 канала). Bypass добавим отдельно.
  if (s.noNeutral) {
    const dev = channelsNeeded >= 2
      ? (findByTitle(devs, "shelly 2l") ?? findByTitle(devs, "shelly 1l"))
      : findByTitle(devs, "shelly 1l");
    if (dev) {
      notes.push("Нет нейтрали — взяли Shelly 1L/2L Gen3, к ним нужен Shelly Bypass на каждой линии (LED <30 Вт).");
      return dev;
    }
  }

  // 2) DIN-rail / большой объект → Pro 4PM
  if (s.installStyle === "din" || channelsNeeded >= 8) {
    return (
      findByTitle(devs, "pro 4pm") ??
      findByTitle(devs, "wave pro 2pm") ??
      findByTitle(devs, "pro 2pm")
    );
  }

  // 3) Wave (Z-Wave) — если пользователь выбрал Z-Wave
  if (s.protocolPref === "zwave") {
    if (channelsNeeded >= 2) {
      return (
        findByTitle(devs, "wave 2pm") ??
        findByTitle(devs, "wave 2") ??
        findByTitle(devs, "wave 1pm") ??
        findByTitle(devs, "wave 1")
      );
    }
    return (
      findByTitle(devs, "wave 1 mini") ??
      findByTitle(devs, "wave 1pm mini") ??
      findByTitle(devs, "wave 1pm") ??
      findByTitle(devs, "wave 1")
    );
  }

  // 4) По умолчанию (Wi-Fi/BT, in_wall): 1 Mini Gen4 на одну группу,
  //    либо 1PM Gen4 если нужен мониторинг, либо 2PM Gen4 при ≥2 каналах.
  if (channelsNeeded >= 2) {
    return (
      findByTitle(devs, "shelly 2pm gen4") ??
      findByTitle(devs, "shelly 2pm gen3") ??
      findByTitle(devs, "shelly plus 2pm")
    );
  }
  if (s.energyMonitoring) {
    return (
      findByTitle(devs, "1pm mini gen4") ??
      findByTitle(devs, "shelly 1pm gen4") ??
      findByTitle(devs, "shelly 1pm gen3") ??
      findByTitle(devs, "shelly plus 1pm")
    );
  }
  return (
    findByTitle(devs, "1 mini gen4") ??
    findByTitle(devs, "shelly 1 gen4") ??
    findByTitle(devs, "shelly 1 gen3") ??
    findByTitle(devs, "shelly plus 1")
  );
}

function pickDimmer(ctx: ShellyContext): CleanDevice | undefined {
  const { devs, s } = ctx;
  if (s.installStyle === "din") {
    return (
      findByTitle(devs, "pro dimmer 2pm") ??
      findByTitle(devs, "pro dimmer 1pm") ??
      findByTitle(devs, "pro dimmer 0/1-10v") ??
      findByTitle(devs, "pro dimmer")
    );
  }
  if (s.protocolPref === "zwave") {
    return findByTitle(devs, "wave dimmer");
  }
  return (
    findByTitle(devs, "dimmer 0/1-10v pm gen4") ??
    findByTitle(devs, "shelly dimmer gen4") ??
    findByTitle(devs, "shelly dimmer gen3") ??
    findByTitle(devs, "dali dimmer gen3")
  );
}

function pickRgbw(ctx: ShellyContext): CleanDevice | undefined {
  const { devs, s } = ctx;
  if (s.installStyle === "din") {
    return findByTitle(devs, "pro rgbww pm");
  }
  return findByTitle(devs, "plus rgbw pm") ?? findByTitle(devs, "rgbw");
}

function pickShutter(ctx: ShellyContext): CleanDevice | undefined {
  const { devs, s } = ctx;
  if (s.installStyle === "din") {
    return (
      findByTitle(devs, "pro dual cover") ??
      findByTitle(devs, "wave pro shutter")
    );
  }
  if (s.protocolPref === "zwave") {
    return findByTitle(devs, "wave shutter");
  }
  // Wi-Fi: 2PM Gen4 в режиме шторного контроллера — это и есть штатное решение
  return (
    findByTitle(devs, "shelly 2pm gen4") ??
    findByTitle(devs, "shelly 2pm gen3") ??
    findByTitle(devs, "shelly plus 2pm")
  );
}

function pickPlug(ctx: ShellyContext): CleanDevice | undefined {
  const { devs, s } = ctx;
  if (s.energyMonitoring) {
    return (
      findByTitle(devs, "plug s mtr gen3") ??
      findByTitle(devs, "plug pm gen3") ??
      findByTitle(devs, "plug m gen3")
    );
  }
  return (
    findByTitle(devs, "plug s mtr gen3") ??
    findByTitle(devs, "plug m gen3") ??
    findByTitle(devs, "plug s gen3") ??
    findByTitle(devs, "shelly plug")
  );
}

function pickTH(ctx: ShellyContext): CleanDevice | undefined {
  const { devs, s } = ctx;
  // BLU H&T — батарейный, идеален для жилых помещений; H&T Gen3 — Wi-Fi розеточный
  if (s.protocolPref === "wifi_bt") {
    return findByTitle(devs, "h&t gen3") ?? findByTitle(devs, "blu h&t");
  }
  return findByTitle(devs, "blu h&t") ?? findByTitle(devs, "h&t gen3");
}

function pickDoorWindow(ctx: ShellyContext): CleanDevice | undefined {
  const { devs, s } = ctx;
  if (s.protocolPref === "zwave") {
    return findByTitle(devs, "wave door/window") ?? findByTitle(devs, "blu door/window");
  }
  return findByTitle(devs, "blu door/window") ?? findByTitle(devs, "wave door/window");
}

function pickMotion(ctx: ShellyContext): CleanDevice | undefined {
  const { devs, s } = ctx;
  if (s.protocolPref === "zwave") {
    return findByTitle(devs, "wave motion");
  }
  return (
    findByTitle(devs, "blu motion") ??
    findByTitle(devs, "motion 2") ??
    findByTitle(devs, "presence")
  );
}

function pickLeak(ctx: ShellyContext): CleanDevice | undefined {
  return findByTitle(ctx.devs, "flood gen4") ?? findByTitle(ctx.devs, "flood");
}

/** TRV (батарейные радиаторные термоголовки) — это BLU TRV. */
function pickTRV(ctx: ShellyContext): CleanDevice | undefined {
  return findByTitle(ctx.devs, "blu trv");
}

/** Контроллер тёплого пола: 1PM Mini Gen4 + датчик температуры. */
function pickFloorRelay(ctx: ShellyContext): CleanDevice | undefined {
  const { devs } = ctx;
  return (
    findByTitle(devs, "1pm mini gen4") ??
    findByTitle(devs, "1pm mini gen3") ??
    findByTitle(devs, "shelly 1pm gen4") ??
    findByTitle(devs, "shelly 1pm gen3")
  );
}

function pickAddOnDS(ctx: ShellyContext): CleanDevice | undefined {
  // Plus Add-on +1DS (или Plus Add-on) — для DS18B20 датчиков пола
  return (
    findByTitle(ctx.devs, "plus add", "+1ds") ??
    findByTitle(ctx.devs, "plus add", "ds") ??
    findByTitle(ctx.devs, "plus addon") ??
    findByTitle(ctx.devs, "plus add-on")
  );
}

function pickEnergyMeter(ctx: ShellyContext): CleanDevice | undefined {
  const { devs, s } = ctx;
  if (s.installStyle === "din") {
    return findByTitle(devs, "pro 3em") ?? findByTitle(devs, "pro em-50");
  }
  return findByTitle(devs, "shelly 3em") ?? findByTitle(devs, "em mini gen4") ?? findByTitle(devs, "shelly em gen4");
}

function pickWallDisplay(ctx: ShellyContext): CleanDevice | undefined {
  return (
    findByTitle(ctx.devs, "wall display xl") ??
    findByTitle(ctx.devs, "wall display x2i") ??
    findByTitle(ctx.devs, "wall display")
  );
}

function pickBypass(ctx: ShellyContext): CleanDevice | undefined {
  // Если в каталоге Bypass представлен — добавим (часть каталогов хранит его как Add-on/other)
  return findByTitle(ctx.devs, "bypass");
}

function pickBluGateway(ctx: ShellyContext): CleanDevice | undefined {
  return findByTitle(ctx.devs, "blu gateway") ?? findByTitle(ctx.devs, "blu gw");
}

/* ───────────────────────── Shelly: главный сборщик ──────────────────────── */

function recommendShelly(catalog: CleanCatalog, s: Scenario): Recommendation {
  const devs = catalog.devices.filter((d) => d.vendor === "shelly");
  const items: PickedItem[] = [];
  const gaps: string[] = [];
  const notes: string[] = [];
  const ctx: ShellyContext = { devs, s, notes, gaps };

  let usesBlu = false;

  // ── Свет (вкл/выкл) ─────────────────────────────────────────
  if (s.lightPoints > 0) {
    const channelsAvailable = s.lightPoints; // мы выберем устройство, потом распределим по каналам
    const dev = pickLightRelay(ctx, channelsAvailable);
    if (dev) {
      const qty = unitsNeeded(s.lightPoints, dev.channels || 1);
      add(items, dev, qty, `освещение: ${s.lightPoints} групп`);
      // Bypass для 1L/2L
      if (s.noNeutral) {
        const bp = pickBypass(ctx);
        if (bp) add(items, bp, s.lightPoints, "Shelly Bypass для линий <30 Вт без нейтрали");
        else notes.push("Не забудьте Shelly Bypass на каждую линию (нет нейтрали).");
      }
    } else {
      gaps.push(`Освещение (${s.lightPoints} гр.): не нашли подходящее реле`);
    }
  }

  // ── Диммирование ────────────────────────────────────────────
  if (s.dimmerPoints > 0) {
    const dev = pickDimmer(ctx);
    if (dev) {
      const qty = unitsNeeded(s.dimmerPoints, dev.channels || 1);
      add(items, dev, qty, `диммирование: ${s.dimmerPoints} гр.`);
    } else gaps.push(`Диммирование (${s.dimmerPoints} гр.): нет подходящего диммера`);
  }

  // ── RGBW ────────────────────────────────────────────────────
  if (s.rgbwPoints > 0) {
    const dev = pickRgbw(ctx);
    if (dev) add(items, dev, s.rgbwPoints, `RGBW: ${s.rgbwPoints} лент`);
    else gaps.push(`RGBW (${s.rgbwPoints})`);
  }

  // ── Шторы ───────────────────────────────────────────────────
  if (s.curtainPoints > 0) {
    const dev = pickShutter(ctx);
    if (dev) add(items, dev, s.curtainPoints, `шторы: ${s.curtainPoints} приводов`);
    else gaps.push(`Шторы (${s.curtainPoints})`);
  }

  // ── Розетки ─────────────────────────────────────────────────
  if (s.socketPoints > 0) {
    const dev = pickPlug(ctx);
    if (dev) add(items, dev, s.socketPoints, `розетки: ${s.socketPoints} шт`);
    else gaps.push(`Розетки (${s.socketPoints})`);
  }

  // ── Радиаторное отопление: BLU TRV + Starter Kit ────────────
  if (s.heatingZones > 0) {
    const trv = pickTRV(ctx);
    if (trv) {
      add(items, trv, s.heatingZones, `радиаторы: ${s.heatingZones} BLU TRV`);
      usesBlu = true;
      notes.push("Радиаторы: батарейные термоголовки Shelly BLU TRV (BLE), требуют BLU Gateway Gen3.");
    } else gaps.push(`Отопление (${s.heatingZones}): нет BLU TRV в каталоге`);
  }

  // ── Тёплый пол: 1PM Mini + Add-on (DS18B20) ─────────────────
  if (s.floorHeatingZones > 0) {
    const relay = pickFloorRelay(ctx);
    const addon = pickAddOnDS(ctx);
    if (relay) {
      add(items, relay, s.floorHeatingZones, `тёплый пол: реле на ${s.floorHeatingZones} зон`);
      if (addon) {
        add(items, addon, s.floorHeatingZones, "Plus Add-on с DS18B20 для датчика стяжки");
      } else {
        notes.push("Тёплый пол: добавьте Shelly Plus Add-on с DS18B20 для датчика стяжки.");
      }
    } else gaps.push(`Тёплый пол (${s.floorHeatingZones})`);
  }

  // ── Датчики движения ────────────────────────────────────────
  if (s.motionPoints > 0) {
    const dev = pickMotion(ctx);
    if (dev) {
      add(items, dev, s.motionPoints, `движение: ${s.motionPoints} шт`);
      if (dev.meta.is_blu) usesBlu = true;
    } else gaps.push(`Движение (${s.motionPoints})`);
  }

  // ── Антипротечка ────────────────────────────────────────────
  if (s.leakPoints > 0) {
    const leak = pickLeak(ctx);
    if (leak) add(items, leak, s.leakPoints, `протечка: ${s.leakPoints} датчиков`);
    else gaps.push(`Протечка (${s.leakPoints})`);
    // Кран перекрытия: рекомендуем 1PM Gen3/4 + внешний привод (у Shelly нет фирменного крана)
    const valveRelay =
      findByTitle(devs, "shelly 1pm gen4") ??
      findByTitle(devs, "shelly 1pm gen3");
    if (valveRelay) {
      add(items, valveRelay, 2, "управление кранами ХВС/ГВС (внешний 220В привод)");
      notes.push("Кран перекрытия воды реализуется внешним 220В-приводом + Shelly 1PM (нет фирменного крана).");
    }
  }

  // ── Двери / окна ────────────────────────────────────────────
  if (s.doorPoints > 0) {
    const dev = pickDoorWindow(ctx);
    if (dev) {
      add(items, dev, s.doorPoints, `двери/окна: ${s.doorPoints} датчиков`);
      if (dev.meta.is_blu) usesBlu = true;
    } else gaps.push(`Двери/окна (${s.doorPoints})`);
  }

  // ── T° / влажность ──────────────────────────────────────────
  if (s.thPoints > 0) {
    const dev = pickTH(ctx);
    if (dev) {
      add(items, dev, s.thPoints, `T°/влажность: ${s.thPoints} шт`);
      if (dev.meta.is_blu) usesBlu = true;
    } else gaps.push(`T°/влажность (${s.thPoints})`);
  }

  // ── Мониторинг энергии ──────────────────────────────────────
  if (s.energyMonitoring) {
    const meter = pickEnergyMeter(ctx);
    if (meter) add(items, meter, 1, "общий энерго-мониторинг на ввод");
  }

  // ── BLU Gateway (если есть BLU-устройства) ──────────────────
  if (usesBlu) {
    const gw = pickBluGateway(ctx);
    if (gw) {
      add(items, gw, 1, "шлюз BLU → Wi-Fi/Cloud для всех BLU-устройств");
    } else {
      notes.push("Для BLU-устройств нужен Shelly BLU Gateway Gen3 (или любое Wi-Fi устройство Shelly как BLE-репитер).");
    }
  }

  // ── Настенная панель управления ─────────────────────────────
  if (s.needHub || s.installStyle === "panel") {
    const wd = pickWallDisplay(ctx);
    if (wd) add(items, wd, 1, "настенная панель Shelly Wall Display");
    else notes.push("Wall Display не найден в каталоге.");
  } else {
    notes.push("Отдельный хаб Shelly не требуется — устройства работают по Wi-Fi/BT напрямую и через Shelly Cloud.");
  }

  const totalDevices = items.reduce((acc, i) => acc + i.qty, 0);
  return { vendor: "shelly", items, totalDevices, gaps, notes };
}

/* ════════════════════════════════════════════════════════════════════════
 * HitePRO: оставляем прежнюю наивную логику, но в чистом виде
 * ════════════════════════════════════════════════════════════════════════ */

function pickHt(catalog: Catalog, type: DeviceType, opts: { titleHas?: string[]; preferMaxChannels?: boolean; preferPM?: boolean } = {}): Device | null {
  const all = catalog.devices.filter((d) => d.vendor === "hitepro" && d.type === type);
  let pool = all;
  if (opts.titleHas?.length) {
    const t = opts.titleHas.map((s) => s.toLowerCase());
    pool = pool.filter((d) => t.some((s) => d.title.toLowerCase().includes(s)));
  }
  if (pool.length === 0) pool = all;
  if (pool.length === 0) return null;
  pool = [...pool].sort((a, b) => {
    if (opts.preferPM) {
      const pm = Number(b.power_metering) - Number(a.power_metering);
      if (pm !== 0) return pm;
    }
    if (opts.preferMaxChannels) {
      const c = (b.channels || 1) - (a.channels || 1);
      if (c !== 0) return c;
    } else {
      const c = (a.channels || 1) - (b.channels || 1);
      if (c !== 0) return c;
    }
    return a.title.localeCompare(b.title);
  });
  return pool[0];
}

function recommendHitePro(catalog: Catalog, s: Scenario): Recommendation {
  const items: PickedItem[] = [];
  const gaps: string[] = [];
  const notes: string[] = [];

  if (s.lightPoints > 0) {
    const r = pickHt(catalog, "relay", { preferMaxChannels: true, preferPM: s.energyMonitoring });
    if (r) add(items, r, unitsNeeded(s.lightPoints, r.channels), `освещение: ${s.lightPoints} групп`);
    else gaps.push(`Освещение (${s.lightPoints})`);
  }
  if (s.dimmerPoints > 0) {
    const d = pickHt(catalog, "dimmer", { preferMaxChannels: true });
    if (d) add(items, d, unitsNeeded(s.dimmerPoints, d.channels || 1), `диммирование: ${s.dimmerPoints} гр.`);
    else gaps.push(`Диммирование (${s.dimmerPoints})`);
  }
  if (s.rgbwPoints > 0) {
    const d = pickHt(catalog, "rgbw");
    if (d) add(items, d, s.rgbwPoints, `RGBW: ${s.rgbwPoints} лент`);
    else gaps.push(`RGBW (${s.rgbwPoints})`);
  }
  if (s.socketPoints > 0) {
    const p = pickHt(catalog, "smart_plug");
    if (p) add(items, p, s.socketPoints, `розетки: ${s.socketPoints} шт`);
  }
  if (s.curtainPoints > 0) {
    const d = pickHt(catalog, "drive");
    if (d) add(items, d, s.curtainPoints, `шторы: ${s.curtainPoints} приводов`);
    else gaps.push(`Шторы (${s.curtainPoints})`);
  }
  if (s.heatingZones > 0) {
    const t = pickHt(catalog, "thermostat");
    if (t) add(items, t, s.heatingZones, `отопление: ${s.heatingZones} зон`);
    else gaps.push(`Отопление (${s.heatingZones})`);
  }
  if (s.floorHeatingZones > 0) {
    const t = pickHt(catalog, "thermostat");
    const f = pickHt(catalog, "floor_temp_sensor");
    if (t) add(items, t, s.floorHeatingZones, `тёплый пол: термостат на ${s.floorHeatingZones} зон`);
    if (f) add(items, f, s.floorHeatingZones, `тёплый пол: датчик стяжки`);
    if (!t) gaps.push(`Тёплый пол (${s.floorHeatingZones})`);
  }
  if (s.motionPoints > 0) {
    const m = pickHt(catalog, "motion_sensor");
    if (m) add(items, m, s.motionPoints, `движение: ${s.motionPoints} шт`);
  }
  if (s.leakPoints > 0) {
    const l = pickHt(catalog, "leak_sensor");
    const v = pickHt(catalog, "valve");
    if (l) add(items, l, s.leakPoints, `протечка: ${s.leakPoints} датчиков`);
    if (v) add(items, v, 2, `краны перекрытия`);
  }
  if (s.doorPoints > 0) {
    const d = pickHt(catalog, "door_sensor");
    if (d) add(items, d, s.doorPoints, `охранка: ${s.doorPoints} датчиков`);
  }
  if (s.thPoints > 0) {
    const th = pickHt(catalog, "temperature_humidity");
    if (th) add(items, th, s.thPoints, `T°/влажность: ${s.thPoints} шт`);
  }
  if (s.needHub) {
    const hub = pickHt(catalog, "hub");
    if (hub) add(items, hub, 1, `центральный сервер УД`);
  } else {
    notes.push("HitePRO — радиосистема 868 МГц. Без сервера работает только локально.");
  }

  const totalDevices = items.reduce((acc, i) => acc + i.qty, 0);
  return { vendor: "hitepro", items, totalDevices, gaps, notes };
}

/* ════════════════════════════════════════════════════════════════════════
 * Точка входа
 * ════════════════════════════════════════════════════════════════════════ */

export function recommend(catalog: Catalog, vendor: Vendor, s: Scenario): Recommendation {
  if (vendor === "shelly") {
    return recommendShelly(catalog as CleanCatalog, s);
  }
  return recommendHitePro(catalog, s);
}
