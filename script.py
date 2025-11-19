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
import BPTK_Py


# ------------------------------------------------------
# Feste Modellparameter (vereinfacht nach Agroscope-Daten)
# ------------------------------------------------------
START_YEAR = 2022

# Basiswerte Schweiz 2022 (Agroscope)
DEFAULT_INITIAL_COLONIES = 182_300  # Anzahl Bienenvölker

# Basisraten (pro Jahr) – stark vereinfacht
BASE_GROWTH_RATE = 0.08   # 8 % Zuwachs p.a. bei neutralen Bedingungen
BASE_LOSS_RATE = 0.06     # 6 % Verluste p.a. bei neutralen Bedingungen

# Volkswirtschaftlicher Nutzen pro Volk (CHF/Jahr)
VALUE_PER_COLONY = 1_585  # ca. 600 CHF Produkte + 985 CHF Bestäubung

# Honigertrag-Spanne (kg/Jahr/Volk) aus Agroscope-Zeitreihe
HONEY_MIN = 7.2           # schlechtes Jahr (2021)
HONEY_MAX = 29.9          # sehr gutes Jahr (2020)


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
# BPTK-Py Model definieren
# ------------------------------------------------------


def create_bee_model(years: int) -> Model:
    """Erzeugt das Bienen-Systemdynamikmodell als BPTK-Py Model.

    Das Modell läuft von START_YEAR bis START_YEAR + years mit Zeitschritt 1 Jahr.
    """

    stoptime = float(START_YEAR + years)

    model = Model(starttime=float(START_YEAR), stoptime=stoptime, dt=1.0, name="BeeSystem")

    # Stocks
    bee_colonies = model.stock("bee_colonies")
    bee_colonies.initial_value = DEFAULT_INITIAL_COLONIES

    # Flows
    colony_growth = model.flow("colony_growth")
    colony_losses = model.flow("colony_losses")

    # Converter / Konstanten für Levers
    environment_stress = model.constant("environment_stress")
    disease_management = model.constant("disease_management")
    climate_factor = model.constant("climate_factor")

    # Effektive Raten (Converter)
    effective_growth_rate = model.converter("effective_growth_rate")
    effective_loss_rate = model.converter("effective_loss_rate")

    # Honig & volkswirtschaftlicher Nutzen (Converter)
    honey_yield_per_colony = model.converter("honey_yield_per_colony")
    honey_production_tons = model.converter("honey_production_tons")
    economic_value_chf = model.converter("economic_value_chf")

    # Gleichungen
    environment_stress.equation = 0.3
    disease_management.equation = 0.7
    climate_factor.equation = 0.6

    effective_growth_rate.equation = (
        BASE_GROWTH_RATE
        * (1.0 + 0.5 * (1.0 - environment_stress) + 0.5 * disease_management)
    )

    effective_loss_rate.equation = (
        BASE_LOSS_RATE
        * (1.0 + environment_stress + 0.5 * (1.0 - disease_management))
    )

    colony_growth.equation = bee_colonies * effective_growth_rate
    colony_losses.equation = bee_colonies * effective_loss_rate

    # Stock-Gleichung: next bee_colonies = bee_colonies + (growth - losses)
    bee_colonies.equation = colony_growth - colony_losses

    # Honigertrag pro Volk (kg/Jahr) mit Klima & Umweltstress
    honey_yield_per_colony.equation = (
        (HONEY_MIN + climate_factor * (HONEY_MAX - HONEY_MIN))
        * (1.0 - 0.5 * environment_stress)
    )

    # Gesamte Honigproduktion (t/Jahr)
    honey_production_tons.equation = bee_colonies * honey_yield_per_colony / 1000.0

    # Volkswirtschaftlicher Nutzen (CHF/Jahr)
    economic_value_chf.equation = bee_colonies * VALUE_PER_COLONY

    return model


# ------------------------------------------------------
# Szenario-Setup und Lauf mit BPTK-Py
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

    model = create_bee_model(years)

    # BPTK-Session und Modell registrieren
    bptk = BPTK_Py.bptk()
    bptk.register_model(model)

    # Szenario-Manager definieren
    scenario_manager = {
        "smBees": {
            "model": model,
            "base_constants": {
                "bee_colonies": float(DEFAULT_INITIAL_COLONIES),
                **baseline_params.as_constants(),
            },
        }
    }

    bptk.register_scenario_manager(scenario_manager)

    # Zwei Szenarien: Baseline (keine Änderungen) und Szenario (angepasste Levers)
    bptk.register_scenarios(
        scenarios={
            "baseline": {
                "constants": {},
            },
            "scenario": {
                "constants": scenario_params.as_constants(),
            },
        },
        scenario_manager="smBees",
    )

    # Simulation ausführen, Ergebnisse als DataFrame holen
    df_all: pd.DataFrame = bptk.plot_scenarios(
        scenarios=["baseline", "scenario"],
        scenario_managers="smBees",
        equations=[
            "bee_colonies",
            "honey_production_tons",
            "economic_value_chf",
        ],
        series_names={},
        return_df=True,
    )

    # Spalten trennen in Baseline vs. Szenario
    # Spaltennamen haben in der Regel das Muster: smBees_baseline_bee_colonies
    baseline_cols = {col for col in df_all.columns if "_baseline_" in col}
    scenario_cols = {col for col in df_all.columns if "_scenario_" in col}

    def _strip_prefix(col: str) -> str:
        # 'smBees_baseline_bee_colonies' -> 'bee_colonies'
        parts = col.split("_")
        return "_".join(parts[2:])

    df_baseline = pd.DataFrame(index=df_all.index)
    for col in baseline_cols:
        df_baseline[_strip_prefix(col)] = df_all[col]

    df_scenario = pd.DataFrame(index=df_all.index)
    for col in scenario_cols:
        df_scenario[_strip_prefix(col)] = df_all[col]

    df_baseline.index.name = "t"
    df_scenario.index.name = "t"

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
    ).clip(lower=0.0)

    merged["honey_loss_tons"] = (
        merged["honey_production_tons_baseline"]
        - merged["honey_production_tons_scenario"]
    ).clip(lower=0.0)

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


def _test_losses_non_negative() -> None:
    """Einbussen (Honig/CHF) sollten nie negativ sein."""

    years = 10
    baseline = ScenarioParams(environment_stress=0.3, disease_management=0.7, climate_factor=0.6)
    worse = ScenarioParams(environment_stress=0.9, disease_management=0.2, climate_factor=0.3)

    _, _, df_loss = run_bee_scenarios(years, baseline, worse)

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
    _test_losses_non_negative()
    print("\nAlle einfachen Tests wurden erfolgreich ausgeführt.")
