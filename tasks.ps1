# Q-Relay task runner for Windows (equivalent of the Makefile).
# Usage: .\tasks.ps1 <setup|test|dev|demo|precompute|emulate|notebooks|report|smoke>
param([Parameter(Position = 0)][string]$Task = "help")

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$Py = Join-Path $Root ".venv\Scripts\python.exe"
Set-Location $Root

switch ($Task) {
    "setup" {
        python -m venv .venv
        & $Py -m pip install --upgrade pip
        & $Py -m pip install -r requirements.txt
        & $Py -m ipykernel install --sys-prefix --name qrelay --display-name "Python (qrelay)"
        Push-Location web; npm install; Pop-Location
    }
    "test" { & $Py -m pytest -q }
    "dev" {
        Start-Process -NoNewWindow $Py -ArgumentList "-m", "uvicorn", "server.main:app", "--port", "8000", "--reload"
        Push-Location web; npm run dev; Pop-Location
    }
    "demo" {
        Push-Location web; npm run build; Pop-Location
        Write-Host "Q-Relay running at http://127.0.0.1:8000" -ForegroundColor Cyan
        & $Py -m uvicorn server.main:app --port 8000
    }
    "precompute" { & $Py scripts\precompute_sweeps.py }
    "emulate" { & $Py scripts\run_hardware.py --emulate }
    "notebooks" { & $Py scripts\build_notebooks.py --execute }
    "report" { & $Py scripts\build_report_figures.py }
    "smoke" { & $Py scripts\smoke_ui.py --mission }
    default { Write-Host "tasks: setup | test | dev | demo | precompute | emulate | notebooks | report | smoke" }
}
