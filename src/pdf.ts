/**
 * Генератор HTML-разметки для PDF в стиле ctv-document-suite.
 * Палитра: тёмно-синий заголовок, золотая полоса, синие акценты,
 * белые таблицы с тонкими бордерами #E2E8F0.
 *
 * HTML рендерится в скрытом BrowserWindow и печатается в PDF
 * через webContents.printToPDF (Electron). Кириллица поддерживается
 * системным шрифтом — внешние шрифты не нужны.
 */
import type { Recommendation, Scenario } from "./types";
import { tAttrKey, tAttrValue } from "./i18n";

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
  drive: "Привод/драйвер штор",
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
  hub: "Сервер УД / хаб",
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

  return items
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:6px 10px;color:${C.GRAY};border-bottom:1px solid ${C.BORDER};">${esc(k)}</td>
        <td style="padding:6px 10px;color:${C.TEXT};font-weight:600;border-bottom:1px solid ${C.BORDER};text-align:right;">${esc(String(v))}</td>
      </tr>`
    )
    .join("");
}

function vendorBlock(rec: Recommendation): string {
  const vname = VENDOR_LABEL[rec.vendor] ?? rec.vendor;

  const itemsHtml = rec.items
    .map(({ device, qty, reason }) => {
      const attrs = Object.entries(device.raw_attributes || {})
        .slice(0, 12)
        .map(
          ([k, v]) =>
            `<tr>
              <td style="padding:3px 8px;color:${C.GRAY};font-size:9px;border-bottom:1px solid ${C.BORDER};">${esc(tAttrKey(k))}</td>
              <td style="padding:3px 8px;color:${C.TEXT};font-size:9px;border-bottom:1px solid ${C.BORDER};">${esc(tAttrValue(String(v)))}</td>
            </tr>`
        )
        .join("");

      return `
      <div style="break-inside:avoid;margin-bottom:14px;border:1px solid ${C.BORDER};border-radius:6px;overflow:hidden;">
        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:${C.LBLUE};border-bottom:1px solid ${C.BORDER};">
          <div style="background:${C.BLUE};color:#fff;font-weight:700;padding:3px 10px;border-radius:4px;font-size:11px;">×${qty}</div>
          <div style="flex:1;">
            <div style="font-weight:600;color:${C.DARK};font-size:11px;">${esc(device.title)}</div>
            <div style="color:${C.GRAY};font-size:9px;margin-top:2px;">${esc(TYPE_LABEL[device.type] ?? device.type)}${device.channels ? ` · ${device.channels} кан.` : ""}${device.power_metering ? " · с измерением мощности" : ""}${device.protocol ? ` · ${esc(device.protocol)}` : ""}</div>
          </div>
        </div>
        <div style="padding:6px 12px;font-size:10px;color:${C.GRAY};font-style:italic;">${esc(reason)}</div>
        ${attrs ? `<table style="width:100%;border-collapse:collapse;border-top:1px solid ${C.BORDER};"><tbody>${attrs}</tbody></table>` : ""}
      </div>`;
    })
    .join("");

  const gapsHtml = rec.gaps.length
    ? `<div style="margin-top:10px;padding:10px 12px;background:#FEF2F2;border-left:3px solid #DC2626;border-radius:4px;">
        <div style="font-weight:600;color:#991B1B;font-size:11px;margin-bottom:4px;">Не покрыто:</div>
        ${rec.gaps.map((g) => `<div style="color:#7F1D1D;font-size:10px;">• ${esc(g)}</div>`).join("")}
      </div>`
    : "";

  const notesHtml = rec.notes.length
    ? `<div style="margin-top:10px;">
        ${rec.notes.map((n) => `<div style="padding:6px 10px;background:${C.LGRAY};border-left:3px solid ${C.BLUE};border-radius:4px;color:${C.TEXT};font-size:10px;margin-bottom:4px;">${esc(n)}</div>`).join("")}
      </div>`
    : "";

  return `
  <div style="break-inside:avoid;margin-bottom:18px;">
    <div style="display:flex;align-items:baseline;gap:12px;padding:10px 14px;background:${C.DARK};color:#fff;border-radius:6px 6px 0 0;">
      <div style="font-size:16px;font-weight:700;">${esc(vname)}</div>
      <div style="color:#94A3B8;font-size:10px;">${rec.items.length} позиций · ${rec.totalDevices} устройств</div>
    </div>
    <div style="padding:14px;border:1px solid ${C.BORDER};border-top:0;border-radius:0 0 6px 6px;">
      ${itemsHtml || `<div style="color:${C.GRAY};font-size:11px;text-align:center;padding:14px;">Сценарий не покрывается этим вендором</div>`}
      ${gapsHtml}
      ${notesHtml}
    </div>
  </div>`;
}

export function buildPdfHtml(scenario: Scenario, recs: Recommendation[]): string {
  const date = new Date().toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Подбор оборудования УД</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Arial, sans-serif;
    color: ${C.TEXT};
    margin: 0;
    font-size: 11px;
    line-height: 1.4;
  }
  .cover {
    background: ${C.DARK};
    color: #fff;
    padding: 28px 24px 24px;
    border-radius: 8px;
    margin-bottom: 18px;
    position: relative;
    overflow: hidden;
  }
  .cover::before {
    content: "";
    position: absolute; top: 0; left: 0; right: 0; height: 4px;
    background: ${C.GOLD};
  }
  .cover::after {
    content: "";
    position: absolute; bottom: 0; left: 0; right: 0; height: 3px;
    background: ${C.BLUE};
  }
  .cover h1 {
    margin: 0 0 6px; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;
  }
  .cover .sub { color: #94A3B8; font-size: 11px; }
  .cover .date { color: ${C.GOLD}; font-size: 12px; margin-top: 14px; font-weight: 600; }

  h2 {
    color: ${C.DARK};
    font-size: 14px;
    margin: 0 0 8px;
    padding-bottom: 4px;
    border-bottom: 2px solid ${C.GOLD};
    display: inline-block;
  }
  table.scenario {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid ${C.BORDER};
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 18px;
    font-size: 11px;
  }
  .footer {
    margin-top: 24px;
    padding-top: 10px;
    border-top: 1px solid ${C.BORDER};
    color: ${C.GRAY};
    font-size: 9px;
    text-align: center;
  }
</style>
</head>
<body>
  <div class="cover">
    <h1>ПОДБОР ОБОРУДОВАНИЯ УМНОГО ДОМА</h1>
    <div class="sub">Сравнение комплектаций Shelly и HitePRO под параметры объекта</div>
    <div class="date">${esc(date)}</div>
  </div>

  <h2>Параметры объекта</h2>
  <table class="scenario"><tbody>${scenarioRows(scenario)}</tbody></table>

  <h2>Рекомендованные комплектации</h2>
  ${recs.map(vendorBlock).join("")}

  <div class="footer">
    Подбор автоматический по каталогу вендоров. Окончательная конфигурация уточняется проектировщиком.
  </div>
</body>
</html>`;
}
