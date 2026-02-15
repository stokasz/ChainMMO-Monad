import { loadEnv, type Env } from "../src/config/env.js";
import { ActionEngine } from "../src/action-engine/engine.js";
import { ChainAdapter } from "../src/chain-adapter/client.js";
import type { AgentActionInput } from "../src/shared/schemas.js";

interface DeterministicKey {
  index: number;
  privateKey: string;
}

interface AgentRuntime {
  index: number;
  privateKey: string;
  address: string;
  characterId: number;
  chain: ChainAdapter;
  engine: ActionEngine;
}

const AGENT_API_BASE_URL = "http://127.0.0.1:8787";

interface AgentCharactersResponse {
  owner: string;
  items: Array<{
    characterId: number;
    owner: string;
    race: number;
    classType: number;
    name: string;
    bestLevel: number;
    lastLevelUpEpoch: number;
  }>;
}

const baseEnv = loadEnv();

const TARGET_AGENTS = parseEnvInt("SCALE_TARGET_AGENTS", 15, 1);
const TARGET_LEVEL = parseEnvInt("SCALE_TARGET_LEVEL", 10, 1);
const MAX_ITERATIONS = parseEnvInt("SCALE_MAX_ITERATIONS", 1400, 1);
const RFQ_BURST = parseEnvInt(process.env.SCALE_RFQ_BURST ? "SCALE_RFQ_BURST" : "SCALE_RAQ_BURST", 8, 1);
const REPORT_EVERY = parseEnvInt("SCALE_REPORT_EVERY", 25, 1);
const RFQ_OFFERED_MMO = process.env.SCALE_RQF_OFFERED_MMO ?? process.env.SCALE_RFQ_OFFERED_MMO ?? "1";
const MIN_WALLET_BALANCE_WEI = parseInt(process.env.SCALE_MIN_WALLET_BALANCE_GWEI ?? "1000", 10) * 10 ** 9;
const MNEMONIC_KEYS: string[] = [
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
  "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
  "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
  "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
  "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
  "0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897",
  "0x701b615bbdfb9de65240bc28bd21bbc0d996645a3dd57e7b12bc2bdf6f192c82",
  "0xa267530f49f8280200edf313ee7af6b827f2a8bce2897751d06a843f644967b1",
  "0x47c99abed3324a2707c28affff1267e45918ec8c3f20b8aa892e8b065d2942dd",
  "0xc526ee95bf44d8fc405a158bb884d9d1238d99f0612e9f33d006bb0789009aaa",
  "0x8166f546bab6da521a8369cab06c5d2b9e46670292d85c875ee9ec20e84ffb61"
];

function parseEnvInt(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : fallback;
  if (!Number.isInteger(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildEnv(privateKey: string): Env {
  return {
    ...baseEnv,
    SIGNER_PRIVATE_KEY: privateKey
  };
}

async function ensureWalletHasEth(chain: ChainAdapter): Promise<void> {
  const balance = await chain.getNativeBalance(chain.account!.address);
  if (balance >= BigInt(MIN_WALLET_BALANCE_WEI)) {
    return;
  }

  const funder = new ChainAdapter(baseEnv);
  const needed = BigInt(MIN_WALLET_BALANCE_WEI) - balance;
  await funder.sendNativeCurrency(chain.account!.address, needed);
}

async function readRunState(chain: ChainAdapter, characterId: number): Promise<{ active: boolean; bestLevel: number; dungeonLevel: number }> {
  const [runState, bestLevel] = await Promise.all([
    chain.readGameWorld<readonly [boolean, number, number, number, number, number, number, number, number, number]>("getRunState", [BigInt(characterId)]),
    chain.readGameWorld<number>("characterBestLevel", [BigInt(characterId)])
  ]);

  return {
    active: runState[0],
    bestLevel,
    dungeonLevel: runState[8]
  };
}

async function readCharacterBestLevel(chain: ChainAdapter, characterId: number): Promise<number> {
  return chain.readGameWorld<number>("characterBestLevel", [BigInt(characterId)]);
}

async function createCharacter(chain: ChainAdapter, index: number): Promise<number> {
  const tx = await chain.writeGameWorld("createCharacter", [0, 0, `Scale-${index}-${Date.now()}`]);
  const receipt = await chain.waitForReceipt(tx);
  const characterCreated = receipt.logs.map((log) => chain.decodeLog(log)).find((entry) => entry?.eventName === "CharacterCreated");
  const eventArg = characterCreated?.args?.characterId;
  if (typeof eventArg === "bigint") {
    return Number(eventArg);
  }
  const nextCharacterId = await chain.readGameWorld<bigint>("nextCharacterId", []);
  if (nextCharacterId <= 0n) {
    throw new Error(`character_created_parse_failed`);
  }
  return Number(nextCharacterId - 1n);
}

async function fetchOwnerCharacters(owner: string): Promise<number[]> {
  const resp = await fetch(`${AGENT_API_BASE_URL}/agent/characters/${owner}`);
  if (!resp.ok) {
    return [];
  }

  const payload = await resp.json() as AgentCharactersResponse;
  if (!Array.isArray(payload?.items)) {
    return [];
  }

  return payload.items
    .map((item) => Number(item?.characterId))
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((a, b) => b - a);
}

async function ensureCharacter(chain: ChainAdapter, index: number, engine: ActionEngine): Promise<number> {
  try {
    return await createCharacter(chain, index);
  } catch (error) {
    const ownerCharacters = await fetchOwnerCharacters(chain.account!.address);
    if (ownerCharacters.length === 0) {
      throw error;
    }

    const selected = ownerCharacters[0];
    console.log(`[seed] reusing character ${selected} for wallet ${chain.account!.address}`);
    return selected;
  }
}

async function safeClaimAndBoot(chain: ChainAdapter, engine: ActionEngine, characterId: number): Promise<void> {
  try {
    const claimTx = await chain.writeGameWorld("claimFreeLootbox", [BigInt(characterId)]);
    await chain.waitForReceipt(claimTx);
  } catch (error) {
    // Continue even if already claimed or race conditions occur.
  }

  try {
    await engine.execute({
      type: "open_lootboxes_max",
      characterId,
      tier: 2,
      maxAmount: 1,
      varianceMode: 1
    });
  } catch (error) {
    // Continue when no openable lootboxes are available.
  }

  try {
    await engine.execute({
      type: "equip_best",
      characterId,
      objective: "balanced"
    });
  } catch (error) {
    // Continue if insufficient gear is available.
  }

  const equippedSlots = await chain.readGameWorld<number>("equippedSlotCount", [BigInt(characterId)]);
  if (equippedSlots < 1) {
    const premiumBought = await executeWithRetry(engine, {
      type: "buy_premium_lootboxes",
      characterId,
      difficulty: 1,
      amount: 1
    });

    if (premiumBought) {
      await executeWithRetry(engine, {
        type: "open_lootboxes_max",
        characterId,
        tier: 2,
        maxAmount: 1,
        varianceMode: 1
      });
    }

    await executeWithRetry(engine, {
      type: "equip_best",
      characterId,
      objective: "balanced"
    });
  }
}

async function executeWithRetry(engine: ActionEngine, action: AgentActionInput, maxAttempts = 2): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await engine.execute(action);
      return true;
    } catch (error: unknown) {
      if (attempt >= maxAttempts) {
        return false;
      }
      await sleep(120);
    }
  }
  return false;
}

async function prepareAgents(): Promise<AgentRuntime[]> {
  const selected: DeterministicKey[] = MNEMONIC_KEYS
    .slice(0, TARGET_AGENTS)
    .map((privateKey, index) => ({ index: index + 1, privateKey }));

  const created: AgentRuntime[] = [];

  for (const key of selected) {
    const chain = new ChainAdapter(buildEnv(key.privateKey));
    const engine = new ActionEngine(chain);
    await ensureWalletHasEth(chain);

    const characterId = await ensureCharacter(chain, key.index, engine);

    await safeClaimAndBoot(chain, engine, characterId);

    created.push({
      index: key.index,
      privateKey: key.privateKey,
      address: chain.account!.address,
      characterId,
      chain,
      engine
    });

    console.log(`[seed] wallet ${key.index} -> char ${characterId} (${chain.account!.address})`);
  }

  return created;
}

async function stepAgent(agent: AgentRuntime): Promise<boolean> {
  const state = await readRunState(agent.chain, agent.characterId);

  const requiredSlots = await agent.chain.readGameWorld<number>("requiredEquippedSlots", [state.active ? state.dungeonLevel : state.bestLevel + 1]);
  const equippedSlots = await agent.chain.readGameWorld<number>("equippedSlotCount", [BigInt(agent.characterId)]);

  if (!state.active) {
    if (equippedSlots < requiredSlots) {
      return executeWithRetry(agent.engine, {
        type: "equip_best",
        characterId: agent.characterId,
        objective: "balanced"
      });
    }

    const nextDungeon = Math.max(state.bestLevel + 1, 1);
      return executeWithRetry(agent.engine, {
        type: "start_dungeon",
        characterId: agent.characterId,
        difficulty: 0,
        dungeonLevel: Math.min(nextDungeon, TARGET_LEVEL),
        varianceMode: 1
      });
  }

  return executeWithRetry(agent.engine, {
    type: "next_room",
    characterId: agent.characterId,
    potionChoice: 0,
    abilityChoice: 0
  });
}

async function buildProgressReport(agents: AgentRuntime[]): Promise<{ average: number; total: number }> {
  const levels = await Promise.all(agents.map((agent) => readCharacterBestLevel(agent.chain, agent.characterId)));
  const total = levels.reduce((acc, level) => acc + level, 0);
  return {
    total,
    average: total / agents.length
  };
}

async function runRfqFirehose(agent: AgentRuntime): Promise<number> {
  let created = 0;
  for (let i = 0; i < RFQ_BURST; i++) {
    const action: AgentActionInput = {
      type: "create_rfq",
      slot: i % 8,
      minTier: 0,
      acceptableSetMask: "0",
      mmoOffered: RFQ_OFFERED_MMO
    };

    if (await executeWithRetry(agent.engine, action)) {
      created += 1;
    }
  }
  return created;
}

async function main(): Promise<void> {
  const diagnosticsBefore = await fetch("http://127.0.0.1:8787/meta/diagnostics").then((resp) => resp.json() as Promise<any>);
  const leaderboardBefore = await fetch("http://127.0.0.1:8787/leaderboard?limit=200").then((resp) => resp.json() as Promise<any>);
  console.log("pre-run leaderboard count", Array.isArray(leaderboardBefore.items) ? leaderboardBefore.items.length : "n/a");
  console.log("pre-run diagnostics chain block", diagnosticsBefore.chainId, diagnosticsBefore.indexer?.chainHeadBlock);

  const agents = await prepareAgents();

  let createdRfq = 0;

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration += 1) {
    let acted = false;

    for (const agent of agents) {
      const before = await readCharacterBestLevel(agent.chain, agent.characterId);
      if (before >= TARGET_LEVEL) {
        continue;
      }

      const ok = await stepAgent(agent);
      if (!ok) {
        continue;
      }

      acted = true;
      const after = await readCharacterBestLevel(agent.chain, agent.characterId);
      if (after > before) {
        // Level increased for this agent.
      }
    }

    if (iteration % 4 === 0) {
      // Use the first agent (has MMO supply) as the RFQ spammer.
      const rfqCount = await runRfqFirehose(agents[0]);
      createdRfq += rfqCount;
    }

    if (iteration % REPORT_EVERY === 0 || iteration === 1) {
      const summary = await buildProgressReport(agents);
      console.log(`iter=${iteration} avg=${summary.average.toFixed(2)} totalRFQCreated=${createdRfq}`);
    }

    const progress = await buildProgressReport(agents);
    if (progress.average >= TARGET_LEVEL) {
      console.log(`target reached at iteration ${iteration}: average ${progress.average.toFixed(2)}`);
      break;
    }

    if (!acted) {
      // avoid tight loop if every agent is blocked.
      await sleep(250);
    }
  }

  const finalReport = await buildProgressReport(agents);
  const rfqDiagnostics = await fetch("http://127.0.0.1:8787/meta/diagnostics").then((resp) => resp.json() as Promise<any>);
  const leaderboardAfter = await fetch("http://127.0.0.1:8787/leaderboard?limit=200").then((resp) => resp.json() as Promise<any>);

  console.log("final", {
    averageBestLevel: finalReport.average,
    totalBestLevel: finalReport.total,
    rfqCreated: createdRfq,
    rfqActive: rfqDiagnostics.market?.activeRfqs,
    diagnosticsChainHead: rfqDiagnostics.indexer?.chainHeadBlock,
    leaderboardCount: Array.isArray(leaderboardAfter.items) ? leaderboardAfter.items.length : 0,
    topSample: Array.isArray(leaderboardAfter.items) ? leaderboardAfter.items.slice(0, 5).map((entry) => ({
      characterId: entry.characterId,
      bestLevel: entry.bestLevel
    })) : []
  });
  console.log("pre", diagnosticsBefore);
  console.log("post", rfqDiagnostics);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
