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
  };
};

const BASELINE_PRESET: ScenarioParams = {
  environment_stress: 0.3,
  disease_management: 0.7,
  climate_factor: 0.6,
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

  const leverSections: Array<{
    key: "baseline" | "scenario";
    title: string;
    subtitle: string;
    values: ScenarioParams;
  }> = [
    {
      key: "baseline",
      title: "Baseline",
      subtitle: "Moderate Bedingungen, orientiert an heutigen Verhältnissen",
      values: baseline,
    },
    {
      key: "scenario",
      title: "Szenario",
      subtitle: "Angepasstes Szenario mit veränderten Hebeln",
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

  return (
    <div className="app-shell">
      <header>
        <div>
          <p className="eyebrow">BPTK-Py Demo</p>
          <h1>Schweizer Bienen-Systemdynamik</h1>
        </div>
      </header>

      <section className="panel preset-info">
        <h2>Szenario-Presets</h2>
        <p className="preset-description">
          Diese Simulation vergleicht zwei Entwicklungen des Schweizer Bienensystems über mehrere
          Jahre: eine Baseline, die heutige moderate Bedingungen abbildet, und ein Stress-Szenario
          mit erhöhtem Umweltstress und schlechterem Krankheitsmanagement. Das Modell berechnet
          jährlich die Bienenpopulation, die Honigproduktion und den volkswirtschaftlichen Nutzen
          und zeigt die Unterschiede zwischen den beiden Szenarien transparent auf.
        </p>

        <details className="model-details">
          <summary>Berechnungslogik anzeigen</summary>
          <div className="model-details-body">
            <h4>Ausgangspunkt Baseline</h4>
            <p>
              Die Simulation startet im Jahr <strong>2022</strong> mit
              <strong> 182’300 Bienenvölkern</strong> nach offiziellen Agroscope-Daten. Die Baseline
              verwendet typische heutige Bedingungen:
              <strong> environment_stress = 0.3</strong>,<strong> disease_management = 0.7</strong>{" "}
              und<strong> climate_factor = 0.6</strong>.
            </p>
            <ul>
              <li>
                Honigertrag zwischen <strong>7.2 kg</strong> (sehr schlechtes Jahr) und
                <strong>29.9 kg</strong> (sehr gutes Jahr) pro Volk
              </li>
              <li>
                volkswirtschaftlicher Wert von <strong>1’585 CHF je Volk</strong> (600 CHF Produkte
                + 985 CHF Bestäubung)
              </li>
              <li>
                jährlicher Zeitschritt: <strong>dt = 1 Jahr</strong>
              </li>
            </ul>

            <h4>Wachstum & Verluste</h4>
            <p>
              Das Modell arbeitet mit zwei Flows: Wachstum und Verlusten. Beide hängen direkt von
              den Szenario-Parametern ab:
            </p>
            <ul>
              <li>
                <strong>effective_growth_rate</strong> steigt bei gutem Management und niedrigem
                Stress und sinkt bei schlechteren Bedingungen.
              </li>
              <li>
                <strong>effective_loss_rate</strong> steigt bei hohem Stress und schwachem
                Management.
              </li>
              <li>
                Die jährliche Änderung ergibt sich aus
                <strong> colony_growth − colony_losses</strong>.
              </li>
            </ul>

            <h4>Honigertrag</h4>
            <p>Der Honigertrag pro Volk wird aus Klima und Stress interpoliert:</p>
            <ul>
              <li>
                <strong>honey_yield_per_colony</strong> = HONEY_MIN + (HONEY_MAX − HONEY_MIN) × (1 −
                0.5 × environment_stress)
              </li>
              <li>höhere Stresswerte → geringerer Ertrag</li>
              <li>Gesamte Honigproduktion = Völkerzahl × Ertrag ÷ 1000 (in Tonnen)</li>
            </ul>

            <h4>Volkswirtschaftlicher Wert</h4>
            <p>
              Der volkswirtschaftliche Nutzen steigt mit der Völkerzahl und nutzt den fixen
              Agroscope-Wert:
            </p>
            <ul>
              <li>
                <strong>economic_value_chf</strong> = bee_colonies × 1’585 CHF
              </li>
              <li>Einbussen zwischen Baseline und Szenario werden jährlich und kumulativ berechnet</li>
            </ul>
          </div>
        </details>
      </section>

      <section className="panel">
        <h2>Einstellungen</h2>
        <div className="settings-grid">
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
          <div className="settings-actions">
            <button className="ghost" onClick={resetLevers}>
              Presets laden
            </button>
            <button className="primary" onClick={runSimulation} disabled={loading}>
              {loading ? "Simuliere..." : "Simulation starten"}
            </button>
          </div>
        </div>

        <div className="lever-accordions">
          {leverSections.map((section) => (
            <details
              key={section.key}
              className="lever-accordion"
              open={section.key === "scenario"}
            >
              <summary>
                <div>
                  <p className="lever-title">{section.title}</p>
                  <p className="lever-subtitle">{section.subtitle}</p>
                </div>
                <span className="lever-summary-arrow" />
              </summary>
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
            </details>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {result && (
        <>
          <section className="panel cards">
            <SummaryCard
              title="Baseline-Völker"
              value={formatterInt.format(result.summary.baseline_colonies)}
              footnote="letztes Jahr"
            />
            <SummaryCard
              title="Szenario-Völker"
              value={formatterInt.format(result.summary.scenario_colonies)}
              footnote="letztes Jahr"
              delta={result.summary.scenario_colonies - result.summary.baseline_colonies}
            />
            <SummaryCard
              title="Völker-Differenz (Szenario − Baseline)"
              value={formatterInt.format(
                (result.summary.colonies_delta ??
                  result.summary.scenario_colonies - result.summary.baseline_colonies) as number
              )}
              footnote="Differenz im letzten Jahr der Simulation"
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
            <ChartCard title="Bienenpopulation">
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
                  <Area
                    type="monotone"
                    dataKey="chf"
                    name="CHF-Differenz"
                    stroke="#d61f45"
                    strokeWidth={2}
                    fill="url(#colorChf)"
                  />
                  <Area
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
        name="Baseline"
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



