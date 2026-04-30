import React, { useState } from "react";
import type { Recommendation } from "../types";

interface Props {
  rec: Recommendation;
  onOpen: (url: string) => void;
}

const VENDOR_META: Record<string, { name: string; gradient: [string, string] }> = {
  shelly: { name: "Shelly", gradient: ["#06b6d4", "#3b82f6"] },
  hitepro: { name: "HitePRO", gradient: ["#f97316", "#ec4899"] },
};

export function VendorColumn({ rec, onOpen }: Props) {
  const meta = VENDOR_META[rec.vendor];
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="vendor">
      <div
        className="vendor-head"
        style={{ background: `linear-gradient(135deg, ${meta.gradient[0]} 0%, ${meta.gradient[1]} 100%)` }}
      >
        <div className="v-name">{meta.name}</div>
        <div className="v-sub">
          {rec.items.length} позиций · {rec.totalDevices} устройств
        </div>
      </div>

      <div className="vendor-body">
        {rec.items.length === 0 && (
          <div className="empty">Сценарий пуст или не покрывается этим вендором.</div>
        )}

        {rec.items.map(({ device, qty, reason }) => {
          const isOpen = openId === device.id;
          return (
            <div key={device.id} className={"item" + (isOpen ? " open" : "")}>
              <div className="item-row" onClick={() => setOpenId(isOpen ? null : device.id)}>
                <div className="qty">×{qty}</div>
                <div className="item-main">
                  <div className="item-title">{device.title}</div>
                  <div className="item-meta">
                    <span className="tag">{device.type}</span>
                    {device.channels > 0 && <span className="tag">{device.channels} кан.</span>}
                    {device.power_metering && <span className="tag pm">PM</span>}
                    {device.protocol && <span className="tag">{device.protocol}</span>}
                  </div>
                  <div className="item-reason">{reason}</div>
                </div>
                <button
                  className="link-btn"
                  onClick={(e) => { e.stopPropagation(); onOpen(device.url); }}
                  title="Открыть карточку у вендора"
                >↗</button>
              </div>
              {isOpen && Object.keys(device.raw_attributes || {}).length > 0 && (
                <div className="attrs">
                  {Object.entries(device.raw_attributes).slice(0, 25).map(([k, v]) => (
                    <div key={k} className="attr">
                      <span className="k">{k}</span>
                      <span className="v">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {rec.gaps.length > 0 && (
          <div className="gaps">
            <div className="gaps-title">⚠ Не покрыто:</div>
            {rec.gaps.map((g, i) => <div key={i} className="gap">{g}</div>)}
          </div>
        )}

        {rec.notes.length > 0 && (
          <div className="notes">
            {rec.notes.map((n, i) => <div key={i} className="note">{n}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
