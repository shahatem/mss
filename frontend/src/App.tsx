import React, { useEffect, useMemo, useState, type ReactNode } from "react";

import axios from "axios";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Area,
  AreaChart,
} from "recharts";

import "./App.css";

// Backend läuft im gleichen Origin wie das gebaute Frontend (Flask),
// daher reicht eine relative Basis-URL.
const API_BASE = "";

type ScenarioParams = {
  environment_stress: number;
  disease_management: number;
  climate_factor: number;
};

type BaselinePoint = {
  t: number;
  bee_colonies: number;
  honey_yield_per_colony: number;
  honey_production_tons: number;
  economic_value_chf: number;
  value_multiplier: number;
};

type LossPoint = {
  t: number;
  economic_loss_chf: number;
  cumulative_economic_loss_chf: number;
  honey_loss_tons: number;
  cumulative_honey_loss_tons: number;
};

type SimulationResponse = {
  years: number;
  baseline: ScenarioParams;
  scenario: ScenarioParams;
  metadata?: {
    lifespan?: {
      worker_winter_months?: { min: number; max: number };
      winter_loss_penalty?: number;
    };
    model?: {
      base_growth_rate?: number;
      base_loss_rate?: number;
      carrying_capacity?: number;
      climate_growth_factor?: number;
      climate_loss_factor?: number;
      density_loss_factor?: number;
      swiss_area_km2?: number;
    };
  };
  series: {
    baseline: BaselinePoint[];
    scenario: BaselinePoint[];
    loss: LossPoint[];
  };
  summary: {
    baseline_colonies: number;
    scenario_colonies: number;
    colonies_delta: number;
    cumulative_loss_chf: number;
    cumulative_honey_loss_tons: number;
    baseline_honey_yield: number;
    scenario_honey_yield: number;
    baseline_density_per_km2?: number;
    scenario_density_per_km2?: number;
  };
};

// Baseline ist fest: 2022, ideale Bedingungen. Hier nur informativ.
const BASELINE_PRESET: ScenarioParams = {
  environment_stress: 0,
  disease_management: 1,
  climate_factor: 1,
};

const SCENARIO_PRESET: ScenarioParams = {
  environment_stress: 0.8,
  disease_management: 0.3,
  climate_factor: 0.4,
};

type LeverKey = keyof ScenarioParams;

const LEVER_INFO: Record<LeverKey, string> = {
  environment_stress:
    "0 = ideale Umwelt (kein Stress), 1 = sehr schlecht (starke Pestizidbelastung, Habitatverlust)",
  disease_management:
    "0 = schlechtes Management (keine Varroa-Kontrolle), 1 = sehr gutes Management (effektive Bekämpfung)",
  climate_factor:
    "0 = sehr schlechtes Klima (Dürre, schlechte Tracht), 1 = sehr gutes Klima (optimale Bedingungen)",
};

const formatterInt = new Intl.NumberFormat("de-CH", {
  maximumFractionDigits: 0,
});

const leverLabels: Record<LeverKey, string> = {
  environment_stress: "Umweltstress",
  disease_management: "Krankheitsmanagement",
  climate_factor: "Klima-Faktor",
};

function App() {
  const [years, setYears] = useState(20);
  const [baseline, setBaseline] = useState<ScenarioParams>(BASELINE_PRESET);
  const [scenario, setScenario] = useState<ScenarioParams>(SCENARIO_PRESET);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"LE1" | "INFO" | "LE2">("LE2");
  const [showInfoMenu, setShowInfoMenu] = useState(false);

  const leverSections: Array<{
    key: "scenario";
    title: string;
    subtitle: string;
    values: ScenarioParams;
  }> = [
    {
      key: "scenario",
      title: "Szenario",
      subtitle: "Passe die Hebel an, Baseline bleibt Referenz (2022, ideal).",
      values: scenario,
    },
  ];

  const alignSeries = (key: keyof BaselinePoint) => {
    if (!result) return [];
    const merged = new Map<
      number,
      {
        baseline?: number;
        scenario?: number;
      }
    >();

    result.series.baseline.forEach((point) => {
      merged.set(point.t, {
        ...(merged.get(point.t) ?? {}),
        baseline: point[key] as number,
      });
    });
    result.series.scenario.forEach((point) => {
      merged.set(point.t, {
        ...(merged.get(point.t) ?? {}),
        scenario: point[key] as number,
      });
    });

    return Array.from(merged.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([t, values]) => ({
        t,
        baseline: values.baseline ?? null,
        scenario: values.scenario ?? null,
      }));
  };

  const colonySeries = useMemo(() => alignSeries("bee_colonies"), [result]);
  const honeySeries = useMemo(() => alignSeries("honey_production_tons"), [result]);
  const valueSeries = useMemo(() => alignSeries("economic_value_chf"), [result]);

  const lossSeries = useMemo(() => {
    if (!result) return [];
    return result.series.loss.map((point) => ({
      t: point.t,
      chf: point.cumulative_economic_loss_chf,
      honey: point.cumulative_honey_loss_tons,
    }));
  }, [result]);

  const lastYear =
    result?.series?.baseline?.[result.series.baseline.length - 1]?.t ??
    result?.series?.scenario?.[result.series.scenario.length - 1]?.t ??
    null;

  const runSimulation = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.post<SimulationResponse>(`${API_BASE}/api/simulate`, {
        years,
        baseline,
        scenario,
      });
      setResult(data);
      setBaseline(data.baseline);
      setScenario(data.scenario);
      setYears(data.years);
    } catch (err) {
      console.error(err);
      setError("Simulation fehlgeschlagen. Läuft das Flask-Backend?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runSimulation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLeverChange = (type: "baseline" | "scenario", key: LeverKey, value: number) => {
    const sanitized = Math.min(1, Math.max(0, value));
    if (type === "baseline") {
      setBaseline((current) => ({ ...current, [key]: sanitized }));
    } else {
      setScenario((current) => ({ ...current, [key]: sanitized }));
    }
  };

  const resetLevers = () => {
    setBaseline(BASELINE_PRESET);
    setScenario(SCENARIO_PRESET);
    setYears(20);
  };

  const formatChfTick = (value: number) =>
    new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 }).format(value / 1_000_000);

  const formatHoneyTick = (value: number) =>
    new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 }).format(value);

  return (
    <div className="app">
      <header className="topbar">
        <div>

          <h1>Schweizer Bienen Simulator</h1>
          <p className="subtitle">
            Vergleich von Szenarien für Schweizer Bienenvölker – Wachstum, Verluste, Honig und Wert.
          </p>
        </div>
        <nav className="tabs">
          <button
            className={activeTab === "LE1" ? "tab active" : "tab"}
            onClick={() => {
              setActiveTab("LE1");
              setShowInfoMenu(false);
            }}
          >
            LE1 · Systemkartierung
          </button>
          <div className="tab-dropdown">
            <button
              className={activeTab === "LE2" ? "tab active" : "tab"}
              onClick={() => {
                setActiveTab("LE2");
                setShowInfoMenu(false);
              }}
            >
              LE2 · Simulation
            </button>
            <button
              className="tab caret"
              onClick={() => setShowInfoMenu((v) => !v)}
              aria-label="Weitere Optionen"
            >
              ▼
            </button>
            {showInfoMenu && (
              <div className="tab-menu">
                <button
                  className={activeTab === "INFO" ? "tab-menu-item active" : "tab-menu-item"}
                  onClick={() => {
                    setActiveTab("INFO");
                    setShowInfoMenu(false);
                  }}
                >
                  Modell &amp; Erklärung
                </button>
              </div>
            )}
          </div>
        </nav>
      </header>

      {activeTab === "LE1" ? (
        <section className="panel placeholder">
          <h2>Systemkartierung</h2>
          <p>
            Diese Seite ist für zusätzliche Inhalte reserviert (z.B. Text, Bilder, Dokumente). Sie ist
            unabhängig von der Simulation und kann frei gestaltet werden.
          </p>
        </section>
      ) : activeTab === "INFO" ? (
        <section className="panel placeholder info-page">
          <h2>Modell & Erklärung</h2>
          <p>
            Überblick über das BPTK-Py-Systemdynamik-Modell für Schweizer Bienenvölker: Annahmen,
            Gleichungen, Hebel und Outputs, damit auch Fachfremde nachvollziehen können, was passiert.
          </p>

          <div className="info-grid">
            <div className="info-card">
              <h3>Ziele</h3>
              <ul>
                <li>Fixe Referenz (2022, ideale Bedingungen) vs. anpassbares Szenario vergleichen.</li>
                <li>Transparenz zu Wachstum, Verlusten, Honig-Ertrag und ökonomischem Wert.</li>
              </ul>
            </div>

            <div className="info-card">
              <h3>Eingaben (Hebel)</h3>
              <ul>
                <li><strong>Umweltstress</strong> (0–1): mehr Stress → mehr Verluste, weniger Wachstum &amp; Ertrag.</li>
                <li><strong>Krankheitsmanagement</strong> (0–1): besseres Mgmt → weniger Verluste, mehr Wachstum.</li>
                <li><strong>Klima</strong> (0–1): gutes Klima → mehr Wachstum, weniger Verluste, höherer Ertrag/Volk.</li>
                <li>Simulationsjahre: Jahres-Schritte ab 2022.</li>
              </ul>
            </div>

            <div className="info-card">
              <h3>Parameter &amp; Defaults</h3>
              <ul>
                <li><em>Start:</em> 182’300 Völker (2022), dt = 1 Jahr.</li>
                <li><em>Basisraten:</em> Wachstum 4.5% p.a., Verlust 4.0% p.a.</li>
                <li><em>Tragfähigkeit:</em> K = 350’000 Völker (historischer Rahmen).</li>
                <li><em>Winterbienen:</em> 5–6 Monate → Winter-Penalty in der Verlustformel.</li>
                <li><em>Referenz:</em> Stress 0, Mgmt 1, Klima 1. Szenario-Defaults: 0.8 / 0.3 / 0.4.</li>
              </ul>
            </div>

            <div className="info-card">
              <h3>Ausgaben</h3>
              <ul>
                <li>Zeitreihen: Völker, Honig/Volk, Honig (t/Jahr), ökonomischer Wert.</li>
                <li>Dichte: Völker/km² (Fläche CH 41’285 km²).</li>
                <li>Kumulative Differenzen: Honig & CHF (dual-axis, CHF in Mio).</li>
              </ul>
            </div>

            <div className="info-card wide-card">
              <h3>Gleichungen (vereinfacht)</h3>
              <ul>
                <li>
                  <strong>Wachstum:</strong> colonies * effective_growth * (1 - colonies / K)
                </li>
                <li>
                  <strong>effective_growth</strong> = base_growth *
                  (1 + 0.5*(1-stress) + 0.5*management) *
                  (0.7 + climate_growth_factor * climate)
                </li>
                <li>
                  <strong>Verluste:</strong> colonies * effective_loss
                </li>
                <li>
                  <strong>effective_loss</strong> = base_loss *
                  (1 + stress + 0.5*(1-management) + winter_penalty) *
                  (1 + climate_loss_factor*(1-climate)) *
                  (1 + density_loss_factor*colonies/K)
                </li>
                <li>Honig/Volk: 7.2–29.9 kg, Stress dämpft (1 - 0.5*stress).</li>
                <li>Öko-Wert: Völker * 1’585 CHF * scaler (0.6).</li>
              </ul>
            </div>



            <div className="info-card">
              <h3>Interpretation & Grenzen</h3>
              <ul>
                <li>Referenz bleibt fix; Szenario zeigt Hebeleffekte.</li>
                <li>Logistik bremst bei hoher Dichte; Verluste steigen bei Stress, schwachem Mgmt, schlechtem Klima, hoher Dichte.</li>
                <li>Ökonomik gedämpft (Scaler 0.6); keine Preis-/Nachfrage-/Kostenmodelle.</li>
              </ul>
            </div>
          </div>
        </section>
      ) : (
        <div className="layout">
          <div className="left-rail">
            <section className="panel compact">
              <h2>Steuerung</h2>
              <p className="microcopy">
                Baseline ist fix (2022, ideale Bedingungen). Passe nur das Szenario an.
              </p>
              <div className="controls">
                <label className="field">
                  <span>Simulationsjahre</span>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={years}
                    onChange={(event) => setYears(Number(event.target.value) || 1)}
                  />
                </label>
                <div className="button-row">
                  <button className="ghost" onClick={resetLevers}>
                    Presets
                  </button>
                  <button className="primary" onClick={runSimulation} disabled={loading}>
                    {loading ? "Simuliere..." : "Simulation"}
                  </button>
                </div>
              </div>
            </section>

            <section className="panel compact">
              <div className="panel-header">
                <h3>Hebel</h3>
                <span className="badge">Szenario</span>
              </div>
              <div className="lever-stack">
                {leverSections.map((section) => (
                  <div key={section.key} className="lever-card">
                    <div className="lever-card__head">
                      <div>
                        <p className="lever-title">{section.title}</p>
                        <p className="lever-subtitle">{section.subtitle}</p>
                      </div>
                    </div>
                    <div className="lever-body">
                      {(Object.keys(leverLabels) as Array<LeverKey>).map((key) => (
                        <LeverInput
                          key={`${section.key}-${key}`}
                          label={leverLabels[key]}
                          value={section.values[key]}
                          onChange={(val) => handleLeverChange(section.key, key, val)}
                          info={LEVER_INFO[key]}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {error && <p className="error">{error}</p>}
            </section>

          </div>

          <div className="right-rail">
            {result && (
              <>
                <section className="panel cards">
                  <SummaryCard
                    title="Referenz-Völker"
                    value={formatterInt.format(result.summary.baseline_colonies)}
                    footnote={lastYear ? `Jahr ${lastYear}` : "Letztes Jahr"}
                  />
                  <SummaryCard
                    title="Szenario-Völker"
                    value={formatterInt.format(result.summary.scenario_colonies)}
                    footnote={lastYear ? `Jahr ${lastYear}` : "Letztes Jahr"}
                    delta={result.summary.scenario_colonies - result.summary.baseline_colonies}
                  />
                  <SummaryCard
                    title="Differenz Völker"
                    value={formatterInt.format(
                      (result.summary.colonies_delta ??
                        result.summary.scenario_colonies - result.summary.baseline_colonies) as number
                    )}
                    footnote="Szenario − Baseline (letztes Jahr)"
                    intent={
                      (result.summary.colonies_delta ??
                        result.summary.scenario_colonies - result.summary.baseline_colonies) >= 0
                        ? "success"
                        : "danger"
                    }
                  />
                  <SummaryCard
                    title="Honigertrag Szenario"
                    value={`${formatterInt.format(result.summary.scenario_honey_yield)} kg`}
                    footnote={`Baseline: ${formatterInt.format(
                      result.summary.baseline_honey_yield
                    )} kg`}
                    delta={
                      result.summary.scenario_honey_yield - result.summary.baseline_honey_yield
                    }
                  />
                  <SummaryCard
                    title="Kum. CHF-Differenz"
                    value={`${formatterInt.format(
                      Math.abs(result.summary.cumulative_loss_chf)
                    )} CHF`}
                    footnote={
                      result.summary.cumulative_loss_chf >= 0
                        ? "Verlust vs. Baseline"
                        : "Gewinn vs. Baseline"
                    }
                    intent={result.summary.cumulative_loss_chf >= 0 ? "danger" : "success"}
                  />
                  <SummaryCard
                    title="Kum. Honig-Differenz"
                    value={`${formatterInt.format(
                      Math.abs(result.summary.cumulative_honey_loss_tons)
                    )} t`}
                    footnote={
                      result.summary.cumulative_honey_loss_tons >= 0
                        ? "Verlust vs. Baseline"
                        : "Gewinn vs. Baseline"
                    }
                    intent={
                      result.summary.cumulative_honey_loss_tons >= 0 ? "danger" : "success"
                    }
                  />
                </section>

                <section className="panel charts">
                  <ChartCard title="Anzahl Bienenvölker">
                    <DualLineChart data={colonySeries} />
                  </ChartCard>
                  <ChartCard title="Honigproduktion (t/Jahr)">
                    <DualLineChart data={honeySeries} />
                  </ChartCard>
                  <ChartCard title="Volkswirtschaftlicher Wert (CHF)">
                    <DualLineChart data={valueSeries} />
                  </ChartCard>
                  <ChartCard title="Kumulative Differenzen">
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={lossSeries}>
                        <defs>
                          <linearGradient id="colorChf" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#d61f45" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#d61f45" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="colorHoney" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f5a524" stopOpacity={0.8} />
                            <stop offset="95%" stopColor="#f5a524" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis
                          dataKey="t"
                          tick={{ fill: "#1e293b", fontSize: 13, fontWeight: 600 }}
                          stroke="#64748b"
                        />
                        <YAxis
                          yAxisId="left"
                          tickFormatter={formatChfTick}
                          tick={{ fill: "#1e293b", fontSize: 13, fontWeight: 600 }}
                          stroke="#64748b"
                          width={70}
                          label={{ value: "CHF Mio", angle: -90, position: "insideLeft", fill: "#475569", fontSize: 12 }}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tickFormatter={formatHoneyTick}
                          tick={{ fill: "#1e293b", fontSize: 13, fontWeight: 600 }}
                          stroke="#64748b"
                          width={70}
                          label={{ value: "Honig (t)", angle: 90, position: "insideRight", fill: "#475569", fontSize: 12 }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1e293b",
                            border: "none",
                            borderRadius: "8px",
                            color: "#fff",
                            fontSize: "14px",
                            fontWeight: 600,
                          }}
                          labelStyle={{ color: "#fff", fontSize: "15px", fontWeight: 700 }}
                          formatter={(value: number, name: string) => {
                            if (name.includes("CHF")) {
                              return `${formatChfTick(value)} Mio CHF`;
                            }
                            return `${formatHoneyTick(value)} t`;
                          }}
                          labelFormatter={(label: string | number) => `Jahr ${label}`}
                        />
                        <Legend wrapperStyle={{ fontSize: "13px", fontWeight: 600 }} />
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="chf"
                          name="CHF-Differenz"
                          stroke="#d61f45"
                          strokeWidth={2}
                          fill="url(#colorChf)"
                        />
                        <Area
                          yAxisId="right"
                          type="monotone"
                          dataKey="honey"
                          name="Honig-Diff. (t)"
                          stroke="#f5a524"
                          strokeWidth={2}
                          fill="url(#colorHoney)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const InfoButton = ({ info }: { info: string }) => {
  const [show, setShow] = React.useState(false);
  return (
    <div className="info-wrapper">
      <button
        type="button"
        className="info-btn"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={(e) => {
          e.preventDefault();
          setShow(!show);
        }}
      >
        i
      </button>
      {show && <div className="info-tooltip">{info}</div>}
    </div>
  );
};

const LeverInput = ({
  label,
  value,
  onChange,
  info,
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
  info?: string;
}) => (
  <label className="field">
    <span className="field-label">
      {label}
      {info && <InfoButton info={info} />}
    </span>
    <div className="slider-row">
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <input
        type="number"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isNaN(next) ? 0 : next);
        }}
      />
    </div>
  </label>
);

const SummaryCard = ({
  title,
  value,
  footnote,
  intent = "neutral",
  delta,
}: {
  title: string;
  value: string;
  footnote?: string;
  intent?: "neutral" | "danger" | "success";
  delta?: number;
}) => {
  return (
    <article className={`summary-card ${intent}`}>
      <p className="summary-title">{title}</p>
      <p className="summary-value">
        {value}
        {delta !== undefined && (
          <span className={`delta ${delta >= 0 ? "positive" : "negative"}`}>
            {delta >= 0 ? "+" : ""}
            {formatterInt.format(delta)}
          </span>
        )}
      </p>
      {footnote && <p className="summary-footnote">{footnote}</p>}
    </article>
  );
};

const ChartCard = ({ title, children }: { title: string; children: ReactNode }) => (
  <article className="chart-card">
    <div className="chart-card__header">
      <h3>{title}</h3>
    </div>
    <div className="chart-card__body">{children}</div>
  </article>
);

const DualLineChart = ({
  data,
}: {
  data: Array<{ t: number; baseline: number | null; scenario: number | null }>;
}) => (
  <ResponsiveContainer width="100%" height={200}>
    <LineChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis
        dataKey="t"
        tick={{ fill: "#1e293b", fontSize: 13, fontWeight: 600 }}
        stroke="#64748b"
      />
      <YAxis
        tickFormatter={(value: number) =>
          new Intl.NumberFormat("de-CH", {
            maximumFractionDigits: 0,
          }).format(value)
        }
        tick={{ fill: "#1e293b", fontSize: 13, fontWeight: 600 }}
        stroke="#64748b"
        width={80}
      />
      <Tooltip
        contentStyle={{
          backgroundColor: "#1e293b",
          border: "none",
          borderRadius: "8px",
          color: "#fff",
          fontSize: "14px",
          fontWeight: 600,
        }}
        labelStyle={{ color: "#fff", fontSize: "15px", fontWeight: 700 }}
        formatter={(value: number) =>
          new Intl.NumberFormat("de-CH", {
            maximumFractionDigits: 0,
          }).format(value)
        }
        labelFormatter={(label: string | number) => `Jahr ${label}`}
      />
      <Legend wrapperStyle={{ fontSize: "13px", fontWeight: 600 }} />
      <Line
        type="monotone"
        dataKey="baseline"
        name="Referenz"
        stroke="#2563eb"
        strokeWidth={3}
        dot={false}
      />
      <Line
        type="monotone"
        dataKey="scenario"
        name="Szenario"
        stroke="#16a34a"
        strokeWidth={3}
        dot={false}
      />
    </LineChart>
  </ResponsiveContainer>
);

export default App;



