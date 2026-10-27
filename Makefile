PY ?= .venv/bin/python
ifeq ($(OS),Windows_NT)
PY = .venv/Scripts/python
endif

.PHONY: setup test dev demo precompute notebooks report smoke emulate

setup:
	python -m venv .venv
	$(PY) -m pip install --upgrade pip
	$(PY) -m pip install -r requirements.txt
	$(PY) -m ipykernel install --sys-prefix --name qrelay --display-name "Python (qrelay)"
	cd web && npm install

test:
	$(PY) -m pytest -q

dev:
	$(PY) -m uvicorn server.main:app --port 8000 --reload & cd web && npm run dev

demo:
	cd web && npm run build
	$(PY) -m uvicorn server.main:app --port 8000

precompute:
	$(PY) scripts/precompute_sweeps.py

emulate:
	$(PY) scripts/run_hardware.py --emulate

notebooks:
	$(PY) scripts/build_notebooks.py --execute

report:
	$(PY) scripts/build_report_figures.py

smoke:
	$(PY) scripts/smoke_ui.py --mission
