import type { Catalog, Device, DeviceType, Vendor } from "./types";

/**
 * Очистка и обогащение каталога:
 *  • выбрасываем чужие бренды (LOQED, Ecowitt, LinkedGo, Cury, V-TAC и т.п.) из Shelly,
 *  • схлопываем варианты (пакеты, цвета, x2/x4, "List", "LR", цвета лицевых панелей),
 *  • пере-классифицируем тип на основе имени (BLU H&T → temperature_humidity, Wave Door/Window → door_sensor и т.д.),
 *  • вешаем meta-поля для нового движка правил.
 *
 *  HitePRO оставляем как есть — у него нормальная номенклатура.
 */

export type FormFactor =
  | "din"          // на DIN-рейку (Pro / Wave Pro)
  | "in_wall"      // в подрозетник (Plus / Wave / Gen3-4 / Mini)
  | "plug"         // умная розетка / удлинитель
  | "bulb"         // лампа
  | "panel"        // настенная панель управления (Wall Display)
  | "sensor"       // батарейный датчик (H&T, Door/Window, Motion, Flood, Smoke, Gas, TRV)
  | "remote"       // батарейная кнопка / пульт (Button, BLU RC, BLU WS4)
  | "addon"        // аксессуар (Add-on, Adapter, Clamp, Bypass)
  | "kit"          // комплект / стартер
  | "service"      // подписка
  | "other";

export type ProtocolFamily = "wifi_bt" | "zwave" | "ble" | "lora" | "other";
export type Generation = "gen1" | "plus" | "pro" | "gen3" | "gen4" | "wave" | "wave_pro" | "blu" | "unknown";

export interface DeviceMeta {
  form_factor: FormFactor;
  protocol_family: ProtocolFamily;
  generation: Generation;
  requires_neutral: boolean;     // true для классических реле, false для 1L/2L и батарейных
  is_blu: boolean;
  is_wave: boolean;
  has_pm: boolean;               // умеет измерять энергию (по имени или power_metering)
  panel_only: boolean;           // только настенная панель (Wall Display)
  // дополнительные функциональные подсказки
  use_cases: string[];           // тэги для поиска: "light","dimmer","cover","floor","heating","plug","th","door","motion","leak","gas","smoke","trv","panel"
}

export interface CleanDevice extends Device {
  meta: DeviceMeta;
}

export interface CleanCatalog extends Catalog {
  devices: CleanDevice[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Фильтр чужих брендов
// ─────────────────────────────────────────────────────────────────────────────

const FOREIGN_BRAND_PATTERNS: RegExp[] = [
  /\bLOQED\b/i,
  /\bEcowitt\b/i,
  /\bLinkedGo\b/i,
  /\bFrankEver\b/i,
  /\bOgemray\b/i,
  /\bV-TAC\b/i,
  /\bZendure\b/i,
  /\bNeo\b/i,
  /\bLightSolutions\b/i,
  /\bCury\b/i,
  /\bDB2024\b/i,
  /\bRexant\b/i,
];

function isForeign(title: string): boolean {
  if (!/^Shelly\b/i.test(title.trim())) return true;
  return FOREIGN_BRAND_PATTERNS.some((re) => re.test(title));
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Канонизация имени для дедупликации
// ─────────────────────────────────────────────────────────────────────────────

const VARIANT_RX =
  /\s*(?:\b(?:List|Single\s*pack|Starter\s*Kit|2-pack|3-pack|4-pack|5-pack|10-pack|x1|x2|x3|x4|x5|x6|x10|LR|ANZ|EU|US|UK|EUR|IT|White|Black|Beige|Brown|Grey|Gray|Gold|Silver|Ivory|Mocha|Matte|Stainless\s*Steel|ZB)\b\s*)+/gi;

function canonicalKey(title: string): string {
  return title
    .replace(/\s+/g, " ")
    .replace(VARIANT_RX, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Определение meta по названию
// ─────────────────────────────────────────────────────────────────────────────

function detectGen(t: string): Generation {
  const s = t.toLowerCase();
  if (/\bblu\b/.test(s)) return "blu";
  if (/\bwave\s+pro\b/.test(s)) return "wave_pro";
  if (/\bwave\b/.test(s)) return "wave";
  if (/\bgen4\b/.test(s)) return "gen4";
  if (/\bgen3\b/.test(s)) return "gen3";
  if (/\bpro\b/.test(s)) return "pro";
  if (/\bplus\b/.test(s)) return "plus";
  if (/\b(1pm|2pm|2\.5|dimmer2|rgbw2|i3|i4|em|3em|trv|h&t|flood|gas|button|motion|uni|duo|vintage|plug)\b/.test(s)) return "gen1";
  return "unknown";
}

function detectProtocol(gen: Generation): ProtocolFamily {
  if (gen === "wave" || gen === "wave_pro") return "zwave";
  if (gen === "blu") return "ble";
  return "wifi_bt";
}

function detectFormFactor(t: string, type: DeviceType): FormFactor {
  const s = t.toLowerCase();
  if (/wall\s*display/.test(s)) return "panel";
  if (/(add-?on|addon|adapter|clamp|transf|bypass|busch-?jaeger|gira|merten|legrand)/.test(s)) return "addon";
  if (/(starter\s*kit|bundle|комплект|kit|pack)/.test(s) && !/single\s*pack/.test(s)) {
    // дальше уточним по типу — настоящие комплекты редкие
  }
  if (/\bcloud\b|premium b2b|service/.test(s)) return "service";
  if (/(bulb|vintage|duo|gu10|e27|a60|st64|g125)/.test(s)) return "bulb";
  if (/(plug|power\s*strip|outdoor\s*plug)/.test(s)) return "plug";
  // батарейные сенсоры / TRV / кнопки
  if (
    /(h&t|flood|smoke|gas|door\/?window|motion|presence|distance|trv|button)/.test(s) ||
    type === "temperature_humidity" || type === "leak_sensor" || type === "door_sensor" ||
    type === "motion_sensor"
  ) {
    if (/(button|wall\s*switch\s*4|rc\s*button|i4\s*dc|i3|ws4)/.test(s)) return "remote";
    return "sensor";
  }
  if (/(i4|i3|wall\s*switch)/.test(s)) return "remote";
  if (/\bpro\b/.test(s)) return "din";
  // в подрозетник по умолчанию
  return "in_wall";
}

function detectNeutral(t: string, ff: FormFactor): boolean {
  const s = t.toLowerCase();
  if (/\b(1l|2l)\b/.test(s)) return false;
  if (ff === "sensor" || ff === "remote" || ff === "addon" || ff === "service" || ff === "kit") return false;
  return true;
}

function detectPm(t: string, base: boolean): boolean {
  if (base) return true;
  return /\b(pm|em|3em)\b/i.test(t);
}

function detectUseCases(t: string, type: DeviceType): string[] {
  const s = t.toLowerCase();
  const tags = new Set<string>();
  if (type === "relay" || /\b(1|1pm|1l|2pm|2l|3|4pm|plus 1|plus 2|wave 1|wave 2)\b/.test(s)) {
    tags.add("light");
    if (/\b(2pm|2 ?pm|dual cover|shutter)\b/.test(s)) tags.add("cover");
    if (/\b(1pm|pm)\b/.test(s)) tags.add("floor");
  }
  if (type === "dimmer" || /\b(dimmer|dali|0\/?1-?10v)\b/.test(s)) {
    tags.add("dimmer");
    if (/\b(0\/?1-?10v|dali)\b/.test(s)) tags.add("dimmer_pro");
  }
  if (type === "rgbw" || /\b(rgbw|rgbww)\b/.test(s)) tags.add("rgbw");
  if (type === "drive" || /\b(shutter|cover|drive)\b/.test(s)) tags.add("cover");
  if (type === "smart_plug" || /\b(plug|power strip)\b/.test(s)) tags.add("plug");
  if (type === "temperature_humidity" || /\bh&t\b/.test(s)) tags.add("th");
  if (type === "door_sensor" || /door\/?window/.test(s)) tags.add("door");
  if (type === "motion_sensor" || /\b(motion|presence)\b/.test(s)) tags.add("motion");
  if (type === "leak_sensor" || /\bflood\b/.test(s)) tags.add("leak");
  if (/\bgas\b/.test(s)) tags.add("gas");
  if (/\bsmoke\b/.test(s)) tags.add("smoke");
  if (/\btrv\b/.test(s)) { tags.add("heating"); tags.add("trv"); }
  if (/wall\s*display/.test(s)) tags.add("panel");
  if (/\b(em|3em|energy)\b/i.test(s)) tags.add("energy");
  return [...tags];
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Пере-классификация типа (базовый каталог иногда ставит "other")
// ─────────────────────────────────────────────────────────────────────────────

function reclassifyType(t: string, current: DeviceType): DeviceType {
  const s = t.toLowerCase();
  if (current && current !== "other") return current;
  if (/h&t/.test(s)) return "temperature_humidity";
  if (/door\/?window/.test(s)) return "door_sensor";
  if (/\bflood\b/.test(s)) return "leak_sensor";
  if (/\b(motion|presence)\b/.test(s)) return "motion_sensor";
  if (/\btrv\b/.test(s)) return "thermostat";
  if (/\b(plug|power strip)\b/.test(s)) return "smart_plug";
  if (/\b(em|3em)\b/.test(s)) return "energy_meter";
  if (/wall\s*display/.test(s)) return "wall_switch";
  if (/\b(button|i4|i3|ws4|wall switch)\b/.test(s)) return "wall_switch";
  if (/\b(bulb|duo|vintage|gu10)\b/.test(s)) return "bulb";
  if (/\b(rgbw|rgbww)\b/.test(s)) return "rgbw";
  if (/\bdimmer\b/.test(s)) return "dimmer";
  if (/(shutter|cover)/.test(s)) return "drive";
  if (/(add-?on|adapter|clamp|bypass|lora)/.test(s)) return "other";
  return current ?? "other";
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Главная функция
// ─────────────────────────────────────────────────────────────────────────────

function enrich(d: Device): CleanDevice {
  const newType = reclassifyType(d.title, d.type);
  const ff = detectFormFactor(d.title, newType);
  const gen = detectGen(d.title);
  const meta: DeviceMeta = {
    form_factor: ff,
    protocol_family: detectProtocol(gen),
    generation: gen,
    requires_neutral: detectNeutral(d.title, ff),
    is_blu: gen === "blu",
    is_wave: gen === "wave" || gen === "wave_pro",
    has_pm: detectPm(d.title, !!d.power_metering),
    panel_only: ff === "panel",
    use_cases: detectUseCases(d.title, newType),
  };
  return { ...d, type: newType, meta };
}

// При выборе представителя группы предпочитаем «голую» версию (без List/pack/x*)
function variantScore(title: string): number {
  let score = 0;
  if (/\b(List|2-pack|3-pack|4-pack|5-pack|10-pack|x[2-9]|LR)\b/i.test(title)) score += 5;
  if (/\b(White|Black|Beige|Brown|Grey|Gray|Gold|Silver|Ivory|Mocha|Matte|Stainless)\b/i.test(title)) score += 2;
  if (/\bANZ\b/i.test(title)) score += 3;
  if (/(Bundle|Pack|Kit)/i.test(title)) score += 4;
  // короче → лучше
  score += Math.floor(title.length / 20);
  return score;
}

export function cleanShellyCatalog(input: Catalog): CleanCatalog {
  const hitepro = input.devices.filter((d) => d.vendor === "hitepro");

  // 1. Фильтр Shelly
  const shellyRaw = input.devices.filter(
    (d) => d.vendor === "shelly" && !isForeign(d.title)
  );

  // 2. Группировка по канонизированному ключу
  const groups = new Map<string, Device[]>();
  for (const d of shellyRaw) {
    const key = canonicalKey(d.title);
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }

  // 3. Из каждой группы выбираем «лучший» экземпляр и обогащаем
  const shellyClean: CleanDevice[] = [];
  for (const [, list] of groups) {
    list.sort((a, b) => {
      const sa = variantScore(a.title), sb = variantScore(b.title);
      if (sa !== sb) return sa - sb;
      // приоритет — наличие картинки
      const ia = a.image ? 0 : 1, ib = b.image ? 0 : 1;
      if (ia !== ib) return ia - ib;
      return a.title.length - b.title.length;
    });
    shellyClean.push(enrich(list[0]));
  }

  // 4. HitePRO просто оборачиваем с пустой meta (правила HitePRO остаются прежними)
  const hiteproClean: CleanDevice[] = hitepro.map((d) => ({
    ...d,
    meta: {
      form_factor: "din",
      protocol_family: "other",
      generation: "unknown",
      requires_neutral: true,
      is_blu: false,
      is_wave: false,
      has_pm: !!d.power_metering,
      panel_only: false,
      use_cases: [],
    },
  }));

  const devices = [...shellyClean, ...hiteproClean];

  // Пересчитываем агрегаты
  const totals: Record<Vendor, number> = { shelly: shellyClean.length, hitepro: hiteproClean.length };
  const by_type: Record<Vendor, Record<DeviceType, number>> = {
    shelly: {} as any, hitepro: {} as any,
  };
  for (const d of devices) {
    by_type[d.vendor][d.type] = (by_type[d.vendor][d.type] || 0) + 1;
  }

  return { ...input, totals, by_type, devices };
}
