import type {
  Catalog,
  Device,
  DeviceType,
  PickedItem,
  Recommendation,
  Scenario,
  Vendor,
} from "./types";

/**
 * Подбираем устройство нужного типа у вендора.
 * Стратегия: фильтр по типу → опционально приоритет power_metering →
 * сортировка по числу каналов (для реле выбираем самые ёмкие).
 */
function pickDevice(
  catalog: Catalog,
  vendor: Vendor,
  type: DeviceType,
  opts: {
    minChannels?: number;
    preferPM?: boolean;
    titleHas?: string[];     // дополнительный фильтр по названию
    titleAvoid?: string[];   // исключить по названию
    preferMaxChannels?: boolean;
  } = {}
): Device | null {
  const all = catalog.devices.filter((d) => d.vendor === vendor && d.type === type);
  let pool = all;

  if (opts.titleHas?.length) {
    const t = opts.titleHas.map((s) => s.toLowerCase());
    pool = pool.filter((d) => t.some((s) => d.title.toLowerCase().includes(s)));
  }
  if (opts.titleAvoid?.length) {
    const t = opts.titleAvoid.map((s) => s.toLowerCase());
    pool = pool.filter((d) => !t.some((s) => d.title.toLowerCase().includes(s)));
  }
  if (opts.minChannels) {
    pool = pool.filter((d) => (d.channels || 1) >= opts.minChannels!);
  }
  if (pool.length === 0) pool = all;
  if (pool.length === 0) return null;

  pool = [...pool].sort((a, b) => {
    if (opts.preferPM) {
      const pmDiff = Number(b.power_metering) - Number(a.power_metering);
      if (pmDiff !== 0) return pmDiff;
    }
    if (opts.preferMaxChannels) {
      const c = (b.channels || 1) - (a.channels || 1);
      if (c !== 0) return c;
    } else {
      // умолчание — наименьшее достаточное число каналов
      const c = (a.channels || 1) - (b.channels || 1);
      if (c !== 0) return c;
    }
    return a.title.localeCompare(b.title);
  });

  return pool[0];
}

function add(items: PickedItem[], device: Device | null, qty: number, reason: string) {
  if (!device || qty <= 0) return;
  const existing = items.find((i) => i.device.id === device.id);
  if (existing) {
    existing.qty += qty;
    if (!existing.reason.includes(reason)) existing.reason += "; " + reason;
  } else {
    items.push({ device, qty, reason });
  }
}

/**
 * Сколько физических реле нужно для N групп освещения,
 * если выбранное устройство имеет k каналов на корпус.
 */
function unitsNeeded(points: number, channelsPerUnit: number): number {
  const k = Math.max(channelsPerUnit || 1, 1);
  return Math.ceil(points / k);
}

export function recommend(
  catalog: Catalog,
  vendor: Vendor,
  s: Scenario
): Recommendation {
  const items: PickedItem[] = [];
  const gaps: string[] = [];
  const notes: string[] = [];

  // ── Освещение (вкл/выкл) ─────────────────────────────────────
  if (s.lightPoints > 0) {
    const relay = pickDevice(catalog, vendor, "relay", {
      preferMaxChannels: true,
      preferPM: s.energyMonitoring,
      titleAvoid: vendor === "shelly" ? ["mini", "uni"] : [],
    });
    if (relay) {
      const qty = unitsNeeded(s.lightPoints, relay.channels);
      add(items, relay, qty, `освещение: ${s.lightPoints} групп`);
    } else {
      gaps.push(`Освещение (${s.lightPoints} гр.): нет реле в линейке`);
    }
  }

  // ── Диммирование ─────────────────────────────────────────────
  if (s.dimmerPoints > 0) {
    const dim = pickDevice(catalog, vendor, "dimmer", { preferMaxChannels: true });
    if (dim) {
      const qty = unitsNeeded(s.dimmerPoints, dim.channels || 1);
      add(items, dim, qty, `диммирование: ${s.dimmerPoints} гр.`);
    } else {
      gaps.push(`Диммирование (${s.dimmerPoints} гр.): нет диммеров`);
    }
  }

  // ── RGBW ленты ───────────────────────────────────────────────
  if (s.rgbwPoints > 0) {
    const rgbw = pickDevice(catalog, vendor, "rgbw");
    if (rgbw) {
      add(items, rgbw, s.rgbwPoints, `RGBW: ${s.rgbwPoints} лент`);
    } else {
      gaps.push(`RGBW (${s.rgbwPoints}): нет в линейке вендора`);
    }
  }

  // ── Розетки ──────────────────────────────────────────────────
  if (s.socketPoints > 0) {
    const plug = pickDevice(catalog, vendor, "smart_plug", {
      preferPM: s.energyMonitoring,
    });
    if (plug) {
      add(items, plug, s.socketPoints, `розетки: ${s.socketPoints} шт`);
    } else {
      // фолбэк — реле в подрозетник
      const relay = pickDevice(catalog, vendor, "relay", {
        preferPM: s.energyMonitoring,
      });
      if (relay) {
        const qty = unitsNeeded(s.socketPoints, relay.channels);
        add(items, relay, qty, `розетки через реле в подрозетник`);
        notes.push("Розетки реализованы через скрытое реле — вендор не имеет умных розеток.");
      } else {
        gaps.push(`Розетки (${s.socketPoints}): нет ни умной розетки, ни реле`);
      }
    }
  }

  // ── Шторы / приводы ──────────────────────────────────────────
  if (s.curtainPoints > 0) {
    const drive = pickDevice(catalog, vendor, "drive");
    if (drive) {
      add(items, drive, s.curtainPoints, `шторы: ${s.curtainPoints} приводов`);
    } else {
      // у Shelly есть Shelly 2PM в режиме roller — попробуем 2-канальное реле
      const roller = pickDevice(catalog, vendor, "relay", {
        titleHas: ["2pm", "2.5", "plus 2"],
      });
      if (roller) {
        add(items, roller, s.curtainPoints, `шторы через 2-канальное реле (roller)`);
        notes.push("Шторы реализованы через двухканальное реле в режиме roller-shutter.");
      } else {
        gaps.push(`Шторы (${s.curtainPoints}): нет драйвера в линейке`);
      }
    }
  }

  // ── Отопление (зоны) ─────────────────────────────────────────
  if (s.heatingZones > 0) {
    const trv = pickDevice(catalog, vendor, "thermostat");
    if (trv) {
      add(items, trv, s.heatingZones, `отопление: ${s.heatingZones} зон`);
    } else {
      // фолбэк: датчик температуры + реле на котёл/насос
      const th = pickDevice(catalog, vendor, "temperature_humidity");
      const relay = pickDevice(catalog, vendor, "relay");
      if (th && relay) {
        add(items, th, s.heatingZones, `датчик T° для управления отоплением`);
        add(items, relay, unitsNeeded(s.heatingZones, relay.channels),
            `реле для котла/насоса`);
        notes.push("Отопление: связка «датчик температуры + реле» через сценарий контроллера.");
      } else {
        gaps.push(`Отопление (${s.heatingZones} зон): нет термостатов и нечем заменить`);
      }
    }
  }

  // ── Тёплый пол ───────────────────────────────────────────────
  if (s.floorHeatingZones > 0) {
    const floor = pickDevice(catalog, vendor, "floor_temp_sensor");
    const thermo = pickDevice(catalog, vendor, "thermostat");
    if (floor && thermo) {
      add(items, thermo, s.floorHeatingZones, `тёплый пол: термостат на ${s.floorHeatingZones} зон`);
      add(items, floor, s.floorHeatingZones, `тёплый пол: датчик в стяжке`);
    } else if (thermo) {
      add(items, thermo, s.floorHeatingZones, `тёплый пол: ${s.floorHeatingZones} зон (термостат)`);
      notes.push("Для тёплого пола используется термостат вендора; внешний датчик пола подключается как у обычного терморегулятора.");
    } else {
      // фолбэк: реле + датчик температуры
      const relay = pickDevice(catalog, vendor, "relay");
      const th = pickDevice(catalog, vendor, "temperature_humidity");
      if (relay) {
        add(items, relay, unitsNeeded(s.floorHeatingZones, relay.channels), `реле под маты тёплого пола`);
        if (th) add(items, th, s.floorHeatingZones, `датчик температуры (косвенно)`);
        notes.push("Тёплый пол: реле + датчик температуры воздуха (без датчика стяжки).");
      } else {
        gaps.push(`Тёплый пол (${s.floorHeatingZones} зон): нет термостатов и реле`);
      }
    }
  }

  // ── Датчики движения ─────────────────────────────────────────
  if (s.motionPoints > 0) {
    const m = pickDevice(catalog, vendor, "motion_sensor");
    if (m) add(items, m, s.motionPoints, `датчики движения: ${s.motionPoints} шт`);
    else gaps.push(`Датчики движения (${s.motionPoints}): нет в линейке`);
  }

  // ── Антипротечка ─────────────────────────────────────────────
  if (s.leakPoints > 0) {
    const leak = pickDevice(catalog, vendor, "leak_sensor");
    const valve = pickDevice(catalog, vendor, "valve");
    if (leak) add(items, leak, s.leakPoints, `датчики протечки: ${s.leakPoints} шт`);
    else gaps.push(`Датчики протечки (${s.leakPoints}): нет в линейке`);
    if (valve) {
      add(items, valve, 2, `краны перекрытия (ХВС+ГВС)`);
    } else {
      // фолбэк: реле + внешний кран на 220В
      const relay = pickDevice(catalog, vendor, "relay");
      if (relay) {
        add(items, relay, 1, `реле для управления внешним краном на 220В`);
        notes.push("Кран перекрытия воды реализуется внешним 220В-приводом + реле — у вендора нет фирменного крана.");
      } else {
        gaps.push("Кран перекрытия воды: нет ни клапана, ни реле для внешнего");
      }
    }
  }

  // ── Охранка двери / окна ─────────────────────────────────────
  if (s.doorPoints > 0) {
    const dw = pickDevice(catalog, vendor, "door_sensor");
    if (dw) add(items, dw, s.doorPoints, `охранка: ${s.doorPoints} датчиков двери/окна`);
    else gaps.push(`Охранка (${s.doorPoints}): нет датчиков открытия`);
  }

  // ── T° / влажность ───────────────────────────────────────────
  if (s.thPoints > 0) {
    const th = pickDevice(catalog, vendor, "temperature_humidity");
    if (th) add(items, th, s.thPoints, `температура+влажность: ${s.thPoints} шт`);
    else gaps.push(`T°/влажность (${s.thPoints}): нет в линейке`);
  }

  // ── Мониторинг энергопотребления ─────────────────────────────
  if (s.energyMonitoring) {
    const meter = pickDevice(catalog, vendor, "energy_meter");
    if (meter) {
      add(items, meter, 1, `общий счётчик энергии на ввод`);
    } else {
      notes.push("Отдельного энергомонитора у вендора нет — учёт делается через PM-версии реле и розеток.");
    }
  }

  // ── Хаб / сервер ─────────────────────────────────────────────
  if (s.needHub) {
    const hub = pickDevice(catalog, vendor, "hub");
    if (hub) {
      add(items, hub, 1, `центральный сервер УД`);
    } else {
      notes.push("Отдельный хаб не нужен: устройства Shelly работают напрямую через Wi-Fi и облако/локальный API.");
    }
  } else if (vendor === "hitepro") {
    notes.push("Внимание: HitePRO — радиосистема 868 МГц, без сервера УД работает только локально (без удалённого доступа и сценариев).");
  }

  const totalDevices = items.reduce((acc, i) => acc + i.qty, 0);
  return { vendor, items, totalDevices, gaps, notes };
}
