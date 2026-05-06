import type {
  Catalog,
  Device,
  DeviceType,
  PickedItem,
  Recommendation,
  Scenario,
  Vendor,
} from "./types";

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
 * SHELLY: подбор из каталога i-on.pro (официальный дистрибьютор РФ)
 *
 * Каталог ion_catalog.json содержит только реально доступные устройства
 * с полями: install (in_wall/din/wall/wireless), tech (wifi/zwave/bluetooth),
 * category (relay/dimmer/sensor/...), channels, power_metering, price.
 *
 * Подбор ведётся по структурированным полям, а не по названиям.
 * ════════════════════════════════════════════════════════════════════════ */

interface ShellyCtx {
  devs: Device[];
  s: Scenario;
  notes: string[];
  gaps: string[];
}

function byId(devs: Device[], id: string): Device | undefined {
  return devs.find((d) => d.id === id);
}

function find(devs: Device[], ...needles: string[]): Device | undefined {
  const n = needles.map((s) => s.toLowerCase());
  return devs.find((d) => {
    const t = d.title.toLowerCase();
    return n.every((needle) => t.includes(needle));
  });
}

function relays(devs: Device[], installType: string): Device[] {
  return devs.filter(
    (d) =>
      d.category === "relay" &&
      d.channels! >= 1 &&
      (d.install || []).includes(installType)
  );
}

function cheapest(list: Device[]): Device | undefined {
  if (!list.length) return undefined;
  return list.reduce((a, b) => ((a.price || Infinity) <= (b.price || Infinity) ? a : b));
}

function pickLightRelay(ctx: ShellyCtx, channelsNeeded: number): Device | undefined {
  const { devs, s, notes } = ctx;

  if (s.noNeutral) {
    const dev = find(devs, "1l gen3") ?? find(devs, "2l gen3");
    if (dev) {
      notes.push("Нет нейтрали — " + dev.title + " (не требует нейтрального провода).");
      return dev;
    }
  }

  if (s.installStyle === "din") {
    const dinRelays = relays(devs, "din").sort((a, b) => (b.channels || 1) - (a.channels || 1));
    return dinRelays.find((d) => (d.channels || 1) >= 4)
      ?? dinRelays.find((d) => (d.channels || 1) >= 2)
      ?? dinRelays[0];
  }

  if (s.protocolPref === "zwave") {
    const wave = devs.filter((d) => d.category === "relay" && (d.tech || []).includes("zwave"));
    return channelsNeeded >= 2
      ? (wave.find((d) => (d.channels || 1) >= 2) ?? wave[0])
      : (wave.find((d) => (d.channels || 1) === 1) ?? wave[0]);
  }

  const inWall = relays(devs, "in_wall");
  if (channelsNeeded >= 2) {
    const twoChannel = inWall
      .filter((d) => (d.channels || 1) >= 2)
      .sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
    return twoChannel[0] ?? cheapest(inWall);
  }

  if (s.energyMonitoring) {
    const pmRelays = inWall
      .filter((d) => d.power_metering && (d.channels || 1) === 1)
      .sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
    return pmRelays[0] ?? cheapest(inWall);
  }

  const oneChannel = inWall
    .filter((d) => (d.channels || 1) === 1)
    .sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
  return oneChannel[0] ?? cheapest(inWall);
}

function pickDimmer(ctx: ShellyCtx): Device | undefined {
  const { devs, s } = ctx;
  const dimmers = devs.filter((d) => d.category === "dimmer");

  if (s.installStyle === "din") {
    const din = dimmers.filter((d) => (d.install || []).includes("din"));
    return cheapest(din) ?? cheapest(dimmers);
  }

  const inWall = dimmers.filter((d) => (d.install || []).includes("in_wall"));
  return cheapest(inWall) ?? cheapest(dimmers);
}

function pickRgbw(ctx: ShellyCtx): Device | undefined {
  const { devs, s } = ctx;
  const rgbw = devs.filter(
    (d) => (d.product_types || []).some((t) => t === "rgbw")
  );
  if (s.installStyle === "din") {
    const din = rgbw.filter((d) => (d.install || []).includes("din"));
    return cheapest(din) ?? cheapest(rgbw);
  }
  const inWall = rgbw.filter((d) => (d.install || []).includes("in_wall"));
  return cheapest(inWall) ?? cheapest(rgbw);
}

function pickShutter(ctx: ShellyCtx): Device | undefined {
  const { devs, s } = ctx;
  const shutters = devs.filter(
    (d) => (d.product_types || []).some((t) => t === "shutter")
  );

  if (s.installStyle === "din") {
    const din = shutters.filter((d) => (d.install || []).includes("din"));
    return cheapest(din) ?? cheapest(shutters);
  }

  const inWall = shutters.filter((d) => (d.install || []).includes("in_wall"));
  return cheapest(inWall) ?? cheapest(shutters);
}

function pickPlug(ctx: ShellyCtx): Device | undefined {
  const plugs = ctx.devs.filter((d) => d.category === "smart_plug");
  return cheapest(plugs);
}

function pickDoorWindow(ctx: ShellyCtx): Device | undefined {
  return find(ctx.devs, "door/window") ?? find(ctx.devs, "door");
}

function pickMotion(ctx: ShellyCtx): Device | undefined {
  return find(ctx.devs, "motion");
}

function pickFlood(ctx: ShellyCtx): Device | undefined {
  return find(ctx.devs, "flood");
}

function pickTRV(ctx: ShellyCtx): Device | undefined {
  return find(ctx.devs, "trv");
}

function pickFloorRelay(ctx: ShellyCtx): Device | undefined {
  const inWall = relays(ctx.devs, "in_wall")
    .filter((d) => d.power_metering && (d.channels || 1) === 1)
    .sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
  return inWall[0];
}

function pickAddOn(ctx: ShellyCtx): Device | undefined {
  return find(ctx.devs, "addon") ?? find(ctx.devs, "add-on");
}

function pickEnergyMeter(ctx: ShellyCtx): Device | undefined {
  const { devs, s } = ctx;
  const meters = devs.filter((d) => d.category === "energy_meter");
  if (s.installStyle === "din") {
    const din = meters.filter((d) => (d.install || []).includes("din"));
    return cheapest(din) ?? cheapest(meters);
  }
  const inWall = meters.filter((d) => (d.install || []).includes("in_wall"));
  return cheapest(inWall) ?? cheapest(meters);
}

function pickBypass(ctx: ShellyCtx): Device | undefined {
  return find(ctx.devs, "bypass");
}

function pickBluGateway(ctx: ShellyCtx): Device | undefined {
  return find(ctx.devs, "gateway");
}

/* ───────────────────────── Shelly: главный сборщик ──────────────────────── */

function recommendShelly(catalog: Catalog, s: Scenario): Recommendation {
  const devs = catalog.devices.filter((d) => d.vendor === "shelly");
  const items: PickedItem[] = [];
  const gaps: string[] = [];
  const notes: string[] = [];
  const ctx: ShellyCtx = { devs, s, notes, gaps };

  let usesBlu = false;

  // ── Свет (вкл/выкл) ─────────────────────────────────────────
  if (s.lightPoints > 0) {
    const dev = pickLightRelay(ctx, s.lightPoints);
    if (dev) {
      const qty = unitsNeeded(s.lightPoints, dev.channels || 1);
      add(items, dev, qty, `освещение: ${s.lightPoints} групп`);
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

  // ── Радиаторы: BLU TRV ─────────────────────────────────────
  if (s.radiatorCount > 0) {
    const trv = pickTRV(ctx);
    if (trv) {
      add(items, trv, s.radiatorCount, `радиаторы: ${s.radiatorCount} BLU TRV`);
      usesBlu = true;
      notes.push("Радиаторы: батарейные термоголовки Shelly BLU TRV (BLE), требуют BLU Gateway Gen3.");
    } else gaps.push(`Радиаторы (${s.radiatorCount}): нет BLU TRV в каталоге`);
  }

  // ── Тёплый пол: 1PM Mini + Add-on (DS18B20) ─────────────────
  if (s.floorHeatingZones > 0) {
    const relay = pickFloorRelay(ctx);
    const addon = pickAddOn(ctx);
    if (relay) {
      add(items, relay, s.floorHeatingZones, `тёплый пол: реле на ${s.floorHeatingZones} зон`);
      if (addon) {
        add(items, addon, s.floorHeatingZones, "Shelly AddOn с DS18B20 для датчика стяжки");
      } else {
        notes.push("Тёплый пол: добавьте Shelly AddOn с DS18B20 для датчика стяжки.");
      }
    } else gaps.push(`Тёплый пол (${s.floorHeatingZones})`);
  }

  // ── Датчики движения ────────────────────────────────────────
  if (s.motionPoints > 0) {
    const dev = pickMotion(ctx);
    if (dev) {
      add(items, dev, s.motionPoints, `движение: ${s.motionPoints} шт`);
      if ((dev.tech || []).includes("bluetooth")) usesBlu = true;
    } else gaps.push(`Движение (${s.motionPoints})`);
  }

  // ── Антипротечка: 3 × Flood на зону + краны ХВС/ГВС ────────
  if (s.antiLeakZones > 0) {
    const flood = pickFlood(ctx);
    const sensorsTotal = s.antiLeakZones * 3;
    if (flood) {
      add(items, flood, sensorsTotal, `антипротечка: ${s.antiLeakZones} зон × 3 датчика (ванна, раковина, стиральная машина)`);
    } else gaps.push(`Антипротечка (${s.antiLeakZones} зон): нет Shelly Flood в каталоге`);

    const valveRelay = relays(devs, "in_wall")
      .filter((d) => d.power_metering && (d.channels || 1) === 1)
      .sort((a, b) => (a.price || Infinity) - (b.price || Infinity))[0];
    if (valveRelay) {
      add(items, valveRelay, 2, "управление кранами ХВС/ГВС (внешний 220В привод)");
      notes.push("Кран перекрытия воды: внешний 220В-привод + " + valveRelay.title + " на каждый кран (ХВС и ГВС).");
    }
  }

  // ── Двери / окна ────────────────────────────────────────────
  if (s.doorPoints > 0) {
    const dev = pickDoorWindow(ctx);
    if (dev) {
      add(items, dev, s.doorPoints, `двери/окна: ${s.doorPoints} датчиков`);
      if ((dev.tech || []).includes("bluetooth")) usesBlu = true;
    } else gaps.push(`Двери/окна (${s.doorPoints})`);
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
    const wd = find(devs, "wall display");
    if (wd) add(items, wd, 1, "настенная панель Shelly Wall Display");
    else notes.push("Wall Display не найден в каталоге.");
  } else {
    notes.push("Отдельный хаб Shelly не требуется — устройства работают по Wi-Fi/BT напрямую и через Shelly Cloud.");
  }

  const totalDevices = items.reduce((acc, i) => acc + i.qty, 0);
  return { vendor: "shelly", items, totalDevices, gaps, notes };
}

/* ════════════════════════════════════════════════════════════════════════
 * HitePRO
 * ════════════════════════════════════════════════════════════════════════ */

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

function htPickLightRelay(catalog: Catalog, s: Scenario): Device | undefined {
  if (s.installStyle === "din" || s.lightPoints >= 6) {
    return htFind(catalog, "din-4.relay") ?? htFind(catalog, "relay-4m");
  }
  if (s.lightPoints >= 2) {
    return htFind(catalog, "relay-2") ?? htFind(catalog, "relay-1");
  }
  return htFind(catalog, "relay-1");
}

function htPickDimmer(catalog: Catalog, s: Scenario): Device | undefined {
  if (s.installStyle === "din") {
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
  return htFind(catalog, "relay-16") ?? htFind(catalog, "din-4.relay");
}

function htPickValveDriver(catalog: Catalog): Device | undefined {
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

  // ── Радиаторы: Relay-16A + Smart Air + Gateway ─────────────
  if (s.radiatorCount > 0) {
    const r = htPickHeavyRelay(catalog);
    const air = htFind(catalog, "smart air");
    if (r) {
      add(items, r, unitsNeeded(s.radiatorCount, r.channels || 1), `отопление: реле котла/насоса (Relay-16A)`);
      if (air) add(items, air, s.radiatorCount, `T°/влажность для климат-сценариев`);
      notes.push("Отопление HitePRO: Relay-16A + датчик Smart Air + сервер Gateway для сценариев.");
    } else {
      gaps.push(`Радиаторы (${s.radiatorCount})`);
    }
  }

  // ── Тёплый пол: Relay-16A + Rexant floor sensor ─────────────
  if (s.floorHeatingZones > 0) {
    const r = htPickHeavyRelay(catalog);
    const floor = htFind(catalog, "температуры пола") ?? htFind(catalog, "rexant");
    if (r) {
      add(items, r, unitsNeeded(s.floorHeatingZones, r.channels || 1), `тёплый пол: коммутация (Relay-16A)`);
      if (floor) add(items, floor, s.floorHeatingZones, `датчик температуры пола`);
      notes.push("Тёплый пол HitePRO: Relay-16A + датчик пола + сервер Gateway.");
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

  // ── Антипротечка: Smart Water × 3 на зону + Relay-DRIVE для кранов ──
  if (s.antiLeakZones > 0) {
    const water = htFind(catalog, "smart water");
    const drive = htPickValveDriver(catalog);
    const sensorsTotal = s.antiLeakZones * 3;
    if (water) add(items, water, sensorsTotal, `антипротечка: ${s.antiLeakZones} зон × 3 датчика (ванна, раковина, стиральная машина)`);
    else gaps.push(`Антипротечка (${s.antiLeakZones} зон)`);
    if (drive) {
      add(items, drive, 2, `управление шаровыми кранами ХВС/ГВС (Relay-DRIVE + внешний привод)`);
      notes.push("Кран перекрытия: Relay-DRIVE + внешний моторизированный шаровой кран.");
    }
  }

  // ── Двери / окна ───────────────────────────────────────────
  if (s.doorPoints > 0) {
    const d = htFind(catalog, "smart checker");
    if (d) add(items, d, s.doorPoints, `двери/окна: ${s.doorPoints} датчиков`);
    else gaps.push(`Двери/окна (${s.doorPoints})`);
  }

  // ── Сервер УД (Gateway) ─────────────────────────────────────
  const needsGateway =
    s.needHub ||
    s.radiatorCount > 0 ||
    s.floorHeatingZones > 0 ||
    s.antiLeakZones > 0 ||
    s.energyMonitoring;
  if (needsGateway) {
    const hub = htPickHub(catalog, s);
    if (hub) add(items, hub, 1, "сервер умного дома (Gateway/DIN-Gateway)");
    else notes.push("Нужен сервер HiTE PRO Gateway, но он не найден в каталоге.");
  } else {
    notes.push("HitePRO без сервера: каждая клавиша работает напрямую с блоком (локально, 868 МГц).");
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
    return recommendShelly(catalog, s);
  }
  return recommendHitePro(catalog, s);
}
