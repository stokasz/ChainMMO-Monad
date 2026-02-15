#!/usr/bin/env node
/**
 * OpenClaw gateway probe for local/devnet.
 *
 * This script is intentionally dependency-free (uses Node's built-in WebSocket).
 *
 * Typical usage:
 *   node ops/probe-openclaw.mjs --first
 *   node ops/probe-openclaw.mjs --host 127.0.0.1 --ports 8788,8789,9090
 */

import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const DEFAULT_PORTS = [8788, 8789, 9090, 3000, 3030, 8080, 8081, 9473, 9500, 9797, 9999];
const DEFAULT_PROBE_TIMEOUT_MS = 450;

const OPENCLAW_HINTS = ["openclaw", "claw", "grok", "arena", "agent-api", "chainmmo"];

function parseArgs(argv) {
  const opts = {
    host: "127.0.0.1",
    ports: [...DEFAULT_PORTS],
    timeoutMs: DEFAULT_PROBE_TIMEOUT_MS,
    first: false,
    noAutodetect: false,
    format: "plain"
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--host") {
      opts.host = String(argv[++i] ?? "");
      continue;
    }
    if (arg === "--ports") {
      const raw = String(argv[++i] ?? "");
      opts.ports = raw
        .split(",")
        .map((p) => Number(p.trim()))
        .filter((p) => Number.isInteger(p) && p > 0 && p < 65536);
      continue;
    }
    if (arg === "--timeout-ms") {
      opts.timeoutMs = Math.max(50, Number(argv[++i] ?? opts.timeoutMs));
      continue;
    }
    if (arg === "--no-autodetect") {
      opts.noAutodetect = true;
      continue;
    }
    if (arg === "--first") {
      opts.first = true;
      continue;
    }
    if (arg === "--format") {
      const f = String(argv[++i] ?? "plain");
      opts.format = f === "json" ? "json" : "plain";
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      console.error(
        "Usage: probe-openclaw.mjs [--host 127.0.0.1] [--ports 8788,8789] [--timeout-ms 450] [--no-autodetect] [--first] [--format plain|json]"
      );
      process.exit(0);
    }
  }

  return opts;
}

function isLikelyOpenClawMessage(msg) {
  if (!msg || typeof msg !== "object") return false;
  if (msg.type === "event" && typeof msg.event === "string") return true;
  if (msg.type === "res" && typeof msg.id === "string") return true;
  return false;
}

function commandExists(command) {
  const result = spawnSync("which", [command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return result.status === 0;
}

function detectFromOpenClawConfig() {
  if (!commandExists("openclaw")) return [];
  const output = spawnSync("openclaw", ["config", "get", "gateway", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 5000
  });
  if (output.status !== 0 || !output.stdout) return [];

  try {
    const parsed = JSON.parse(output.stdout);
    const port = Number.parseInt(String(parsed?.port ?? ""), 10);
    if (Number.isInteger(port) && port > 0 && port < 65536) {
      return [port];
    }
  } catch {
    // ignore
  }
  return [];
}

function parsePortFromName(name) {
  if (!name) return null;
  const match = String(name).match(/:([0-9]{1,5})(?:->|$)/);
  if (!match) return null;
  const port = Number.parseInt(match[1], 10);
  if (!Number.isInteger(port) || port <= 0 || port >= 65536) return null;
  return port;
}

function detectOpenClawPorts(host, opts) {
  if (opts.noAutodetect) return [];

  const configuredPorts = detectFromOpenClawConfig();
  if (configuredPorts.length > 0) {
    return configuredPorts;
  }

  if (!commandExists("lsof")) return [];

  const output = spawnSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 1500
  });
  if (output.status !== 0 || !output.stdout) return [];

  const lines = String(output.stdout).split("\n").slice(1);
  const localHints = [];
  const allPorts = new Set();

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 7) continue;

    const command = parts[0]?.toLowerCase() ?? "";
    const name = parts[parts.length - 1] ?? "";
    const port = parsePortFromName(name);
    if (port === null) continue;

    const address = String(name).startsWith("[") ? String(name).slice(1).split("]")[0] : String(name).split(":")[0];
    if (address === "localhost" || address === "*" || address === "127.0.0.1" || address === `::1` || address === "::" || address === host) {
      allPorts.add(port);
      const matchesHint = OPENCLAW_HINTS.some((needle) => command.includes(needle));
      if (matchesHint) localHints.push(port);
    }
  }

  const uniqHints = [...new Set(localHints)];
  if (uniqHints.length > 0) return uniqHints;

  return [...new Set(Array.from(allPorts))];
}

function prioritizeCandidatePorts(ports, hostDiscoveredPorts) {
  const seen = new Set();
  const result = [];
  const defaults = [...DEFAULT_PORTS];

  const scoreFor = (port) => {
    let score = Number.MAX_SAFE_INTEGER;
    for (const candidate of defaults) {
      score = Math.min(score, Math.abs(candidate - port));
    }
    return score;
  };

  const discovered = [...hostDiscoveredPorts].sort((a, b) => scoreFor(a) - scoreFor(b) || a - b);

  for (const port of [...ports, ...discovered]) {
    if (seen.has(port)) continue;
    seen.add(port);
    result.push(port);
  }
  return result;
}

async function probeUrl(url, timeoutMs) {
  return await new Promise((resolve) => {
    const ws = new WebSocket(url);
    const state = { ok: false, reason: null };
    let finished = false;

    const done = () => {
      if (finished) return;
      finished = true;
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch {
        // ignore
      }
      resolve(state);
    };

    const timer = setTimeout(() => {
      state.reason = "timeout";
      done();
    }, timeoutMs);

    ws.onopen = () => {
      // Try a best-effort connect request with a dummy token. A real gateway should respond with a res/error.
      const id = randomUUID();
      const payload = {
        type: "req",
        id,
        method: "connect",
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: "probe",
            version: "0.0.0",
            platform: "node",
            mode: "probe",
            instanceId: randomUUID()
          },
          role: "operator",
          scopes: ["operator.admin"],
          caps: ["tool-events"],
          auth: { token: "probe" },
          userAgent: "probe",
          locale: "en-US"
        }
      };
      try {
        ws.send(JSON.stringify(payload));
      } catch {
        // ignore
      }
    };

    ws.onmessage = (event) => {
      const raw = String(event.data ?? "");
      try {
        const msg = JSON.parse(raw);
        if (isLikelyOpenClawMessage(msg)) {
          state.ok = true;
          state.reason = msg.type === "event" ? `event:${msg.event}` : "res";
          clearTimeout(timer);
          done();
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {
      state.reason = "error";
      clearTimeout(timer);
      done();
    };

    ws.onclose = () => {
      clearTimeout(timer);
      done();
    };
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.host) {
    console.error("Missing --host");
    process.exit(2);
  }
  if (!Array.isArray(opts.ports) || opts.ports.length === 0) {
    console.error("No ports to probe. Use --ports.");
    process.exit(2);
  }

  if (!opts.noAutodetect) {
    const autodetected = detectOpenClawPorts(opts.host, opts);
    if (autodetected.length > 0) {
      opts.ports = prioritizeCandidatePorts(opts.ports, autodetected);
    }
  }

  const found = [];
  for (const port of opts.ports) {
    const url = `ws://${opts.host}:${port}`;
    // eslint-disable-next-line no-await-in-loop
    const result = await probeUrl(url, opts.timeoutMs);
    if (result.ok) {
      found.push({ url, port, reason: result.reason });
      if (opts.first) break;
    }
  }

  if (opts.format === "json") {
    process.stdout.write(JSON.stringify({ found }, null, 2) + "\n");
  } else {
    for (const item of found) {
      process.stdout.write(item.url + "\n");
    }
  }

  process.exit(found.length > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(String(err?.stack ?? err));
  process.exit(1);
});
