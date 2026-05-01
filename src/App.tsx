import React, { useEffect, useMemo, useState } from "react";
import catalogJson from "./data/unified_catalog.json";
import type { Catalog, Scenario, Vendor } from "./types";
import type { PriceMap } from "./api";
import { recommend } from "./rules";
import { buildPdfHtml } from "./pdf";
import { ScenarioForm } from "./components/ScenarioForm";
import { VendorColumn } from "./components/VendorColumn";
import { cleanShellyCatalog } from "./catalogClean";

const catalog = cleanShellyCatalog(catalogJson as unknown as Catalog);

const DEFAULT_SCENARIO: Scenario = {
  lightPoints: 5,
  dimmerPoints: 1,
  rgbwPoints: 0,
  socketPoints: 2,
  curtainPoints: 0,
  heatingZones: 0,
  floorHeatingZones: 2,
  motionPoints: 2,
  leakPoints: 2,
  doorPoints: 1,
  thPoints: 1,
  needHub: false,
  energyMonitoring: true,
  noNeutral: false,
  installStyle: "any",
  protocolPref: "any",
};

export function App() {
  const [scenario, setScenario] = useState<Scenario>(DEFAULT_SCENARIO);
  const [prices, setPrices] = useState<PriceMap>({});

  useEffect(() => {
    window.api?.getPrices?.().then(setPrices).catch(() => {});
  }, []);

  const updatePrice = async (deviceId: string, price: number | null) => {
    // Оптимистичный апдейт, чтобы инпут сразу отображал введённое.
    setPrices((p) => {
      const next = { ...p };
      if (price === null || !Number.isFinite(price as number) || (price as number) <= 0) delete next[deviceId];
      else next[deviceId] = price as number;
      return next;
    });
    try {
      const fresh = await window.api.setPrice(deviceId, price);
      setPrices(fresh);
    } catch (e) {
      console.error("setPrice failed:", e);
    }
  };

  const recs = useMemo(() => {
    const vendors: Vendor[] = ["shelly", "hitepro"];
    return vendors.map((v) => recommend(catalog, v, scenario));
  }, [scenario]);

  const [exporting, setExporting] = useState<Vendor | null>(null);
  const handleExportPdf = async (vendor: Vendor) => {
    const rec = recs.find((r) => r.vendor === vendor);
    if (!rec) return;
    setExporting(vendor);
    try {
      const html = buildPdfHtml(scenario, rec, prices);
      const date = new Date().toISOString().slice(0, 10);
      const path = await window.api.exportPdf(html, `kp-${vendor}-${date}.pdf`);
      if (path) console.log("Saved:", path);
    } catch (e) {
      console.error(e);
      alert("Не удалось создать PDF: " + (e as Error).message);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="title">Калькулятор Умного Дома</div>
          <div className="sub">
            Каталог: {catalog.totals.shelly} Shelly + {catalog.totals.hitepro} HitePRO
          </div>
        </div>
        <div className="pdf-group">
          <span className="pdf-label">КП на:</span>
          <button
            className="pdf-btn shelly"
            onClick={() => handleExportPdf("shelly")}
            disabled={exporting !== null}
          >
            {exporting === "shelly" ? "Создание…" : "📄 Shelly"}
          </button>
          <button
            className="pdf-btn hitepro"
            onClick={() => handleExportPdf("hitepro")}
            disabled={exporting !== null}
          >
            {exporting === "hitepro" ? "Создание…" : "📄 HitePRO"}
          </button>
        </div>
      </header>

      <main className="main">
        <aside className="sidebar">
          <ScenarioForm value={scenario} onChange={setScenario} />
        </aside>

        <section className="results">
          {recs.map((r) => (
            <VendorColumn
              key={r.vendor}
              rec={r}
              prices={prices}
              onPriceChange={updatePrice}
              onOpen={(url) => window.api?.openExternal?.(url)}
            />
          ))}
        </section>
      </main>
    </div>
  );
}
