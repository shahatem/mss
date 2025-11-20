import sys
import os
# Füge aktuellen Pfad hinzu, damit script.py gefunden wird
sys.path.append('/Users/denizhatemo/Documents/mss')

try:
    from script import ScenarioParams, run_bee_scenarios
except ImportError as e:
    print(f"Import Error: {e}")
    sys.exit(1)

# Szenario 1: Alles super gut
good = ScenarioParams(environment_stress=0.0, disease_management=1.0, climate_factor=1.0)
# Szenario 2: Alles katastrophal
bad = ScenarioParams(environment_stress=1.0, disease_management=0.0, climate_factor=0.0)

# Wir lassen beide gegeneinander laufen (als Baseline vs. Szenario)
try:
    df_good, df_bad, df_loss = run_bee_scenarios(10, good, bad)
except Exception as e:
    print(f"Runtime Error: {e}")
    sys.exit(1)

final_good = df_good["bee_colonies"].iloc[-1]
final_bad = df_bad["bee_colonies"].iloc[-1]

print(f"START: {df_good['bee_colonies'].iloc[0]}")
print(f"GOOD (Ende): {final_good:.2f}")
print(f"BAD  (Ende): {final_bad:.2f}")

diff = final_good - final_bad
print(f"DIFFERENZ: {diff:.2f}")

if diff > 1000:
    print("=> Modell reagiert KORREKT auf Parameter.")
else:
    print("=> Modell reagiert NICHT (oder kaum).")
