## mss

### Project overview

This repository contains:
- **Python system dynamics model** of the Swiss bee system in `script.py` (using **BPTK-Py**).
- **Pre-built frontend** in `frontend/dist` (static files that you can open or serve in a browser).

The backend runs simulations and prints results/tests to the console; the frontend is a static, production build that can be served by any HTTP server.

---

### Tech stack

- **Backend**: Python, `pandas`, `BPTK-Py`
- **Frontend**: static build (e.g. Vite/SPA) already compiled into `frontend/dist`

---

### Prerequisites

- **Python**: 3.10 or higher (recommended)
- **pip**: for installing Python dependencies
- (Optional) **Node.js + npm**: only needed if you plan to rebuild the frontend from its original source project

---

### 1. Installation (one-time)

- **Clone the repository**

  ```bash
  git clone <this-repo-url>
  cd mss
  ```

- **Create and activate a virtual environment (recommended)**

  ```bash
  python -m venv .venv
  source .venv/bin/activate     # macOS / Linux
  # .venv\Scripts\activate      # Windows PowerShell
  ```

- **Install Python dependencies**

  ```bash
  pip install -r requirements.txt
  ```


- **(Optional) Install Node.js dependencies**

  ```bash
  cd frontend
  npm install
  ```


- **(Optional) Build Node.js dependencies**

  ```bash
  cd frontend
  npm run build
  ```

---

### 2. Running the application

#### 2.1 Full app (recommended) – Flask server

From the project root:

```bash
cd mss                      # only if you are not already in the project root
source .venv/bin/activate   # if not already activated
flask --app web_app run
```

Then open `http://localhost:5000` in your browser.  
Flask will serve the production frontend from `frontend/dist`.

#### 2.2 Backend only: run the bee model (console)

From the project root:

```bash
cd mss                      # only if you are not already in the project root
source .venv/bin/activate   # if not already activated
python script.py
```

This will:
- run a demo simulation,
- print the last time steps for baseline and scenario,
- run a few simple sanity tests.

**Model notes:**
- Winter bees: Loss rate includes a winter survival penalty. Reference is 6 months average lifespan.
  Penalty = max(0, (6 − avg_months) / 6) and is added on top of stress/management effects (Winterbienen 5–6 Monate).
- Logistic growth: Carrying capacity 350,000 colonies; base growth 4.5% p.a.
  `growth = colonies * effective_growth * (1 - colonies / carrying_capacity) * (0.7 + climate_growth_factor * climate)`.
- Losses: base 4.0% p.a., amplified by stress/management, winter penalty, climate
  `(1 + climate_loss_factor * (1 - climate_factor))`, and density `(1 + density_loss_factor * colonies/K)`.
- Economic value: per colony CHF 1,585, scaled by `economic_value_scaler = 0.6` to temper gains/losses.

#### 2.3 Frontend only: serve the static UI

The frontend is already built into `frontend/dist`.

- **Option A – open directly (quick check)**

  - Double-click `frontend/dist/index.html` in your file explorer, or:

    ```bash
    open frontend/dist/index.html      # macOS
    # or
    xdg-open frontend/dist/index.html  # Linux
    ```

- **Option B – serve via a simple local web server (recommended)**

  From the project root:

  ```bash
  cd frontend/dist
  python -m http.server 8000
  ```

  Then open `http://localhost:8000` in your browser.

---

### 3. Making changes & updating

#### 3.1 Backend (Python model)

1. Edit `script.py` (e.g. change parameters, equations, scenarios, or tests).
2. Ensure your virtual environment is active.
3. Re-run the script from the project root:

   ```bash
   python script.py
   ```

4. Review the console output to verify that:
   - the simulation runs without errors, and
   - the built-in tests pass.

#### 3.2 Frontend (static build)

The `frontend/dist` folder contains the **production build** of the frontend. To update it, you need the original frontend source project (usually a separate repo or folder).

Typical workflow:

1. In the original frontend project (not this `mss` folder), make your changes.
2. In that project, run a production build, for example:

   ```bash
   npm install
   npm run build
   ```

3. Copy the newly generated `dist` folder from that project and replace the `frontend/dist` folder in this repo.
4. Back in this repo, serve `frontend/dist` to verify:

   ```bash
   cd mss
   cd frontend/dist
   python -m http.server 8000
   ```

5. Open `http://localhost:8000` and confirm your changes are visible.

---

### 4. Project structure

At a glance:

- `script.py` – bee system dynamics model and demo/tests (entry point for backend).
- `requirements.txt` – Python dependencies for the model.
- `frontend/dist` – compiled, production-ready frontend assets (HTML/CSS/JS).
- `frontend/node_modules` – (if present) local dependencies for the original frontend project; not needed at runtime for the static build.

---

### 5. Quick reference

- **Activate virtualenv** (from project root): `source .venv/bin/activate`
- **Install dependencies**: `pip install -r requirements.txt`
- **Start full app (Flask)**: `flask --app web_app run`
- **Run backend model only**: `python script.py`
- **Serve frontend only**: `cd frontend/dist && python -m http.server 8000`
- **Update backend**: edit `script.py` and re-run it.
- **Update frontend**: rebuild in the original frontend project, then replace `frontend/dist` here and re-serve.