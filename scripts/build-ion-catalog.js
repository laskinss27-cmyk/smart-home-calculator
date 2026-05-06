#!/usr/bin/env node
/**
 * build-ion-catalog.js
 * Converts i-on.pro CSV export into a JSON catalog for the smart home calculator.
 */

const fs = require('fs');
const path = require('path');

// --- Paths ---
const CSV_PATH = path.join('C:', 'Users', 'LapTOP', 'Downloads', 'Telegram Desktop', 'store-5103503-202605061540.csv');
const OUT_PATH = path.join('C:', 'Users', 'LapTOP', 'Documents', 'smart-home-calculator', 'src', 'data', 'ion_catalog.json');

// --- Mappings ---
const CATEGORY_MAP = {
  'Релейный переключатель': 'relay',
  'Управление шторами': 'shutter',
  'Диммерный переключатель': 'dimmer',
  'Счетчик энергии': 'energy_meter',
  'Датчики и термостаты': 'sensor',
  'Аксессуары': 'accessory',
  'Умный контроллер': 'controller',
  'Умная розетка': 'smart_plug',
  'Кнопка': 'button',
  'Лампочки': 'bulb',
  'Дисплей': 'display',
};

const INSTALL_MAP = {
  'В подрозетник': 'in_wall',
  'DIN-рейка': 'din',
  'Настенный': 'wall',
  'Беспроводной': 'wireless',
  'Модуль-надстройка': 'addon',
  'USB': 'usb',
};
const INSTALL_SKIP = new Set(['Однофазная', 'Двухфазная', 'Трехфазная']);

const TECH_MAP = {
  'Wi-Fi': 'wifi',
  'Bluetooth': 'bluetooth',
  'Z-Wave': 'zwave',
  'LAN': 'lan',
  'KNX/IP': 'knx',
  'ZigBee': 'zigbee',
  'Matter': 'matter',
  'LoRa': 'lora',
  'DALI': 'dali',
};
const TECH_SKIP = new Set(['Проводной', 'MQTT', 'HTTP', 'WebSocket', 'Modbus TCP']);

const PRODUCT_TYPE_MAP = {
  'Релейный переключатель': 'relay',
  'Релейный переключатель (Z-Wave)': 'relay',
  'Счётчик энергии': 'energy_meter',
  'Диммерный переключатель': 'dimmer',
  'Релейный диммер': 'dimmer',
  'Диммер 0-10 V': 'dimmer',
  'DALI-диммер': 'dimmer',
  'Контроллер штор/роллет': 'shutter',
  'Двойной сервопривод': 'shutter',
  'RGBW контроллер': 'rgbw',
  'LED-драйвер': 'rgbw',
  'Wi-Fi LED-диммер': 'rgbw',
  'Умная розетка': 'smart_plug',
  'Уличная умная розетка': 'smart_plug',
  'Датчики и термостаты': 'sensor',
  'Умный термостат радиатора': 'trv',
  'Контроллер цифровых входов': 'input',
  'Сценарный контроллер': 'input',
  'BLE-кнопка': 'button',
  'Кнопка': 'button',
  'Пульт управления': 'button',
  'Дисплей': 'display',
  'Аксессуары': 'accessory',
  'Аксессуарыы': 'accessory',
  'Bypass для низкой нагрузки': 'bypass',
  'Интерфейс расширения датчиков': 'addon',
  'LoRa-расширитель': 'lora',
  'Bluetooth-Gateway': 'gateway',
  'Контроллер тёплого пола/отопления': 'floor_heating',
  'Контроллер HVAC': 'hvac',
  'Ethernet-коммутатор': 'switch',
  'Умная лампа': 'bulb',
  'Светодиодная лампа (WW/CW)': 'bulb',
  'LED-лампа': 'bulb',
  'Лампочки': 'bulb',
  'Умная светодиодная лампа': 'bulb',
  'Измерительный CT-датчик для счётчиков Shelly': 'clamp',
  'Защитный RC-фильтр для индуктивных нагрузок': 'rc_snubber',
};

// Brands / categories to skip entirely
const SKIP_BRANDS = ['FrankEver', 'Frank Ever', 'LOQED', 'Ogemray', 'LinkedGo'];
const SKIP_CATEGORY = 'Готовые решения';

// --- CSV parser (handles quoted semicolon-delimited fields) ---
function parseCSVLine(line) {
  const fields = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ';' && !inQuotes) {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

// --- Slugify ---
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/&amp;/g, '-')
    .replace(/&/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// --- Channel detection ---
function parseChannels(title, category, productTypes) {
  const t = title.toLowerCase();

  // i4 variants are input controllers
  if (/\bi4\b/.test(t)) return 0;

  // Pro 4PM
  if (/pro\s+4pm/i.test(title)) return 4;
  // Pro 3 (but not Pro 3EM)
  if (/pro\s+3(?!\s*em)(?:\s|$)/i.test(title)) return 3;
  // Pro 2PM / Pro 2 / 2PM / 2.5 / 2L
  if (/pro\s+2(pm)?(?:\s|$)/i.test(title)) return 2;
  if (/\b2pm\b/i.test(title)) return 2;
  if (/\b2\.5\b/.test(title)) return 2;
  if (/\b2l\b/i.test(title)) return 2;
  // Pro Dimmer 2PM
  if (/pro\s+dimmer\s+2pm/i.test(title)) return 2;
  // Dual Cover/Shutter
  if (/dual\s+cover/i.test(title)) return 2;

  if (category === 'relay') return 1;
  if (category === 'dimmer') return 1;
  if (category === 'shutter') return 1;

  // Smart plugs, buttons, sensors, displays, etc.
  return 0;
}

// --- Power metering detection ---
function hasPowerMetering(title, productTypes) {
  if (productTypes.includes('energy_meter')) return true;
  if (/\bPM\b/i.test(title) || /\bEM\b/i.test(title)) return true;
  return false;
}

// --- Should skip this title (Wall frame / Wall switch accessories) ---
function isWallAccessory(title) {
  return /\bwall\s+frame\b/i.test(title) || /\bwall\s+switch\b/i.test(title);
}

// --- Main ---
function main() {
  const csv = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = csv.split('\n').filter(l => l.trim().length > 0);

  // Skip header
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    rows.push(parseCSVLine(lines[i]));
  }

  // Build UID -> row index map & collect parent UIDs
  const uidMap = {};        // uid -> row
  const variants = {};      // parentUid -> [row, ...]
  const parentRows = [];    // rows that are parent products (have category)

  for (const row of rows) {
    const uid = (row[0] || '').trim();
    const category = (row[4] || '').trim();
    const parentUid = (row[15] || '').trim();

    if (uid) uidMap[uid] = row;

    if (parentUid) {
      // This is a color variant
      if (!variants[parentUid]) variants[parentUid] = [];
      variants[parentUid].push(row);
    } else {
      // This is a standalone product or a parent
      parentRows.push(row);
    }
  }

  const devices = [];
  let skipped = { brand: 0, category: 0, wallAccessory: 0, noPrice: 0, zeroPrice: 0 };

  for (const row of parentRows) {
    const categoryRaw = (row[4] || '').trim();
    const title = (row[5] || '').trim();
    const imageField = (row[8] || '').trim();
    let priceStr = (row[9] || '').trim();
    const techRaw = (row[16] || '').trim();
    const installRaw = (row[17] || '').trim();
    const prodTypeRaw = (row[21] || '').trim();
    const uid = (row[0] || '').trim();

    // Skip "Готовые решения"
    if (categoryRaw.includes(SKIP_CATEGORY)) {
      skipped.category++;
      continue;
    }

    // Skip non-Shelly brands
    if (SKIP_BRANDS.some(b => title.includes(b) || (row[1] || '').includes(b))) {
      skipped.brand++;
      continue;
    }

    // Skip Wall frame / Wall switch accessories
    if (isWallAccessory(title)) {
      skipped.wallAccessory++;
      continue;
    }

    // Handle price: if parent has no price, use first variant's price
    let price = parseFloat(priceStr);
    if ((!priceStr || isNaN(price) || price === 0) && variants[uid]) {
      for (const v of variants[uid]) {
        const vp = parseFloat((v[9] || '').trim());
        if (!isNaN(vp) && vp > 0) {
          price = vp;
          break;
        }
      }
    }

    if (isNaN(price) || price <= 0) {
      skipped.noPrice++;
      continue;
    }

    // Parse category (first one if semicolon-separated)
    const categories = categoryRaw.split(';').map(s => s.trim()).filter(Boolean);
    let category = 'accessory'; // default
    for (const cat of categories) {
      if (CATEGORY_MAP[cat]) {
        category = CATEGORY_MAP[cat];
        break;
      }
    }
    // DIN bracket accessories with empty category
    if (!categoryRaw && !prodTypeRaw) {
      category = 'accessory';
    }

    // Parse install types
    const installParts = installRaw.split(';').map(s => s.trim()).filter(Boolean);
    const install = [];
    for (const part of installParts) {
      if (INSTALL_SKIP.has(part)) continue;
      // Handle partial matches (e.g. "DIN-рейка" might be truncated)
      let mapped = INSTALL_MAP[part];
      if (!mapped) {
        // Try prefix match for truncated values
        for (const [key, val] of Object.entries(INSTALL_MAP)) {
          if (key.startsWith(part) || part.startsWith(key)) {
            mapped = val;
            break;
          }
        }
      }
      if (mapped && !install.includes(mapped)) install.push(mapped);
    }

    // Parse tech
    const techParts = techRaw.split(';').map(s => s.trim()).filter(Boolean);
    const tech = [];
    for (const part of techParts) {
      if (TECH_SKIP.has(part)) continue;
      const mapped = TECH_MAP[part];
      if (mapped && !tech.includes(mapped)) tech.push(mapped);
    }

    // Parse product_types
    const ptParts = prodTypeRaw.split(';').map(s => s.trim()).filter(Boolean);
    const productTypes = [];
    for (const pt of ptParts) {
      const mapped = PRODUCT_TYPE_MAP[pt];
      if (mapped) {
        if (!productTypes.includes(mapped)) productTypes.push(mapped);
      }
      // Skip unmapped types silently
    }

    // Determine type (primary product type, use category as fallback)
    let type = category;
    if (productTypes.length > 0) {
      // Use first product type as the primary type
      type = productTypes[0];
    }

    // For i4 input controllers, override type
    if (/\bi4\b/i.test(title)) {
      type = 'input';
    }

    // Channels
    const channels = parseChannels(title, category, productTypes);

    // Power metering
    const powerMetering = hasPowerMetering(title, productTypes);

    // Image (first URL)
    const image = imageField.split(/\s+/)[0] || '';

    // ID
    const id = 'ion:' + slugify(title);

    // Vendor
    const vendor = 'shelly';

    devices.push({
      id,
      title,
      vendor,
      category,
      type,
      install,
      tech,
      channels,
      power_metering: powerMetering,
      price: Math.round(price),
      image,
      product_types: productTypes,
    });
  }

  // Also handle standalone rows without category that are NOT color variants
  // (e.g. DIN brackets with no parent UID and no category)
  // These were already handled in parentRows since parentUid is empty

  const output = {
    source: 'i-on.pro',
    updated: '2026-05-06',
    devices,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2), 'utf8');

  console.log('=== i-on.pro Catalog Build ===');
  console.log(`Total CSV rows (excl. header): ${rows.length}`);
  console.log(`Devices created: ${devices.length}`);
  console.log(`Skipped - non-Shelly brand: ${skipped.brand}`);
  console.log(`Skipped - Готовые решения: ${skipped.category}`);
  console.log(`Skipped - Wall frame/switch: ${skipped.wallAccessory}`);
  console.log(`Skipped - no/zero price: ${skipped.noPrice}`);
  console.log(`Color variants merged: ${Object.values(variants).reduce((s, v) => s + v.length, 0)}`);
  console.log(`Output: ${OUT_PATH}`);

  // Print categories summary
  const catCounts = {};
  for (const d of devices) {
    catCounts[d.category] = (catCounts[d.category] || 0) + 1;
  }
  console.log('\nBy category:');
  for (const [cat, count] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }
}

main();
