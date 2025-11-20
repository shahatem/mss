from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from flask import Flask, jsonify, request, send_from_directory

from script import (
    VALUE_PER_COLONY,
    ScenarioParams,
    run_bee_scenarios,
)


BASE_DIR = Path(__file__).resolve().parent
DIST_DIR = BASE_DIR / "frontend" / "dist"


def create_app() -> Flask:
    """Create and configure the Flask application.

    Serves the production-ready frontend from `frontend/dist`.
    """

    app = Flask(
        __name__,
        static_folder=str(DIST_DIR),
        static_url_path="",  # serve static files from the root ("/")
    )

    # -----------------------
    # API: Simulation endpoint
    # -----------------------

    @app.post("/api/simulate")
    def api_simulate():
        """Run the bee system simulation and return results as JSON.

        Expected JSON body (all fields optional, defaults used if missing):
        {
          "years": 20,
          "baseline": {
            "environment_stress": 0.3,
            "disease_management": 0.7,
            "climate_factor": 0.6
          },
          "scenario": {
            "environment_stress": 0.8,
            "disease_management": 0.3,
            "climate_factor": 0.4
          }
        }
        """

        data: Dict[str, Any] = request.get_json(silent=True) or {}

        years = int(data.get("years", 20))

        baseline_cfg = data.get("baseline", {}) or {}
        scenario_cfg = data.get("scenario", {}) or {}

        def _clamp01(value: float) -> float:
            return max(0.0, min(1.0, float(value)))

        baseline_params = ScenarioParams(
            environment_stress=_clamp01(baseline_cfg.get("environment_stress", 0.3)),
            disease_management=_clamp01(baseline_cfg.get("disease_management", 0.7)),
            climate_factor=_clamp01(baseline_cfg.get("climate_factor", 0.6)),
        )

        scenario_params = ScenarioParams(
            environment_stress=_clamp01(scenario_cfg.get("environment_stress", 0.8)),
            disease_management=_clamp01(scenario_cfg.get("disease_management", 0.3)),
            climate_factor=_clamp01(scenario_cfg.get("climate_factor", 0.4)),
        )

        df_baseline, df_scenario, df_loss = run_bee_scenarios(
            years=years,
            baseline_params=baseline_params,
            scenario_params=scenario_params,
        )

        # Baseline & Szenario-Zeitreihen in das Format der Frontend-Types bringen
        baseline_series = df_baseline.reset_index().copy()
        scenario_series = df_scenario.reset_index().copy()

        # value_multiplier als Verhältnis des wirtschaftlichen Werts zum "theoretischen" Wert
        def _value_multiplier(df_row):
            colonies = float(df_row.get("bee_colonies", 0.0) or 0.0)
            econ = float(df_row.get("economic_value_chf", 0.0) or 0.0)
            denom = colonies * float(VALUE_PER_COLONY)
            return float(econ / denom) if denom > 0 else 0.0

        baseline_series["value_multiplier"] = baseline_series.apply(_value_multiplier, axis=1)
        scenario_series["value_multiplier"] = scenario_series.apply(_value_multiplier, axis=1)

        baseline_payload = [
            {
                "t": int(row["t"]),
                "bee_colonies": float(row["bee_colonies"]),
                "honey_yield_per_colony": float(row["honey_yield_per_colony"]),
                "honey_production_tons": float(row["honey_production_tons"]),
                "economic_value_chf": float(row["economic_value_chf"]),
                "value_multiplier": float(row["value_multiplier"]),
            }
            for _, row in baseline_series.iterrows()
        ]

        scenario_payload = [
            {
                "t": int(row["t"]),
                "bee_colonies": float(row["bee_colonies"]),
                "honey_yield_per_colony": float(row["honey_yield_per_colony"]),
                "honey_production_tons": float(row["honey_production_tons"]),
                "economic_value_chf": float(row["economic_value_chf"]),
                "value_multiplier": float(row["value_multiplier"]),
            }
            for _, row in scenario_series.iterrows()
        ]

        loss_payload = []
        for _, row in df_loss.reset_index().iterrows():
            loss_payload.append(
                {
                    "t": int(row["t"]),
                    "economic_loss_chf": float(row["economic_loss_chf"]),
                    "cumulative_economic_loss_chf": float(
                        row["cumulative_economic_loss_chf"]
                    ),
                    "honey_loss_tons": float(row["honey_loss_tons"]),
                    "cumulative_honey_loss_tons": float(row["cumulative_honey_loss_tons"]),
                }
            )

        # Summary aus dem letzten Zeitschritt ableiten
        last_baseline = baseline_payload[-1]
        last_scenario = scenario_payload[-1]
        last_loss = loss_payload[-1]

        colonies_delta = last_scenario["bee_colonies"] - last_baseline["bee_colonies"]

        summary = {
            "baseline_colonies": last_baseline["bee_colonies"],
            "scenario_colonies": last_scenario["bee_colonies"],
            "colonies_delta": colonies_delta,
            "cumulative_loss_chf": last_loss["cumulative_economic_loss_chf"],
            "cumulative_honey_loss_tons": last_loss["cumulative_honey_loss_tons"],
            "baseline_honey_yield": last_baseline["honey_yield_per_colony"],
            "scenario_honey_yield": last_scenario["honey_yield_per_colony"],
        }

        response = {
            "years": years,
            "baseline": baseline_params.as_constants(),
            "scenario": scenario_params.as_constants(),
            "series": {
                "baseline": baseline_payload,
                "scenario": scenario_payload,
                "loss": loss_payload,
            },
            "summary": summary,
        }

        return jsonify(response)

    @app.route("/")
    def index():
        """Serve the main SPA entry point."""

        return send_from_directory(DIST_DIR, "index.html")

    @app.errorhandler(404)
    def spa_fallback(error):  # type: ignore[override]
        """Fallback for client-side routed paths in the SPA.

        If the requested path looks like a file (has an extension) or is under
        `/assets/`, return the original 404. Otherwise, serve `index.html`
        so client-side routing can handle the URL.
        """

        path = request.path or "/"

        # Static assets and files with extensions should keep the 404
        if path.startswith("/assets/") or "." in path.rsplit("/", 1)[-1]:
            return error

        return send_from_directory(DIST_DIR, "index.html")

    return app


# Flask entry point:
#   flask --app web_app run
app = create_app()


