import React, { useMemo, useState } from "react";
import catalogJson from "./data/unified_catalog.json";
import type { Catalog, Scenario, Vendor } from "./types";
import { recommend } from "./rules";
import { buildPdfHtml } from "./pdf";
import { ScenarioForm } from "./components/ScenarioForm";
import { VendorColumn } from "./components/VendorColumn";

const catalog = catalogJson as unknown as Catalog;

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
};

export function App() {
  const [scenario, setScenario] = useState<Scenario>(DEFAULT_SCENARIO);

  const recs = useMemo(() => {
    const vendors: Vendor[] = ["shelly", "hitepro"];
    return vendors.map((v) => recommend(catalog, v, scenario));
  }, [scenario]);

  const [exporting, setExporting] = useState(false);
  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const html = buildPdfHtml(scenario, recs);
      const date = new Date().toISOString().slice(0, 10);
      const path = await window.api.exportPdf(html, `smart-home-${date}.pdf`);
      if (path) console.log("Saved:", path);
    } catch (e) {
      console.error(e);
      alert("Не удалось создать PDF: " + (e as Error).message);
    } finally {
      setExporting(false);
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
        <button className="pdf-btn" onClick={handleExportPdf} disabled={exporting}>
          {exporting ? "Создание PDF…" : "📄 Создать PDF"}
        </button>
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
              onOpen={(url) => window.api?.openExternal?.(url)}
            />
          ))}
        </section>
      </main>
    </div>
  );
}
