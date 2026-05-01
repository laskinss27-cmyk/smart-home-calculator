import React, { useState } from "react";
import type { Recommendation } from "../types";
import type { PriceMap } from "../api";
import { tAttrKey, tAttrValue } from "../i18n";

interface Props {
  rec: Recommendation;
  prices: PriceMap;
  onPriceChange: (deviceId: string, price: number | null) => void;
  onOpen: (url: string) => void;
}

const VENDOR_META: Record<string, { name: string; gradient: [string, string] }> = {
  shelly: { name: "Shelly", gradient: ["#06b6d4", "#3b82f6"] },
  hitepro: { name: "HitePRO", gradient: ["#f97316", "#ec4899"] },
};

const RUB = (n: number) =>
  n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₽";

export function VendorColumn({ rec, prices, onPriceChange, onOpen }: Props) {
  const meta = VENDOR_META[rec.vendor];
  const [openId, setOpenId] = useState<string | null>(null);

  const total = rec.items.reduce((sum, it) => {
    const p = prices[it.device.id];
    return sum + (p ? p * it.qty : 0);
  }, 0);
  const priced = rec.items.filter((it) => prices[it.device.id]).length;
  const allPriced = priced === rec.items.length && rec.items.length > 0;

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
        {rec.items.length > 0 && (
          <div className="v-total">
            <span className="v-total-lbl">
              Итог{!allPriced ? ` (заполнено ${priced}/${rec.items.length})` : ""}:
            </span>
            <span className="v-total-val">{RUB(total)}</span>
          </div>
        )}
      </div>

      <div className="vendor-body">
        {rec.items.length === 0 && (
          <div className="empty">Сценарий пуст или не покрывается этим вендором.</div>
        )}

        {rec.items.map(({ device, qty, reason }) => {
          const isOpen = openId === device.id;
          const price = prices[device.id];
          const lineSum = price ? price * qty : 0;
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
                  <div className="price-row" onClick={(e) => e.stopPropagation()}>
                    <span className="price-lbl">Цена за шт.:</span>
                    <input
                      className="price-input"
                      type="number"
                      min={0}
                      step={1}
                      placeholder="—"
                      value={price ?? ""}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        onPriceChange(device.id, v === "" ? null : Number(v));
                      }}
                    />
                    <span className="price-cur">₽</span>
                    {price > 0 && (
                      <span className="price-sum">= {RUB(lineSum)}</span>
                    )}
                  </div>
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
                      <span className="k">{tAttrKey(k)}</span>
                      <span className="v">{tAttrValue(String(v))}</span>
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
