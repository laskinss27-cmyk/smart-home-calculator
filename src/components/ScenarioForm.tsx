import React from "react";
import type { Scenario } from "../types";

interface Props {
  value: Scenario;
  onChange: (s: Scenario) => void;
}

const FIELDS: { key: keyof Scenario; label: string; hint?: string; max?: number }[] = [
  { key: "lightPoints", label: "Свет (групп вкл/выкл)", max: 30 },
  { key: "dimmerPoints", label: "Диммируемый свет (групп)", max: 20 },
  { key: "rgbwPoints", label: "RGBW-ленты", max: 10 },
  { key: "socketPoints", label: "Умные розетки", max: 30 },
  { key: "curtainPoints", label: "Приводы штор", max: 20 },
  { key: "heatingZones", label: "Отопление (зон)", max: 20 },
  { key: "floorHeatingZones", label: "Тёплый пол (зон)", max: 20 },
  { key: "motionPoints", label: "Датчики движения", max: 20 },
  { key: "leakPoints", label: "Датчики протечки", max: 20 },
  { key: "doorPoints", label: "Охранка двери/окна", max: 20 },
  { key: "thPoints", label: "T° / влажность (точек)", max: 20 },
];

export function ScenarioForm({ value, onChange }: Props) {
  const set = <K extends keyof Scenario>(key: K, v: Scenario[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="form">
      <h2>Сценарий объекта</h2>
      <div className="fields">
        {FIELDS.map((f) => {
          const v = value[f.key] as number;
          return (
            <div className="field" key={f.key}>
              <div className="label-row">
                <label>{f.label}</label>
                <span className="num">{v}</span>
              </div>
              <input
                type="range"
                min={0}
                max={f.max ?? 20}
                step={1}
                value={v}
                onChange={(e) => set(f.key, Number(e.target.value) as any)}
              />
            </div>
          );
        })}
        <div className="checks">
          <label className="check">
            <input
              type="checkbox"
              checked={value.energyMonitoring}
              onChange={(e) => set("energyMonitoring", e.target.checked)}
            />
            <span>Мониторинг энергопотребления</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={value.noNeutral}
              onChange={(e) => set("noNeutral", e.target.checked)}
            />
            <span>Нет нейтрали в подрозетниках (Shelly 1L/2L + Bypass)</span>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={value.needHub}
              onChange={(e) => set("needHub", e.target.checked)}
            />
            <span>Настенная панель (Wall Display)</span>
          </label>
        </div>

        <div className="field" style={{ marginTop: 10 }}>
          <div className="label-row"><label>Куда монтируем</label></div>
          <select
            value={value.installStyle}
            onChange={(e) => set("installStyle", e.target.value as any)}
            style={{ width: "100%", padding: 6, background: "#1c2030", color: "#e6e9ef", border: "1px solid #2a2f44", borderRadius: 6 }}
          >
            <option value="any">Без разницы</option>
            <option value="in_wall">В подрозетники (Plus / Gen3-4 / Mini)</option>
            <option value="din">На DIN-рейку (Pro / Wave Pro)</option>
            <option value="panel">Только настенная панель</option>
          </select>
        </div>

        <div className="field" style={{ marginTop: 10 }}>
          <div className="label-row"><label>Протокол связи</label></div>
          <select
            value={value.protocolPref}
            onChange={(e) => set("protocolPref", e.target.value as any)}
            style={{ width: "100%", padding: 6, background: "#1c2030", color: "#e6e9ef", border: "1px solid #2a2f44", borderRadius: 6 }}
          >
            <option value="any">Без разницы</option>
            <option value="wifi_bt">Wi-Fi / Bluetooth (Plus / Pro / Gen3-4)</option>
            <option value="zwave">Z-Wave (Wave / Wave Pro)</option>
          </select>
        </div>
      </div>
    </div>
  );
}
