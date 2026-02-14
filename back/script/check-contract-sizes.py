#!/usr/bin/env python3
"""
Check Foundry artifact bytecode sizes against a configurable chain limit.

Foundry's `forge build --sizes` enforces Ethereum's EIP-170 (24,576B) runtime limit and fails the build
when exceeded. Monad supports larger contracts, so we use this script for a chain-aware gate.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class SizeRow:
    contract: str
    runtime_bytes: int
    initcode_bytes: int
    artifact_path: Path


def _hex_len_bytes(hexstr: str | None) -> int:
    if not hexstr:
        return 0
    s = hexstr.strip()
    if s == "0x":
        return 0
    if s.startswith("0x"):
        s = s[2:]
    # Solidity/Foundry outputs even-length hex, but be defensive.
    return len(s) // 2


def _load_rows(out_dir: Path, include_tests: bool) -> list[SizeRow]:
    rows: list[SizeRow] = []
    for p in out_dir.rglob("*.json"):
        # Foundry layout: out/<Source>.sol/<Contract>.json
        if p.parent == out_dir:
            continue
        source_bucket = p.parent.name
        if not include_tests and (
            source_bucket.endswith(".t.sol") or source_bucket.endswith(".s.sol")
        ):
            continue

        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            # Corrupt artifact should be a hard error.
            raise RuntimeError(f"failed to parse JSON artifact: {p}")

        bytecode_obj = (
            (data.get("bytecode") or {}).get("object") if isinstance(data, dict) else None
        )
        deployed_obj = (
            (data.get("deployedBytecode") or {}).get("object")
            if isinstance(data, dict)
            else None
        )
        initcode_bytes = _hex_len_bytes(bytecode_obj)
        runtime_bytes = _hex_len_bytes(deployed_obj)

        if initcode_bytes == 0 and runtime_bytes == 0:
            continue

        rows.append(
            SizeRow(
                contract=p.stem,
                runtime_bytes=runtime_bytes,
                initcode_bytes=initcode_bytes,
                artifact_path=p,
            )
        )
    return rows


def _preset_limits(preset: str) -> tuple[int, int]:
    # Defaults intentionally match a practical "Monad vs Ethereum" split.
    if preset == "ethereum":
        max_runtime = 24_576
    elif preset == "monad":
        max_runtime = 131_072  # 128 KiB
    else:
        raise ValueError(f"unknown preset: {preset}")
    return max_runtime, max_runtime * 2  # EIP-3860 formula.


def _pct(value: int, limit: int) -> str:
    if limit <= 0:
        return ""
    return f"{(value / limit) * 100:6.1f}%"


def main() -> int:
    parser = argparse.ArgumentParser(description="Check Foundry contract bytecode sizes")
    parser.add_argument(
        "--out-dir",
        default=None,
        help="Foundry out/ directory (default: <back>/out)",
    )
    parser.add_argument(
        "--preset",
        choices=["ethereum", "monad"],
        default="monad",
        help="Size limit preset (default: monad)",
    )
    parser.add_argument(
        "--max-runtime-bytes",
        type=int,
        default=None,
        help="Override runtime size limit (bytes). If set, overrides preset.",
    )
    parser.add_argument(
        "--max-initcode-bytes",
        type=int,
        default=None,
        help="Override initcode size limit (bytes). Default: 2 * max-runtime-bytes.",
    )
    parser.add_argument(
        "--include-tests",
        action="store_true",
        help="Include artifacts from *.t.sol and *.s.sol buckets.",
    )
    parser.add_argument(
        "--print-top",
        type=int,
        default=20,
        help="How many largest contracts to print (default: 20).",
    )
    args = parser.parse_args()

    back_dir = Path(__file__).resolve().parents[1]
    out_dir = Path(args.out_dir) if args.out_dir else (back_dir / "out")
    if not out_dir.exists():
        print(f"out dir not found: {out_dir}", file=sys.stderr)
        return 2

    preset_runtime, preset_initcode = _preset_limits(args.preset)
    max_runtime = args.max_runtime_bytes if args.max_runtime_bytes is not None else preset_runtime
    max_initcode = (
        args.max_initcode_bytes
        if args.max_initcode_bytes is not None
        else (preset_initcode if args.max_runtime_bytes is None else max_runtime * 2)
    )

    rows = _load_rows(out_dir=out_dir, include_tests=args.include_tests)
    rows.sort(key=lambda r: (r.runtime_bytes, r.initcode_bytes), reverse=True)

    offenders = [r for r in rows if r.runtime_bytes > max_runtime or r.initcode_bytes > max_initcode]

    print(
        f"checked {len(rows)} artifacts (preset={args.preset}, max_runtime={max_runtime}B, max_initcode={max_initcode}B)"
    )

    print_top = max(0, args.print_top)
    shown = rows[:print_top] if print_top > 0 else []
    if shown:
        name_w = max(len("Contract"), max(len(r.contract) for r in shown))
        header = (
            f"{'Contract':<{name_w}}  {'Runtime(B)':>10}  {'Runtime%':>8}  {'Initcode(B)':>11}  {'Initcode%':>9}"
        )
        print(header)
        print("-" * len(header))
        for r in shown:
            print(
                f"{r.contract:<{name_w}}  {r.runtime_bytes:>10}  {_pct(r.runtime_bytes, max_runtime):>8}  {r.initcode_bytes:>11}  {_pct(r.initcode_bytes, max_initcode):>9}"
            )

    if offenders:
        print("\nFAIL: some contracts exceed configured limits:", file=sys.stderr)
        for r in offenders:
            which = []
            if r.runtime_bytes > max_runtime:
                which.append(f"runtime {r.runtime_bytes}B > {max_runtime}B")
            if r.initcode_bytes > max_initcode:
                which.append(f"initcode {r.initcode_bytes}B > {max_initcode}B")
            which_s = ", ".join(which)
            print(f"- {r.contract}: {which_s} ({r.artifact_path})", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

