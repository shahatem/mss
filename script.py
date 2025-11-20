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
import numpy as np


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
# Direkte Systemdynamik-Simulation (ohne BPTK-Py)
# ------------------------------------------------------


def simulate_scenario(years: int, params: ScenarioParams) -> pd.DataFrame:
    """Simuliert ein einzelnes Szenario über die angegebene Anzahl Jahre.
    
    Args:
        years: Anzahl der zu simulierenden Jahre
        params: Szenario-Parameter (Umweltstress, Management, Klima)
    
    Returns:
        DataFrame mit Zeitreihe (Index: Jahr, Spalten: bee_colonies, honey_yield_per_colony, etc.)
    """
    # Initialize
    bee_colonies = [float(DEFAULT_INITIAL_COLONIES)]
    time_steps = list(range(START_YEAR, START_YEAR + years + 1))
    
    # Calculate for each year
    for _ in range(years):
        current_colonies = bee_colonies[-1]
        
        # Calculate effective rates based on scenario parameters
        effective_growth = BASE_GROWTH_RATE * (
            1.0 + 0.5 * (1.0 - params.environment_stress) + 0.5 * params.disease_management
        )
        effective_loss = BASE_LOSS_RATE * (
            1.0 + params.environment_stress + 0.5 * (1.0 - params.disease_management)
        )
        
        # Calculate flows
        growth = current_colonies * effective_growth
        losses = current_colonies * effective_loss
        
        # Update stock
        new_colonies = current_colonies + growth - losses
        bee_colonies.append(new_colonies)
    
    # Build result dataframe
    results = []
    for i, t in enumerate(time_steps):
        colonies = bee_colonies[i]
        
        # Honey yield per colony (kg/year) based on climate and stress
        honey_yield = (
            (HONEY_MIN + params.climate_factor * (HONEY_MAX - HONEY_MIN))
            * (1.0 - 0.5 * params.environment_stress)
        )
        
        results.append({
            't': t,
            'bee_colonies': colonies,
            'honey_yield_per_colony': honey_yield,
            'honey_production_tons': colonies * honey_yield / 1000.0,
            'economic_value_chf': colonies * VALUE_PER_COLONY,
        })
    
    return pd.DataFrame(results).set_index('t')


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
