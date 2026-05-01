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

/* ─────────────────────────── HitePRO helpers ──────────────────────────── */

function htAll(catalog: Catalog): Device[] {
  return catalog.devices.filter((d) => d.vendor === "hitepro");
}

function htFind(catalog: Catalog, ...needles: string[]): Device | undefined {
  const n = needles.map((s) => s.toLowerCase());
  return htAll(catalog).find((d) => {
    const t = d.title.toLowerCase();
    return n.every((needle) => t.includes(needle));
  });
}

/** Выбор реле освещения: компактные блоки vs DIN-модули. */
function htPickLightRelay(catalog: Catalog, s: Scenario): Device | undefined {
  // DIN-rail или большой объект → DIN-4.Relay (4 линии × 16А)
  if (s.installStyle === "din" || s.lightPoints >= 6) {
    return htFind(catalog, "din-4.relay") ?? htFind(catalog, "relay-4m");
  }
  // Компактные блоки: Relay-1 для одной линии, Relay-2 для двух
  if (s.lightPoints >= 2) {
    return htFind(catalog, "relay-2") ?? htFind(catalog, "relay-1");
  }
  return htFind(catalog, "relay-1");
}

function htPickDimmer(catalog: Catalog, s: Scenario): Device | undefined {
  if (s.installStyle === "din") {
    // В каталоге калькулятора нет DIN-4.DIM — падаем на компактный
    return htFind(catalog, "relay-dim") ?? htFind(catalog, "0/1-10v");
  }
  return htFind(catalog, "relay-dim") ?? htFind(catalog, "0/1-10v");
}

function htPickRgbw(catalog: Catalog, s: Scenario): Device | undefined {
  if (s.installStyle === "din") {
    return htFind(catalog, "din-1.rgbw") ?? htFind(catalog, "din-4.led");
  }
  return htFind(catalog, "relay-rgbw") ?? htFind(catalog, "relay-led");
}

function htPickHeavyRelay(catalog: Catalog): Device | undefined {
  // 16А реле — основа сценариев отопления и тёплого пола (по каталогу с.17)
  return htFind(catalog, "relay-16") ?? htFind(catalog, "din-4.relay");
}

function htPickValveDriver(catalog: Catalog): Device | undefined {
  // Relay-DRIVE — управление шаровыми кранами / приводами
  return htFind(catalog, "relay-drive");
}

function htPickHub(catalog: Catalog, s: Scenario): Device | undefined {
  if (s.installStyle === "din") {
    return htFind(catalog, "din-gateway") ?? htFind(catalog, "gateway");
  }
  return htFind(catalog, "сервер", "gateway") ?? htFind(catalog, "gateway");
}

function recommendHitePro(catalog: Catalog, s: Scenario): Recommendation {
  const items: PickedItem[] = [];
  const gaps: string[] = [];
  const notes: string[] = [];

  // ── Свет ───────────────────────────────────────────────────
  if (s.lightPoints > 0) {
    const r = htPickLightRelay(catalog, s);
    if (r) add(items, r, unitsNeeded(s.lightPoints, r.channels || 1), `освещение: ${s.lightPoints} групп`);
    else gaps.push(`Освещение (${s.lightPoints})`);
  }

  // ── Диммирование ───────────────────────────────────────────
  if (s.dimmerPoints > 0) {
    const d = htPickDimmer(catalog, s);
    if (d) add(items, d, unitsNeeded(s.dimmerPoints, d.channels || 1), `диммирование: ${s.dimmerPoints} гр.`);
    else gaps.push(`Диммирование (${s.dimmerPoints})`);
  }

  // ── RGBW ───────────────────────────────────────────────────
  if (s.rgbwPoints > 0) {
    const d = htPickRgbw(catalog, s);
    if (d) add(items, d, s.rgbwPoints, `RGBW: ${s.rgbwPoints} лент`);
    else gaps.push(`RGBW (${s.rgbwPoints})`);
  }

  // ── Розетки ────────────────────────────────────────────────
  if (s.socketPoints > 0) {
    const p = htFind(catalog, "smart socket") ?? htFind(catalog, "розетка");
    if (p) add(items, p, s.socketPoints, `розетки: ${s.socketPoints} шт`);
  }

  // ── Шторы ──────────────────────────────────────────────────
  if (s.curtainPoints > 0) {
    const d = htFind(catalog, "relay-drive");
    if (d) add(items, d, s.curtainPoints, `шторы: ${s.curtainPoints} приводов (Relay-DRIVE)`);
    else gaps.push(`Шторы (${s.curtainPoints})`);
  }

  // ── Отопление: Relay-16A + Smart Air + Gateway (см. каталог с.17, с.50) ─
  if (s.heatingZones > 0) {
    const r = htPickHeavyRelay(catalog);
    const air = htFind(catalog, "smart air");
    if (r) {
      add(items, r, unitsNeeded(s.heatingZones, r.channels || 1), `отопление: реле котла/насоса (Relay-16A)`);
      if (air) add(items, air, s.heatingZones, `T°/влажность для климат-сценариев`);
      notes.push("Отопление HitePRO: Relay-16A + датчик Smart Air + сервер Gateway для сценариев (фирменного термостата нет).");
    } else {
      gaps.push(`Отопление (${s.heatingZones})`);
    }
  }

  // ── Тёплый пол: Relay-16A + Rexant floor sensor ─────────────
  if (s.floorHeatingZones > 0) {
    const r = htPickHeavyRelay(catalog);
    const floor = htFind(catalog, "температуры пола") ?? htFind(catalog, "rexant");
    if (r) {
      add(items, r, unitsNeeded(s.floorHeatingZones, r.channels || 1), `тёплый пол: коммутация (Relay-16A)`);
      if (floor) add(items, floor, s.floorHeatingZones, `датчик температуры пола`);
      notes.push("Тёплый пол HitePRO: Relay-16A + датчик пола + сервер Gateway (управление по сценарию).");
    } else {
      gaps.push(`Тёплый пол (${s.floorHeatingZones})`);
    }
  }

  // ── Движение ───────────────────────────────────────────────
  if (s.motionPoints > 0) {
    const m = htFind(catalog, "smart motion");
    if (m) add(items, m, s.motionPoints, `движение/освещённость: ${s.motionPoints} шт`);
    else gaps.push(`Движение (${s.motionPoints})`);
  }

  // ── Антипротечка: Smart Water + Relay-DRIVE для шаровых кранов ──
  if (s.leakPoints > 0) {
    const water = htFind(catalog, "smart water");
    const drive = htPickValveDriver(catalog);
    if (water) add(items, water, s.leakPoints, `протечка: ${s.leakPoints} датчиков`);
    else gaps.push(`Протечка (${s.leakPoints})`);
    if (drive) {
      add(items, drive, 2, `управление шаровыми кранами ХВС/ГВС (Relay-DRIVE + внешний привод)`);
      notes.push("Кран перекрытия: Relay-DRIVE 12В/220В + внешний моторизированный шаровой кран (фирменного крана нет).");
    }
  }

  // ── Двери / окна ───────────────────────────────────────────
  if (s.doorPoints > 0) {
    const d = htFind(catalog, "smart checker");
    if (d) add(items, d, s.doorPoints, `двери/окна: ${s.doorPoints} датчиков`);
    else gaps.push(`Двери/окна (${s.doorPoints})`);
  }

  // ── T° / влажность ─────────────────────────────────────────
  if (s.thPoints > 0) {
    const th = htFind(catalog, "smart air");
    if (th) add(items, th, s.thPoints, `T°/влажность: ${s.thPoints} шт`);
    else gaps.push(`T°/влажность (${s.thPoints})`);
  }

  // ── Сервер УД (Gateway) ─────────────────────────────────────
  // По каталогу: «Получая радиосигнал от передатчиков, блок управления замыкает цепь».
  // Без Gateway работают только связки выключатель↔блок.
  // Сценарии (отопление, протечка, T°/H, движение → свет, удалённое управление) требуют Gateway.
  const needsGateway =
    s.needHub ||
    s.heatingZones > 0 ||
    s.floorHeatingZones > 0 ||
    s.leakPoints > 0 ||
    s.thPoints > 0 ||
    s.energyMonitoring;
  if (needsGateway) {
    const hub = htPickHub(catalog, s);
    if (hub) add(items, hub, 1, "сервер умного дома (Gateway/DIN-Gateway)");
    else notes.push("Нужен сервер HiTE PRO Gateway, но он не найден в каталоге.");
  } else {
    notes.push("HitePRO без сервера: каждая клавиша работает напрямую с блоком (локально, 868 МГц), без приложения и сценариев.");
  }

  if (s.energyMonitoring) {
    notes.push("Энергомониторинг у HitePRO отсутствует как функция блоков — учёт идёт косвенно через сценарии Gateway.");
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
