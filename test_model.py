from script import ScenarioParams, run_bee_scenarios
import pandas as pd

# Define two different parameter sets
baseline = ScenarioParams(environment_stress=0.3, disease_management=0.7, climate_factor=0.6)
scenario_bad = ScenarioParams(environment_stress=0.9, disease_management=0.2, climate_factor=0.4)

# Run scenarios
print("Running simulation 1 (Baseline vs Bad)...")
b, s, l = run_bee_scenarios(20, baseline, scenario_bad)

# Check final values
final_base = b['bee_colonies'].iloc[-1]
final_scen = s['bee_colonies'].iloc[-1]

print(f"Baseline Final Colonies: {final_base}")
print(f"Scenario Final Colonies: {final_scen}")

if abs(final_base - final_scen) < 1.0:
    print("ERROR: Values are identical!")
else:
    print("SUCCESS: Values are different.")

# Check if values change when we run again with different params
print("\nRunning simulation 2 (Baseline vs Good)...")
scenario_good = ScenarioParams(environment_stress=0.1, disease_management=0.9, climate_factor=0.8)
b2, s2, l2 = run_bee_scenarios(20, baseline, scenario_good)
final_scen2 = s2['bee_colonies'].iloc[-1]
print(f"Good Scenario Final Colonies: {final_scen2}")

if abs(final_scen - final_scen2) < 1.0:
    print("ERROR: Scenario results stuck (statefulness issue?)")
else:
    print("SUCCESS: Scenario results updated.")

