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
              checked={value.needHub}
              onChange={(e) => set("needHub", e.target.checked)}
            />
            <span>Центральный сервер УД</span>
          </label>
        </div>
      </div>
    </div>
  );
}
