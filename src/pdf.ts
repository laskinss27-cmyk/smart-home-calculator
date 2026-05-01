/**
 * Генератор HTML для PDF-КП в стиле ctv-document-suite.
 * Один вендор на документ. Минимальные принудительные разрывы — только перед
 * заголовком "Список оборудования", чтобы обложка с параметрами оставалась цельной;
 * сами карточки устройств идут потоком без break-inside, чтобы PDF не пузырился.
 */
import type { Recommendation, Scenario } from "./types";
import type { PriceMap } from "./api";
import { tAttrKey, tAttrValue } from "./i18n";

const RUB = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₽";

const C = {
  DARK: "#1A2B4A",
  DARK2: "#1E3A6E",
  BLUE: "#2563EB",
  LBLUE: "#EFF6FF",
  GOLD: "#F59E0B",
  AMBER: "#FFFBEB",
  GRAY: "#64748B",
  LGRAY: "#F8FAFC",
  BORDER: "#E2E8F0",
  TEXT: "#1E293B",
};

const VENDOR_LABEL: Record<string, string> = {
  shelly: "Shelly",
  hitepro: "HitePRO",
};

const TYPE_LABEL: Record<string, string> = {
  relay: "Реле",
  dimmer: "Диммер",
  rgbw: "RGBW-контроллер",
  drive: "Привод штор",
  smart_plug: "Умная розетка",
  motion_sensor: "Датчик движения",
  leak_sensor: "Датчик протечки",
  valve: "Кран перекрытия",
  door_sensor: "Датчик двери/окна",
  temperature_humidity: "Датчик T° / влажности",
  floor_temp_sensor: "Датчик пола",
  thermostat: "Термостат",
  energy_meter: "Счётчик энергии",
  wall_switch: "Настенный выключатель",
  hub: "Сервер УД",
  kit: "Готовый комплект",
  bulb: "Умная лампа",
  other: "Прочее",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function scenarioRows(s: Scenario): string {
  const items: [string, number | string][] = [
    ["Свет (вкл/выкл)", s.lightPoints],
    ["Диммируемый свет", s.dimmerPoints],
    ["RGBW-ленты", s.rgbwPoints],
    ["Розетки", s.socketPoints],
    ["Шторы", s.curtainPoints],
    ["Отопление (зон)", s.heatingZones],
    ["Тёплый пол (зон)", s.floorHeatingZones],
    ["Датчики движения", s.motionPoints],
    ["Датчики протечки", s.leakPoints],
    ["Охранка (двери/окна)", s.doorPoints],
    ["T° / влажность", s.thPoints],
    ["Энергомониторинг", s.energyMonitoring ? "да" : "нет"],
    ["Сервер УД", s.needHub ? "да" : "нет"],
  ].filter((r) => r[1] !== 0 && r[1] !== "нет");

  // Двухколоночная таблица параметров — компактнее.
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const left = items[i];
    const right = items[i + 1];
    rows.push(
      `<tr>
        <td class="k">${esc(left[0])}</td>
        <td class="v">${esc(String(left[1]))}</td>
        ${right
          ? `<td class="k">${esc(right[0])}</td>
             <td class="v">${esc(String(right[1]))}</td>`
          : `<td></td><td></td>`}
      </tr>`
    );
  }
  return rows.join("");
}

function deviceRow(
  it: Recommendation["items"][number],
  idx: number,
  prices: PriceMap
): string {
  const { device, qty, reason } = it;
  const attrs = Object.entries(device.raw_attributes || {}).slice(0, 10);

  const attrPairs = attrs
    .map(
      ([k, v]) =>
        `<span class="attr"><span class="ak">${esc(tAttrKey(k))}:</span> ${esc(tAttrValue(String(v)))}</span>`
    )
    .join("");

  const price = prices[device.id];
  const lineSum = price ? price * qty : 0;
  const priceCell = price
    ? `<td class="price">${RUB(price)}</td><td class="sum">${RUB(lineSum)}</td>`
    : `<td class="price">—</td><td class="sum">—</td>`;

  return `
  <tr class="device-row">
    <td class="num">${idx + 1}</td>
    <td class="name">
      <div class="title">${esc(device.title)}</div>
      <div class="sub">${esc(TYPE_LABEL[device.type] ?? device.type)}${device.channels ? ` · ${device.channels} кан.` : ""}${device.power_metering ? " · с измерением мощности" : ""}${device.protocol ? ` · ${esc(device.protocol)}` : ""}</div>
      <div class="reason">${esc(reason)}</div>
      ${attrPairs ? `<div class="attrs">${attrPairs}</div>` : ""}
    </td>
    <td class="qty">×${qty}</td>
    ${priceCell}
  </tr>`;
}

export function buildPdfHtml(
  scenario: Scenario,
  rec: Recommendation,
  prices: PriceMap = {}
): string {
  const date = new Date().toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const vname = VENDOR_LABEL[rec.vendor] ?? rec.vendor;

  const rows = rec.items.map((it, i) => deviceRow(it, i, prices)).join("");

  const total = rec.items.reduce((s, it) => {
    const p = prices[it.device.id];
    return s + (p ? p * it.qty : 0);
  }, 0);
  const pricedCount = rec.items.filter((it) => prices[it.device.id]).length;
  const showTotal = pricedCount > 0;
  const totalRow = showTotal
    ? `<tr class="total-row">
        <td colspan="4" class="total-lbl">
          ИТОГО${pricedCount < rec.items.length ? ` (заполнено ${pricedCount} из ${rec.items.length})` : ""}
        </td>
        <td class="total-val">${RUB(total)}</td>
      </tr>`
    : "";

  const gapsHtml = rec.gaps.length
    ? `<div class="gaps">
        <div class="gaps-title">Не покрыто оборудованием ${esc(vname)}:</div>
        <ul>${rec.gaps.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
      </div>`
    : "";

  const notesHtml = rec.notes.length
    ? `<div class="notes">
        <div class="notes-title">Пояснения по подбору</div>
        ${rec.notes.map((n) => `<div class="note">${esc(n)}</div>`).join("")}
      </div>`
    : "";

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>КП — ${esc(vname)}</title>
<style>
  @page { size: A4; margin: 12mm 11mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Arial, sans-serif;
    color: ${C.TEXT};
    margin: 0;
    font-size: 10.5px;
    line-height: 1.4;
  }
  /* ── Обложка ─────────────────────────────────────────── */
  .cover {
    background: ${C.DARK};
    color: #fff;
    padding: 22px 22px 18px;
    border-radius: 8px;
    margin-bottom: 14px;
    position: relative;
    overflow: hidden;
  }
  .cover::before {
    content: ""; position: absolute; top: 0; left: 0; right: 0; height: 4px;
    background: ${C.GOLD};
  }
  .cover::after {
    content: ""; position: absolute; bottom: 0; left: 0; right: 0; height: 3px;
    background: ${C.BLUE};
  }
  .cover h1 { margin: 0 0 4px; font-size: 22px; font-weight: 700; letter-spacing: 0.4px; }
  .cover .vendor-tag {
    display: inline-block; background: ${C.GOLD}; color: ${C.DARK};
    padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 12px;
    margin: 8px 0 6px;
  }
  .cover .sub { color: #94A3B8; font-size: 10.5px; }
  .cover .stats {
    display: flex; gap: 14px; margin-top: 12px;
  }
  .cover .stat {
    background: rgba(255,255,255,0.06); padding: 6px 12px; border-radius: 5px;
    border-left: 3px solid ${C.GOLD};
  }
  .cover .stat .num { font-size: 16px; font-weight: 700; color: ${C.GOLD}; }
  .cover .stat .lbl { font-size: 9px; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.3px; }
  .cover .date { color: #94A3B8; font-size: 10px; margin-top: 10px; }

  /* ── Параметры объекта ─────────────────────────────────── */
  h2 {
    color: ${C.DARK}; font-size: 13px; margin: 14px 0 6px;
    padding-bottom: 3px; border-bottom: 2px solid ${C.GOLD};
    display: inline-block;
  }
  table.params {
    width: 100%; border-collapse: collapse;
    border: 1px solid ${C.BORDER}; border-radius: 5px; overflow: hidden;
    margin-bottom: 12px; font-size: 10px;
  }
  table.params td { padding: 5px 9px; border-bottom: 1px solid ${C.BORDER}; }
  table.params td.k { color: ${C.GRAY}; width: 22%; }
  table.params td.v { color: ${C.TEXT}; font-weight: 600; width: 28%; }
  table.params tr:last-child td { border-bottom: 0; }

  /* ── Список оборудования ──────────────────────────────── */
  table.devices {
    width: 100%; border-collapse: collapse; font-size: 10px;
    border: 1px solid ${C.BORDER}; border-radius: 5px; overflow: hidden;
  }
  table.devices thead {
    background: ${C.DARK}; color: #fff;
  }
  table.devices thead th {
    padding: 7px 9px; text-align: left; font-size: 10px;
    font-weight: 600; letter-spacing: 0.2px;
  }
  table.devices thead th.right { text-align: right; }
  /* Чередующийся фон + лёгкие границы вместо тяжёлых карточек,
     чтобы строки могли свободно переноситься между страницами. */
  table.devices tbody tr.device-row {
    border-bottom: 1px solid ${C.BORDER};
  }
  table.devices tbody tr.device-row:nth-child(even) td { background: ${C.LGRAY}; }
  table.devices td.num {
    width: 28px; text-align: center; color: ${C.GRAY};
    vertical-align: top; padding: 8px 6px; font-weight: 600;
  }
  table.devices td.name { padding: 8px 10px; vertical-align: top; }
  table.devices td.name .title { font-weight: 600; color: ${C.DARK}; font-size: 10.5px; }
  table.devices td.name .sub {
    color: ${C.GRAY}; font-size: 9.5px; margin-top: 2px;
  }
  table.devices td.name .reason {
    color: ${C.BLUE}; font-size: 9.5px; font-style: italic; margin-top: 3px;
  }
  table.devices td.name .attrs {
    margin-top: 4px; line-height: 1.55; color: ${C.TEXT}; font-size: 9px;
  }
  table.devices td.name .attr {
    display: inline-block; margin-right: 10px;
  }
  table.devices td.name .ak { color: ${C.GRAY}; }
  table.devices td.qty {
    width: 50px; text-align: right; padding: 8px 12px; vertical-align: top;
    font-weight: 700; font-size: 12px; color: ${C.DARK};
  }
  table.devices td.price, table.devices td.sum {
    text-align: right; padding: 8px 10px; vertical-align: top;
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  table.devices td.price { color: ${C.GRAY}; width: 70px; font-size: 10px; }
  table.devices td.sum { color: ${C.DARK}; width: 80px; font-size: 10.5px; font-weight: 600; }
  table.devices tr.total-row td {
    background: ${C.DARK} !important; color: #fff;
    padding: 10px 12px; font-weight: 700;
  }
  table.devices tr.total-row td.total-lbl {
    text-align: right; font-size: 11.5px; letter-spacing: 0.4px;
  }
  table.devices tr.total-row td.total-val {
    text-align: right; font-size: 14px; color: ${C.GOLD};
    font-variant-numeric: tabular-nums;
  }

  /* ── Блоки "Не покрыто" / "Пояснения" ────────────────── */
  .gaps {
    margin-top: 12px; padding: 9px 12px;
    background: #FEF2F2; border-left: 3px solid #DC2626; border-radius: 4px;
  }
  .gaps-title { font-weight: 700; color: #991B1B; font-size: 10.5px; margin-bottom: 3px; }
  .gaps ul { margin: 0; padding-left: 18px; color: #7F1D1D; font-size: 10px; }
  .notes { margin-top: 10px; }
  .notes-title { font-weight: 700; color: ${C.DARK}; font-size: 10.5px; margin-bottom: 4px; }
  .note {
    padding: 5px 10px; background: ${C.AMBER}; border-left: 3px solid ${C.GOLD};
    border-radius: 4px; color: ${C.TEXT}; font-size: 10px; margin-bottom: 3px;
  }

  .footer {
    margin-top: 18px; padding-top: 8px; border-top: 1px solid ${C.BORDER};
    color: ${C.GRAY}; font-size: 8.5px; text-align: center;
  }
</style>
</head>
<body>
  <div class="cover">
    <h1>КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ</h1>
    <div class="vendor-tag">${esc(vname)}</div>
    <div class="sub">Подбор оборудования умного дома под параметры объекта</div>
    <div class="stats">
      <div class="stat">
        <div class="num">${rec.items.length}</div>
        <div class="lbl">позиций</div>
      </div>
      <div class="stat">
        <div class="num">${rec.totalDevices}</div>
        <div class="lbl">устройств</div>
      </div>
    </div>
    <div class="date">${esc(date)}</div>
  </div>

  <h2>Параметры объекта</h2>
  <table class="params"><tbody>${scenarioRows(scenario)}</tbody></table>

  <h2>Список оборудования</h2>
  <table class="devices">
    <thead>
      <tr>
        <th style="width:28px">№</th>
        <th>Наименование и характеристики</th>
        <th class="right" style="width:50px">Кол.</th>
        <th class="right" style="width:70px">Цена</th>
        <th class="right" style="width:80px">Сумма</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="5" style="padding:14px;text-align:center;color:${C.GRAY}">Нет позиций по выбранному сценарию.</td></tr>`}${totalRow}</tbody>
  </table>

  ${gapsHtml}
  ${notesHtml}

  <div class="footer">
    Подбор автоматический по каталогу ${esc(vname)}. Окончательная конфигурация уточняется проектировщиком.
  </div>
</body>
</html>`;
}
