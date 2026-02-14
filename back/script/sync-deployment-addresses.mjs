#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

const defaultPaths = {
  deploymentsJson: path.join(repoRoot, "deployments", "contracts.latest.json"),
  frontJson: path.join(repoRoot, "front", "contracts.latest.json"),
  midEnv: path.join(repoRoot, "mid", ".env"),
  midEnvExample: path.join(repoRoot, "mid", ".env.example")
};

const args = parseArgs(process.argv.slice(2));
const broadcastFile = await resolveBroadcastPath(args);
const deployment = await readDeployment(broadcastFile);
const contracts = extractContracts(deployment);
const startBlock = extractStartBlock(deployment, contracts);
const chainId = normalizeChainId(args.chainId ?? deployment.chain);

await writeJsonOutput(resolvePath(args.deploymentsJson ?? defaultPaths.deploymentsJson), omitUndefined({
  chainId,
  startBlock,
  sourceBroadcast: toRepoRelative(broadcastFile),
  syncedAt: new Date().toISOString(),
  contracts
}));

await writeJsonOutput(resolvePath(args.frontJson ?? defaultPaths.frontJson), {
  chainId,
  syncedAt: new Date().toISOString(),
  ...contracts
});

if (!args.skipMidEnv) {
  const midEnvPath = resolvePath(args.midEnv ?? defaultPaths.midEnv);
  const midEnvTemplate = resolvePath(args.midEnvExample ?? defaultPaths.midEnvExample);
  await updateMidEnv(midEnvPath, midEnvTemplate, chainId, contracts);
}

console.log(`synced deployment addresses from ${toRepoRelative(broadcastFile)}`);
console.log(`- chainId: ${chainId}`);
if (startBlock !== undefined) {
  console.log(`- startBlock: ${startBlock}`);
}
for (const [name, value] of Object.entries(contracts)) {
  console.log(`- ${name}: ${value}`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (!current.startsWith("--")) {
      throw new Error(`unexpected argument: ${current}`);
    }
    const key = current.slice(2);
    if (key === "skip-mid-env") {
      out.skipMidEnv = true;
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for --${key}`);
    }
    out[toCamelCase(key)] = value;
    i++;
  }
  return out;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function resolvePath(input) {
  return path.isAbsolute(input) ? input : path.resolve(repoRoot, input);
}

async function resolveBroadcastPath(argsMap) {
  if (argsMap.broadcastFile) {
    return resolvePath(argsMap.broadcastFile);
  }
  if (argsMap.chainId) {
    return path.join(
      repoRoot,
      "back",
      "broadcast",
      "DeployChainMMO.s.sol",
      String(normalizeChainId(argsMap.chainId)),
      "run-latest.json"
    );
  }

  const deployRoot = path.join(repoRoot, "back", "broadcast", "DeployChainMMO.s.sol");
  const chainDirs = await fs.readdir(deployRoot, { withFileTypes: true }).catch(() => []);
  let latestPath = null;
  let latestMtime = 0;

  for (const dirent of chainDirs) {
    if (!dirent.isDirectory()) continue;
    const candidate = path.join(deployRoot, dirent.name, "run-latest.json");
    try {
      const stat = await fs.stat(candidate);
      if (stat.mtimeMs > latestMtime) {
        latestMtime = stat.mtimeMs;
        latestPath = candidate;
      }
    } catch {
      // ignore missing files
    }
  }

  if (!latestPath) {
    throw new Error("could not find broadcast run-latest.json; pass --broadcast-file or --chain-id");
  }
  return latestPath;
}

async function readDeployment(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function extractContracts(deployment) {
  const tupleValue = deployment?.returns?.deployment?.value;
  const tupleAddresses = typeof tupleValue === "string" ? tupleValue.match(/0x[a-fA-F0-9]{40}/g) : null;

  if (tupleAddresses && tupleAddresses.length >= 7) {
    const [mmoToken, gameWorld, feeVault, items, distributor, tradeEscrow, rfqMarket] = tupleAddresses;
    return validateContracts({ mmoToken, gameWorld, feeVault, items, distributor, tradeEscrow, rfqMarket });
  }
  if (tupleAddresses && tupleAddresses.length >= 6) {
    const [mmoToken, gameWorld, feeVault, items, tradeEscrow, rfqMarket] = tupleAddresses;
    return validateContracts({ mmoToken, gameWorld, feeVault, items, tradeEscrow, rfqMarket });
  }

  const creates = new Map();
  for (const tx of deployment?.transactions ?? []) {
    if (tx?.transactionType !== "CREATE") continue;
    if (!tx.contractName || !tx.contractAddress) continue;
    creates.set(tx.contractName, tx.contractAddress);
  }

  const fallback = {
    mmoToken: creates.get("MMOToken"),
    gameWorld: creates.get("GameWorld"),
    feeVault: creates.get("FeeVault"),
    items: creates.get("Items"),
    distributor: creates.get("MMODistributor"),
    tradeEscrow: creates.get("TradeEscrow"),
    rfqMarket: creates.get("RFQMarket")
  };

  return validateContracts(fallback);
}

function validateContracts(contracts) {
  const required = ["mmoToken", "gameWorld", "feeVault", "items", "tradeEscrow", "rfqMarket"];
  for (const name of required) {
    const address = contracts[name];
    if (!isAddress(address)) {
      throw new Error(`invalid or missing ${name} address in deployment output`);
    }
  }

  if (contracts.distributor !== undefined && contracts.distributor !== null && !isAddress(contracts.distributor)) {
    throw new Error(`invalid distributor address in deployment output`);
  }

  return {
    mmoToken: contracts.mmoToken,
    gameWorld: contracts.gameWorld,
    feeVault: contracts.feeVault,
    items: contracts.items,
    distributor: contracts.distributor ?? null,
    tradeEscrow: contracts.tradeEscrow,
    rfqMarket: contracts.rfqMarket
  };
}

function isAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeChainId(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid chain id: ${value}`);
  }
  return parsed;
}

function extractStartBlock(deployment, contracts) {
  const receipts = Array.isArray(deployment?.receipts) ? deployment.receipts : [];
  if (receipts.length === 0) {
    return undefined;
  }

  const addresses = new Set(
    Object.values(contracts)
      .filter((v) => isAddress(v))
      .map((v) => String(v).toLowerCase())
  );

  let best = null;
  for (const receipt of receipts) {
    const contractAddress = receipt?.contractAddress;
    if (!contractAddress || !addresses.has(String(contractAddress).toLowerCase())) {
      continue;
    }
    const blockNumber = normalizeBlockNumber(receipt?.blockNumber);
    if (blockNumber === undefined) {
      continue;
    }
    best = best === null ? blockNumber : Math.min(best, blockNumber);
  }

  if (best !== null) {
    return best;
  }

  // Fallback: if we can't match on contractAddress, use the earliest receipt block.
  for (const receipt of receipts) {
    const blockNumber = normalizeBlockNumber(receipt?.blockNumber);
    if (blockNumber === undefined) continue;
    best = best === null ? blockNumber : Math.min(best, blockNumber);
  }

  return best === null ? undefined : best;
}

function normalizeBlockNumber(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string") {
    if (value.startsWith("0x")) {
      const parsed = Number.parseInt(value.slice(2), 16);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
  }
  return undefined;
}

async function writeJsonOutput(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function updateMidEnv(midEnvPath, midEnvExamplePath, chainId, contracts) {
  let envContent;
  try {
    envContent = await fs.readFile(midEnvPath, "utf8");
  } catch {
    envContent = await fs.readFile(midEnvExamplePath, "utf8");
  }

  const updates = {
    CHAIN_ID: String(chainId),
    GAMEWORLD_ADDRESS: contracts.gameWorld,
    FEEVAULT_ADDRESS: contracts.feeVault,
    ITEMS_ADDRESS: contracts.items,
    MMO_ADDRESS: contracts.mmoToken,
    TRADE_ESCROW_ADDRESS: contracts.tradeEscrow,
    RFQ_MARKET_ADDRESS: contracts.rfqMarket,
    MMODISTRIBUTOR_ADDRESS: contracts.distributor ?? ""
  };

  const updated = applyEnvUpdates(envContent, updates);
  await fs.mkdir(path.dirname(midEnvPath), { recursive: true });
  await fs.writeFile(midEnvPath, updated, "utf8");
}

function applyEnvUpdates(content, updates) {
  let output = content.endsWith("\n") ? content : `${content}\n`;

  for (const [key, value] of Object.entries(updates)) {
    const matcher = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
    const line = `${key}=${value}`;
    if (matcher.test(output)) {
      output = output.replace(matcher, line);
    } else {
      output += `${line}\n`;
    }
  }

  return output.endsWith("\n") ? output : `${output}\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toRepoRelative(filePath) {
  const rel = path.relative(repoRoot, filePath);
  return rel.startsWith("..") ? filePath : rel;
}

function omitUndefined(record) {
  const out = {};
  for (const [k, v] of Object.entries(record)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}
