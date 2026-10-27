"""Submit the Q-Relay experiment batch to IBM Quantum hardware (or emulate it). NEVER called by the UI.

Authentication (the token is never stored in this repo):
  * a saved account:  python -c "from qiskit_ibm_runtime import QiskitRuntimeService as S;
                       S.save_account(channel='ibm_quantum_platform', token='...', instance='...', set_as_default=True)"
  * or env vars QISKIT_IBM_TOKEN (+ QISKIT_IBM_INSTANCE).

Usage:
  python scripts/run_hardware.py --dry-run          # transpile + estimate QPU time, submit nothing
  python scripts/run_hardware.py --emulate          # run the same batch on FakeBrisbane -> source "EMU"
  python scripts/run_hardware.py --submit           # real device -> source "HW"
  python scripts/run_hardware.py --fetch JOB_ID     # retrieve a previously submitted job
"""

from __future__ import annotations

import argparse
import os
import sys
import warnings
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
warnings.simplefilter("ignore", DeprecationWarning)

from qrelay import hardware  # noqa: E402


def get_service():
    from qiskit_ibm_runtime import QiskitRuntimeService
    token = os.environ.get("QISKIT_IBM_TOKEN")
    if token:
        kw = {"channel": "ibm_quantum_platform", "token": token}
        if os.environ.get("QISKIT_IBM_INSTANCE"):
            kw["instance"] = os.environ["QISKIT_IBM_INSTANCE"]
        return QiskitRuntimeService(**kw)
    return QiskitRuntimeService()  # saved default account


def pick_backend(service, name: str | None):
    if name:
        return service.backend(name)
    return service.least_busy(operational=True, simulator=False, min_num_qubits=5)


def supports_dynamic(backend) -> bool:
    try:
        return "if_else" in backend.target.operation_names
    except Exception:
        return False


def main() -> None:
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--emulate", action="store_true")
    g.add_argument("--submit", action="store_true")
    g.add_argument("--fetch", metavar="JOB_ID")
    ap.add_argument("--backend", default=None)
    ap.add_argument("--shots", type=int, default=4096)
    ap.add_argument("--qrng-shots", type=int, default=8192)
    ap.add_argument("--qrng-qubits", type=int, default=100)
    ap.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    a = ap.parse_args()

    if a.emulate:
        from qrelay.backends import emulated_simulator, fake_backend
        be = fake_backend()
        exps = hardware.build_experiments(min(a.qrng_qubits, 20), include_dynamic=supports_dynamic(be))
        print(f"emulating {len(exps)} circuits on {be.name} (local Aer + device noise model)")
        # Passing the fake backend itself as the mode rebuilds a simulator per circuit (very slow); reuse one.
        rec = hardware.run_batch(be, emulated_simulator(), "EMU", a.shots, a.qrng_shots, exps)
        print("saved", hardware.save_record(rec, "emu_batch"))
        return

    service = get_service()
    if a.fetch:
        job = service.job(a.fetch)
        be = job.backend()
        exps = hardware.build_experiments(a.qrng_qubits, include_dynamic=supports_dynamic(be))
        print("note: --fetch rebuilds the experiment list; it must match the submitted batch")
        from qiskit.transpiler import generate_preset_pass_manager
        pm = generate_preset_pass_manager(backend=be, optimization_level=3, seed_transpiler=7)
        res = job.result()
        import time as _t
        rec = {"source": "HW", "backend": be.name, "job_id": a.fetch, "timestamp": _t.strftime("%Y-%m-%dT%H:%M:%S"),
               "versions": hardware._versions(),
               "experiments": [hardware.pub_to_record(e, pm.run(e.circuit), res[i],
                                                      a.qrng_shots if e.kind == "qrng" else a.shots)
                               for i, e in enumerate(exps)]}
        print("saved", hardware.save_record(rec, "hw_batch"))
        return

    be = pick_backend(service, a.backend)
    dyn = supports_dynamic(be)
    m = min(a.qrng_qubits, be.num_qubits)
    exps = hardware.build_experiments(m, include_dynamic=dyn)
    est = hardware.estimate_qpu_seconds(exps, a.shots, a.qrng_shots)
    print(f"backend: {be.name} ({be.num_qubits} qubits), dynamic circuits: {dyn}")
    print(f"{len(exps)} circuits, {a.shots} shots each ({a.qrng_shots} for the {m}-qubit QRNG)")
    print(f"rough QPU-time estimate: ~{est:.0f} s (your plan's monthly quota is shared across all jobs)")
    if a.dry_run:
        from qiskit.transpiler import generate_preset_pass_manager
        pm = generate_preset_pass_manager(backend=be, optimization_level=3, seed_transpiler=7)
        for e in exps[:1] + [x for x in exps if x.kind != "qrng"][:6]:
            isa = pm.run(e.circuit)
            print(f"  {e.tag:28s} depth={isa.depth():4d} ops={dict(isa.count_ops())}")
        return
    if not a.yes and input("submit? [y/N] ").strip().lower() != "y":
        print("aborted")
        return
    holder: dict = {}
    try:
        rec = hardware.run_batch(be, be, "HW", a.shots, a.qrng_shots, exps, holder)
    except KeyboardInterrupt:
        print(f"\ninterrupted; job keeps running. Retrieve later with --fetch {holder.get('job_id')}")
        return
    print("saved", hardware.save_record(rec, "hw_batch"))


if __name__ == "__main__":
    main()
