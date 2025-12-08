# app.py – Bienen-Systemdynamik mit BPTK-Py (LE2)
"""Systemdynamics-Modell für das Schweizer Bienensystem mit BPTK-Py.

Dieses Skript enthält:

- Ein BPTK-Py Model mit Stock & Flow Struktur (bee_colonies, colony_growth, colony_losses)
- Converter für Honigertrag, Honigproduktion und volkswirtschaftlichen Nutzen
- Eine einfache Szenarioverwaltung (Baseline vs. Stress-Szenario) über BPTK-Py
- Hilfsfunktionen, um Einbussen (Honig und CHF) gegenüber der Baseline zu berechnen
- Ein kleines Test- und Demo-Setup im __main__-Block

Hinweis: Damit das Skript läuft, brauchst du BPTK-Py im Environment:
    pip install bptk-py
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Tuple

import pandas as pd
from BPTK_Py import Model


# ------------------------------------------------------
# Feste Modellparameter (vereinfacht nach Agroscope-Daten)
# ------------------------------------------------------
START_YEAR = 2022

# Basiswerte Schweiz 2022 (Agroscope)
DEFAULT_INITIAL_COLONIES = 182_300  # Anzahl Bienenvölker

# Basisraten (pro Jahr) – moderat, wird durch Logistik begrenzt
BASE_GROWTH_RATE = 0.045  # 4.5 % Zuwachs p.a. bei neutralen Bedingungen
BASE_LOSS_RATE = 0.04     # 4.0 % Verluste p.a. bei neutralen Bedingungen

# Tragfähigkeit (logistische Begrenzung, Völker) – historischer Peak ~350k
CARRYING_CAPACITY = 350_000

# Schweizer Landesfläche (für Dichteausgaben, km²)
SWISS_AREA_KM2 = 41_285

# Klimaeinfluss auf Verluste (0..1), wirkt verstärkend bei schlechtem Klima
CLIMATE_LOSS_FACTOR = 0.5

# Klimaeinfluss auf Wachstum (Skalierung 0..1+), bei schlechtem Klima weniger Wachstum
CLIMATE_GROWTH_FACTOR = 1.0

# Dichteabhängige Verluste (Verstärkung, wenn Kolonien nahe an K)
DENSITY_LOSS_FACTOR = 0.1

# Volkswirtschaftlicher Nutzen pro Volk (CHF/Jahr)
VALUE_PER_COLONY = 1_585  # ca. 600 CHF Produkte + 985 CHF Bestäubung
# Kalibrierfaktor für wirtschaftlichen Wert (dämpft zu hohe Gewinne/Verluste)
ECONOMIC_VALUE_SCALER = 0.6
# Honigertrag-Spanne (kg/Jahr/Volk) aus Agroscope-Zeitreihe
HONEY_MIN = 7.2           # schlechtes Jahr (2021)
HONEY_MAX = 29.9          # sehr gutes Jahr (2020)

# Lebensdauer (wird als Verstärker für Winterverluste genutzt)
WINTER_BEE_LIFESPAN_MONTHS = (5, 6)  # Winterbienen (reduzierter Penalty)


@dataclass
class ScenarioParams:
    """Parameter für ein Szenario (wird über base_constants/constants gesetzt)."""

    environment_stress: float  # 0 = ideal, 1 = sehr schlecht
    disease_management: float  # 0 = schlecht, 1 = sehr gut
    climate_factor: float      # 0 = schlechtes Jahr, 1 = sehr gutes Jahr

    def as_constants(self) -> Dict[str, float]:
        return {
            "environment_stress": float(self.environment_stress),
            "disease_management": float(self.disease_management),
            "climate_factor": float(self.climate_factor),
        }


# ------------------------------------------------------
# Systemdynamics-Simulation mit BPTK-Py
# ------------------------------------------------------


def _build_bee_model(years: int, params: ScenarioParams) -> Model:
    """Baut das SD-Modell mit BPTK-Py (Stocks, Flows, Converter)."""

    model = Model(starttime=0, stoptime=years, dt=1.0, name="bee_sd")

    # Konstanten / Eingangsparameter
    env_stress = model.constant("environment_stress")
    env_stress.equation = float(params.environment_stress)

    disease_mgmt = model.constant("disease_management")
    disease_mgmt.equation = float(params.disease_management)

    climate_factor = model.constant("climate_factor")
    climate_factor.equation = float(params.climate_factor)

    base_growth_rate = model.constant("base_growth_rate")
    base_growth_rate.equation = float(BASE_GROWTH_RATE)

    base_loss_rate = model.constant("base_loss_rate")
    base_loss_rate.equation = float(BASE_LOSS_RATE)

    # Winterbienen-Lebensdauer als Penalty auf die Verlustrate
    avg_winter_months = sum(WINTER_BEE_LIFESPAN_MONTHS) / 2.0
    # Referenz 6 Monate: kürzere Lebensdauer erhöht Verluste. Clamp 0..1.
    winter_loss_penalty = max(0.0, min(1.0, (6.0 - avg_winter_months) / 6.0))
    winter_penalty_const = model.constant("winter_loss_penalty")
    winter_penalty_const.equation = float(winter_loss_penalty)

    honey_min = model.constant("honey_min")
    honey_min.equation = float(HONEY_MIN)

    honey_max = model.constant("honey_max")
    honey_max.equation = float(HONEY_MAX)

    value_per_colony = model.constant("value_per_colony")
    value_per_colony.equation = float(VALUE_PER_COLONY)

    carrying_capacity = model.constant("carrying_capacity")
    carrying_capacity.equation = float(CARRYING_CAPACITY)

    climate_loss_factor = model.constant("climate_loss_factor")
    climate_loss_factor.equation = float(CLIMATE_LOSS_FACTOR)

    density_loss_factor = model.constant("density_loss_factor")
    density_loss_factor.equation = float(DENSITY_LOSS_FACTOR)

    # Stock & Flows
    bee_colonies = model.stock("bee_colonies")
    bee_colonies.initial_value = float(DEFAULT_INITIAL_COLONIES)

    effective_growth = model.converter("effective_growth")
    effective_growth.equation = base_growth_rate * (
        1.0 + 0.5 * (1.0 - env_stress) + 0.5 * disease_mgmt
    ) * (0.7 + CLIMATE_GROWTH_FACTOR * climate_factor)

    effective_loss = model.converter("effective_loss")
    effective_loss.equation = base_loss_rate * (
        (1.0 + env_stress + 0.5 * (1.0 - disease_mgmt) + winter_penalty_const)
        * (1.0 + climate_loss_factor * (1.0 - climate_factor))
        * (1.0 + density_loss_factor * (bee_colonies / carrying_capacity))
    )

    colony_growth = model.flow("colony_growth")
    colony_growth.equation = bee_colonies * effective_growth * (
        1.0 - bee_colonies / carrying_capacity
    )

    colony_losses = model.flow("colony_losses")
    colony_losses.equation = bee_colonies * effective_loss

    # Stock-DGL (Netto-Zufluss)
    bee_colonies.equation = colony_growth - colony_losses

    # Converter für Honig und wirtschaftlichen Wert
    honey_yield_per_colony = model.converter("honey_yield_per_colony")
    honey_yield_per_colony.equation = (
        (honey_min + climate_factor * (honey_max - honey_min))
        * (1.0 - 0.5 * env_stress)
    )

    honey_production_tons = model.converter("honey_production_tons")
    honey_production_tons.equation = bee_colonies * honey_yield_per_colony / 1000.0

    economic_value_chf = model.converter("economic_value_chf")
    economic_value_chf.equation = bee_colonies * value_per_colony * ECONOMIC_VALUE_SCALER

    return model


def simulate_scenario(years: int, params: ScenarioParams) -> pd.DataFrame:
    """Simuliert ein Szenario mit BPTK-Py und liefert eine Zeitreihe zurück."""

    model = _build_bee_model(years, params)

    records = []
    for step in range(int(model.starttime), int(model.stoptime) + 1):
        colonies = float(model.memoize("bee_colonies", step))
        honey_yield = float(model.memoize("honey_yield_per_colony", step))
        honey_prod = float(model.memoize("honey_production_tons", step))
        econ_value = float(model.memoize("economic_value_chf", step))

        records.append(
            {
                "t": START_YEAR + step,
                "bee_colonies": colonies,
                "honey_yield_per_colony": honey_yield,
                "honey_production_tons": honey_prod,
                "economic_value_chf": econ_value,
            }
        )

    return pd.DataFrame(records).set_index("t")


# ------------------------------------------------------
# Szenario-Vergleich und Verlustberechnung
# ------------------------------------------------------


def run_bee_scenarios(
    years: int,
    baseline_params: ScenarioParams,
    scenario_params: ScenarioParams,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Führt zwei Szenarien (Baseline vs. Szenario) aus und berechnet Einbussen.

    Rückgabe:
        df_baseline: Zeitreihe Baseline
        df_scenario: Zeitreihe Szenario
        df_loss:     Einbussen (Honig + CHF) vs. Baseline
    """
    
    # Run both scenarios
    df_baseline = simulate_scenario(years, baseline_params)
    df_scenario = simulate_scenario(years, scenario_params)

    # Einbussen gegenüber Baseline berechnen
    df_loss = compute_losses_vs_baseline(df_baseline, df_scenario)

    return df_baseline, df_scenario, df_loss


def compute_losses_vs_baseline(
    baseline: pd.DataFrame, scenario: pd.DataFrame
) -> pd.DataFrame:
    """Berechnet jährliche & kumulative Einbussen (Honig & CHF) gegenüber Baseline."""

    merged = baseline.join(
        scenario,
        how="inner",
        lsuffix="_baseline",
        rsuffix="_scenario",
    )

    merged["economic_loss_chf"] = (
        merged["economic_value_chf_baseline"] - merged["economic_value_chf_scenario"]
    )

    merged["honey_loss_tons"] = (
        merged["honey_production_tons_baseline"]
        - merged["honey_production_tons_scenario"]
    )

    merged["cumulative_economic_loss_chf"] = merged["economic_loss_chf"].cumsum()
    merged["cumulative_honey_loss_tons"] = merged["honey_loss_tons"].cumsum()

    return merged


# ------------------------------------------------------
# Einfache Tests (können als Mini-Validierung für LE2 dienen)
# ------------------------------------------------------


def _test_higher_stress_leads_to_lower_population() -> None:
    """Sanity-Check: Höherer Umweltstress sollte weniger Völker erzeugen."""

    years = 20
    baseline = ScenarioParams(environment_stress=0.2, disease_management=0.8, climate_factor=0.6)
    high_stress = ScenarioParams(environment_stress=0.8, disease_management=0.8, climate_factor=0.6)

    df_base, df_scen, _ = run_bee_scenarios(years, baseline, high_stress)

    final_base = df_base["bee_colonies"].iloc[-1]
    final_scen = df_scen["bee_colonies"].iloc[-1]

    assert final_scen <= final_base, (
        "Bei höherem Umweltstress sollte die Bienenpopulation nicht höher sein als in der Baseline. "
        f"final_base={final_base}, final_scenario={final_scen}"
    )


def _test_losses_correct_sign() -> None:
    """Einbussen sollten positiv sein, wenn das Szenario schlechter ist als die Baseline."""

    years = 10
    baseline = ScenarioParams(environment_stress=0.3, disease_management=0.7, climate_factor=0.6)
    worse = ScenarioParams(environment_stress=0.9, disease_management=0.2, climate_factor=0.3)

    _, _, df_loss = run_bee_scenarios(years, baseline, worse)

    # Bei einem schlechteren Szenario sollten die Verluste positiv sein
    assert (df_loss["economic_loss_chf"] >= 0).all()
    assert (df_loss["honey_loss_tons"] >= 0).all()


# ------------------------------------------------------
# Demo-Lauf für Notebook / Konsole
# ------------------------------------------------------


if __name__ == "__main__":
    # Beispiel: 20 Jahre simulieren, moderate Baseline vs. schlechtes Szenario
    baseline_params = ScenarioParams(
        environment_stress=0.3,
        disease_management=0.7,
        climate_factor=0.6,
    )

    scenario_params = ScenarioParams(
        environment_stress=0.8,
        disease_management=0.3,
        climate_factor=0.4,
    )

    df_baseline, df_scenario, df_loss = run_bee_scenarios(
        years=20,
        baseline_params=baseline_params,
        scenario_params=scenario_params,
    )

    print("Baseline (letzte 5 Zeitschritte):")
    print(df_baseline.tail())

    print("\nSzenario (letzte 5 Zeitschritte):")
    print(df_scenario.tail())

    print("\nEinbussen gegenüber Baseline (letzte 5 Zeitschritte):")
    print(df_loss[["economic_loss_chf", "cumulative_economic_loss_chf", "honey_loss_tons", "cumulative_honey_loss_tons"]].tail())

    # Tests ausführen
    _test_higher_stress_leads_to_lower_population()
    _test_losses_correct_sign()
    print("\nAlle einfachen Tests wurden erfolgreich ausgeführt.")
