#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

deployments_file="${repo_root}/deployments/contracts.latest.json"
front_file="${repo_root}/front/contracts.latest.json"
expected_chain_id="${EXPECTED_CHAIN_ID:-}"

usage() {
  echo "Usage: $0 --deployments <deployments-contracts.json> --front <front-contracts.json> [--expected-chain-id <chainId>]" >&2
}

while [[ $# -gt 0 ]]; do
  case "${1:-}" in
    --deployments)
      deployments_file="${2:?missing value for --deployments}"
      shift 2
      ;;
    --front)
      front_file="${2:?missing value for --front}"
      shift 2
      ;;
    --expected-chain-id)
      expected_chain_id="${2:?missing value for --expected-chain-id}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: ${1:-}" >&2
      usage
      exit 2
      ;;
  esac
done

for file in "$deployments_file" "$front_file"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing contract artifact: $file" >&2
    exit 1
  fi
done

node - "$deployments_file" "$front_file" "$expected_chain_id" <<'NODE'
const fs = require("node:fs");

const isAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
const toNumber = (value, label) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid ${label}: ${JSON.stringify(value)}`);
  }
  return parsed;
};

const normalizeDistributor = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(`invalid distributor value: ${JSON.stringify(value)}`);
  }
  const address = value.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    throw new Error(`invalid distributor address: ${value}`);
  }
  return address;
};

const [deployPath, frontPath, expectedChainIdRaw] = process.argv.slice(2);

const deployments = JSON.parse(fs.readFileSync(deployPath, "utf8"));
const front = JSON.parse(fs.readFileSync(frontPath, "utf8"));

const dChainId = toNumber(deployments?.chainId, "deployments.contracts.chainId");
const fChainId = toNumber(front?.chainId, "front.contracts.chainId");
const expectedChainId = expectedChainIdRaw?.length ? toNumber(expectedChainIdRaw, "expectedChainId") : null;
if (dChainId !== fChainId) {
  throw new Error(`chainId mismatch: deployments=${dChainId}, front=${fChainId}`);
}
if (expectedChainId !== null && dChainId !== expectedChainId) {
  throw new Error(`chainId mismatch: expected=${expectedChainId}, actual=${dChainId}`);
}

const required = ["mmoToken", "gameWorld", "feeVault", "items", "tradeEscrow", "rfqMarket"];
const dContracts = deployments?.contracts || {};
const fContracts = front || {};

for (const key of required) {
  if (!isAddress(dContracts[key])) {
    throw new Error(`deployments.contracts.${key} must be an address`);
  }
  if (!isAddress(fContracts[key])) {
    throw new Error(`front.contracts.${key} must be an address`);
  }
  if (String(dContracts[key]).toLowerCase() !== String(fContracts[key]).toLowerCase()) {
    throw new Error(
      `contract mismatch at ${key}: deployments=${dContracts[key]}, front=${fContracts[key]}`
    );
  }
}

const dDistributor = normalizeDistributor(dContracts.distributor);
const fDistributor = normalizeDistributor(fContracts.distributor);
if (dDistributor !== fDistributor) {
  throw new Error(`distributor mismatch: deployments=${dDistributor ?? "null"}, front=${fDistributor ?? "null"}`);
}

console.log(`contracts-manifest parity check ok for chainId ${dChainId}`);
NODE
