import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "./lib/api";
import { formatNative } from "./lib/format";
import { navigateTo } from "./lib/navigation";
import { getApiBase } from "./lib/url";
import { useRecentFeed } from "./hooks/useFeed";
import {
  type AgentCharactersResponse,
  type AgentStatePayload,
  type DiagnosticsResponse,
  type ExternalResponse,
  type FeedEvent,
  type GrokHistoryItem,
  type GrokStatusResponse,
  type LeaderboardClaimsResponse,
  type LeaderboardEpochMeta,
  type LeaderboardItem,
  type MarketRfqsResponse,
  type RewardsResponse
} from "./types";
import { Navbar } from "./components/Navbar";
import { StatusBar } from "./components/StatusBar";
import { LiveFeed } from "./components/LiveFeed";
import { GrokArena } from "./components/GrokArena";
import { AgentStatePanel } from "./components/AgentState";
import { LeaderboardPanel } from "./components/LeaderboardPanel";
import { RewardsPanel } from "./components/RewardsPanel";
import { RfqMarketPanel } from "./components/RfqMarket";
import { EconomyPanel } from "./components/EconomyPanel";
import { DocsLinksPanel } from "./components/DocsLinks";
import { AboutPanel } from "./components/AboutPanel";
import { Panel } from "./components/Panel";

const POLL_LEADERBOARD_MS = 12_000;
const POLL_DIAGNOSTICS_MS = 60_000;
const POLL_REWARDS_MS = 60_000;
const POLL_CONTRACTS_MS = 300_000;
const POLL_RFQ_MS = 8_000;
const POLL_GROK_STATUS_MS = 10_000;
const POLL_AGENT_STATE_MS = 30_000;

type XLinkStatus =
  | "idle"
  | "starting"
  | "awaiting_signature"
  | "finalizing"
  | "linked"
  | "error";

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type AgentStateResponsePayload = AgentStatePayload | { state?: unknown; deltas?: unknown[] };

function isAgentStateResponseShape(value: unknown): value is AgentStatePayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;

  return (
    candidate.character !== undefined &&
    typeof candidate.character === "object" &&
    candidate.character !== null &&
    candidate.runState !== undefined &&
    typeof candidate.runState === "object" &&
    candidate.runState !== null &&
    candidate.equipment !== undefined &&
    typeof candidate.equipment === "object" &&
    candidate.equipment !== null &&
    Array.isArray((candidate.equipment as Record<string, unknown>).items) &&
    candidate.economy !== undefined &&
    typeof candidate.economy === "object" &&
    candidate.economy !== null &&
    Array.isArray(candidate.lootboxCredits)
  );
}

function getAgentStateFromResponse(payload: unknown): AgentStatePayload | null {
  if (!isAgentStateResponseShape(payload)) {
    const envelope = payload as { state?: unknown };
    if (!envelope || typeof envelope.state !== "object" || envelope.state === null) {
      return null;
    }
    return isAgentStateResponseShape(envelope.state) ? envelope.state : null;
  }

  return payload as AgentStatePayload;
}

function parseChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const source = value.trim();
    const normalized = source.startsWith("0x") ? Number.parseInt(source, 16) : Number(source);
    if (Number.isFinite(normalized) && Number.isInteger(normalized) && normalized > 0) {
      return normalized;
    }
  }
  return null;
}

function getInjectedProvider(): Eip1193Provider | null {
  const eth = (window as any).ethereum as Eip1193Provider | undefined;
  if (!eth || typeof eth.request !== "function") return null;
  return eth;
}

function toHexChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

export default function App() {
  const apiBase = useMemo(() => getApiBase(), []);

  const { entries: feedItems, error: feedError } = useRecentFeed(apiBase, true, 60);

  const playbookQuickstartUrl = useMemo(
    () => `${apiBase}/meta/playbook/quickstart?format=markdown`,
    [apiBase],
  );
  const onboardingReadOnlyCmd = useMemo(() => `curl -fsS "${playbookQuickstartUrl}"`, [playbookQuickstartUrl]);

  const agentManifestJson = useMemo(
    () =>
      JSON.stringify({
        schemaVersion: 1,
        apiBase,
        cta: { startCmd: onboardingReadOnlyCmd },
        endpoints: {
          playbookQuickstart: playbookQuickstartUrl,
          contracts: `${apiBase}/meta/contracts`,
          external: `${apiBase}/meta/external`,
          rewards: `${apiBase}/meta/rewards`,
          diagnostics: `${apiBase}/meta/diagnostics`,
          leaderboardLive: `${apiBase}/leaderboard?mode=live&limit=100`,
          feedRecent: `${apiBase}/feed/recent`
        },
        anchors: ["feed", "leaderboard", "agent", "market", "docs", "about"],
      }),
    [apiBase, onboardingReadOnlyCmd, playbookQuickstartUrl],
  );

  const [contractsText, setContractsText] = useState<string>("Loading...");
  const [externalMmo, setExternalMmo] = useState<ExternalResponse>(null);
  const [leaderboardMeta, setLeaderboardMeta] = useState<string>("Loading leaderboard...");
  const [leaderboardItems, setLeaderboardItems] = useState<LeaderboardItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null);
  const [rewards, setRewards] = useState<RewardsResponse | null>(null);
  const [leaderboardEpoch, setLeaderboardEpoch] = useState<LeaderboardEpochMeta | null>(null);
  const [marketRfqs, setMarketRfqs] = useState<MarketRfqsResponse | null>(null);
  const [chainIdFromMeta, setChainIdFromMeta] = useState<number | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [walletStatus, setWalletStatus] = useState<string>("");
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [xLinkStatus, setXLinkStatus] = useState<XLinkStatus>("idle");
  const [xLinkMessage, setXLinkMessage] = useState<string>("");
  const [grokSessionId, setGrokSessionId] = useState<string>("");
  const [grokMessages, setGrokMessages] = useState<GrokHistoryItem[]>([]);
  const [grokStreamText, setGrokStreamText] = useState<string>("");
  const [grokStatus, setGrokStatus] = useState<GrokStatusResponse>({
    online: false,
    queueDepth: 0,
    lastSeenAt: null,
    agentAddress: null,
    agentCharacterId: null
  });
  const [grokInput, setGrokInput] = useState<string>("");
  const [grokSending, setGrokSending] = useState<boolean>(false);
  const [grokError, setGrokError] = useState<string>("");
  const [agentCharacters, setAgentCharacters] = useState<AgentCharactersResponse | null>(null);
  const [agentState, setAgentState] = useState<AgentStatePayload | null>(null);
  const [agentClaims, setAgentClaims] = useState<LeaderboardClaimsResponse | null>(null);
  const [activeSection, setActiveSection] = useState<string>("feed");
  type OverlayPanel = "docs" | "about";
  const [overlayPanel, setOverlayPanel] = useState<OverlayPanel | null>(null);
  const overlayDialogRef = useRef<HTMLDivElement | null>(null);
  const overlayReturnFocusRef = useRef<HTMLElement | null>(null);

  const grokEventSourceRef = useRef<EventSource | null>(null);
  const xLinkHandledRef = useRef<string | null>(null);
  const walletAddressRef = useRef<string>("");
  const latestSessionSeed = useMemo(() => Date.now(), []);
  const grokSessionRetryTimerRef = useRef<number | null>(null);
  const grokSessionInFlightRef = useRef<boolean>(false);
  const grokSessionFailureCount = useRef<number>(0);

  const selectedAgentCharacter = useMemo(() => {
    const candidates = Array.isArray(agentCharacters?.items) ? agentCharacters.items : [];
    if (candidates.length === 0) {
      return null;
    }
    return [...candidates].sort((left, right) => right.bestLevel - left.bestLevel || right.characterId - left.characterId)[0];
  }, [agentCharacters]);

  useEffect(() => {
    walletAddressRef.current = walletAddress;
  }, [walletAddress]);

  useEffect(() => {
    const target = window.location.hash.replace(/^#/, "");
    if (target === "docs" || target === "about") {
      setActiveSection(target);
      setOverlayPanel(target);
    } else if (target) {
      setActiveSection(target);
    }
  }, []);

  const connectWallet = useCallback(async (): Promise<string> => {
    const provider = getInjectedProvider();
    if (!provider) {
      setWalletStatus("No injected wallet provider found");
      throw new Error("no_wallet_provider");
    }

    if (chainIdFromMeta === null) {
      setWalletStatus("Waiting for chain metadata before connecting wallet");
      throw new Error("chain_metadata_unavailable");
    }

    if (!Number.isInteger(chainIdFromMeta) || chainIdFromMeta <= 0) {
      setWalletStatus("Waiting for chain metadata before connecting wallet");
      throw new Error("chain_metadata_unavailable");
    }

    setWalletStatus("Connecting wallet...");
    const accounts = (await provider.request({
      method: "eth_requestAccounts"
    })) as unknown;

    const first = Array.isArray(accounts) ? accounts[0] : null;
    if (typeof first !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(first)) {
      setWalletStatus("No wallet account returned");
      throw new Error("no_wallet_account");
    }

    let chainId = parseChainId(await provider.request({ method: "eth_chainId" }));
    if (!chainId) {
      setWalletStatus("Wallet chain ID could not be detected");
      throw new Error("wallet_chainid_unavailable");
    }

    if (chainId !== chainIdFromMeta) {
      const expectedChainIdHex = toHexChainId(chainIdFromMeta);
      setWalletStatus(`Wrong chain ${chainId}. Switching to chain ${chainIdFromMeta}...`);
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: expectedChainIdHex }]
        });
      } catch (error: any) {
        const message = error?.message ? String(error.message) : String(error);
        setWalletStatus(`Unsupported wallet chain ${chainId}. Connect to chain ${chainIdFromMeta}.`);
        throw new Error(`wallet_switch_failed:${message}`);
      }

      const switchedChainId = parseChainId(await provider.request({ method: "eth_chainId" }));
      if (switchedChainId !== chainIdFromMeta) {
        setWalletStatus(`Unsupported wallet chain ${chainId}. Connect to chain ${chainIdFromMeta}.`);
        throw new Error("wallet_chain_switch_failed");
      }

      chainId = switchedChainId;
    }

    if (chainIdFromMeta !== null && chainIdFromMeta > 0 && chainId !== chainIdFromMeta) {
      setWalletStatus(`Unsupported wallet chain ${chainId}. Connect to chain ${chainIdFromMeta}.`);
      throw new Error("wallet_chain_mismatch");
    }

    setWalletChainId(chainId);
    setWalletAddress(first);
    setWalletStatus("");
    return first;
  }, [chainIdFromMeta]);

  const disconnectWallet = useCallback(() => {
    setWalletAddress("");
    setWalletStatus("");
    setWalletChainId(null);
    setXLinkStatus("idle");
    setXLinkMessage("");
    setAgentCharacters(null);
    setAgentState(null);
    setAgentClaims(null);
    setGrokSessionId("");
    setGrokMessages([]);
    setGrokStreamText("");
    setGrokInput("");
    setGrokSending(false);
    setGrokError("");
  }, []);

  useEffect(() => {
    if (!walletAddress || !walletChainId) {
      return;
    }
    if (chainIdFromMeta === null) {
      return;
    }
    if (walletChainId !== chainIdFromMeta) {
      const message = `Wallet chain ${walletChainId} does not match app chain ${chainIdFromMeta}. Disconnecting.`;
      // disconnectWallet() clears walletStatus; re-apply the mismatch reason so the user sees it.
      disconnectWallet();
      setWalletStatus(message);
    }
  }, [chainIdFromMeta, disconnectWallet, walletAddress, walletChainId]);

  const startXLink = useCallback(async () => {
    setXLinkMessage("");
    setXLinkStatus("starting");

    try {
      const addr = walletAddress || (await connectWallet());
      const response = await fetchJson<{ authorizeUrl: string }>(`${apiBase}/auth/x/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: addr })
      });

      if (!response?.authorizeUrl) {
        throw new Error("missing_authorize_url");
      }
      navigateTo(response.authorizeUrl);
    } catch (err) {
      setXLinkStatus("error");
      setXLinkMessage(`X link failed: ${String(err)}`);
    }
  }, [apiBase, connectWallet, walletAddress]);

  const closeGrokStream = useCallback(() => {
    grokEventSourceRef.current?.close();
    grokEventSourceRef.current = null;
  }, []);

  const clearGrokSessionRetryTimer = useCallback(() => {
    if (grokSessionRetryTimerRef.current !== null) {
      window.clearTimeout(grokSessionRetryTimerRef.current);
      grokSessionRetryTimerRef.current = null;
    }
  }, []);

  const resetGrokArena = useCallback(() => {
    closeGrokStream();
    clearGrokSessionRetryTimer();
    const sessionId = grokSessionId;
    grokSessionInFlightRef.current = false;
    grokSessionFailureCount.current = 0;
    setGrokSending(false);
    setGrokStreamText("");
    setGrokError("");
    setGrokInput("");
    setGrokMessages([]);
    setGrokSessionId("");
    if (sessionId) {
      void fetchJson(`${apiBase}/grok/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId })
      }).catch(() => {});
    }
  }, [apiBase, clearGrokSessionRetryTimer, closeGrokStream, grokSessionId]);

  const bootstrapGrokSession = useCallback(async (): Promise<string | null> => {
    if (grokSessionInFlightRef.current) {
      return grokSessionId || null;
    }
    if (grokSessionId) {
      return grokSessionId;
    }

    grokSessionInFlightRef.current = true;
    try {
      const payload = await fetchJson<{ sessionId: string }>(`${apiBase}/grok/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: `mid:${latestSessionSeed}` })
      });
      if (typeof payload.sessionId === "string" && payload.sessionId.trim().length > 0) {
        const sessionId = payload.sessionId.trim();
        setGrokSessionId(sessionId);
        setGrokError("");
        grokSessionFailureCount.current = 0;
        return sessionId;
      }
      return null;
    } catch (error) {
      grokSessionFailureCount.current += 1;
      if (grokSessionFailureCount.current < 3) {
        setGrokError("Grok session is starting...");
      } else {
        setGrokError("Session not ready yet. Reconnect to refresh.");
      }
      return null;
    } finally {
      grokSessionInFlightRef.current = false;
    }
  }, [apiBase, grokSessionId, latestSessionSeed]);

  const refreshGrokHistory = useCallback(async (sessionId?: string) => {
    try {
      const historyUrl = new URL(`${apiBase}/grok/history`);
      historyUrl.searchParams.set("limit", "12");
      if (sessionId) {
        historyUrl.searchParams.set("sessionId", sessionId);
      }
      const data = await fetchJson<{ items?: GrokHistoryItem[] }>(historyUrl.toString());
      setGrokMessages(Array.isArray(data.items) ? data.items : []);
      setGrokError("");
    } catch (error) {
      setGrokError(String(error));
    }
  }, [apiBase]);

  const refreshGrokStatus = useCallback(async () => {
    try {
      const data = await fetchJson<GrokStatusResponse>(`${apiBase}/grok/status`);
      setGrokStatus({
        online: Boolean(data.online),
        queueDepth: data.queueDepth ?? 0,
        lastSeenAt: data.lastSeenAt ?? null,
        agentAddress: data.agentAddress ?? null,
        agentCharacterId: data.agentCharacterId ?? null
      });
    } catch {
      setGrokStatus((prev) => ({ ...prev, online: false }));
    }
  }, [apiBase]);

  useEffect(() => {
    let active = true;

    const scheduleRetry = (delayMs: number) => {
      clearGrokSessionRetryTimer();
      grokSessionRetryTimerRef.current = window.setTimeout(() => {
        if (!active) {
          return;
        }
        void attemptBootstrap();
      }, delayMs);
    };

    const attemptBootstrap = async () => {
      if (!active || grokSessionId) {
        clearGrokSessionRetryTimer();
        return;
      }

      const sessionId = await bootstrapGrokSession();
      if (!active || grokSessionId || sessionId) {
        clearGrokSessionRetryTimer();
        return;
      }

      const backoff = Math.min(500 * (2 ** Math.min(grokSessionFailureCount.current, 6)), 5_000);
      scheduleRetry(backoff);
    };

    void attemptBootstrap();
    void refreshGrokStatus();

    const statusTimer = window.setInterval(() => {
      void refreshGrokStatus();
    }, POLL_GROK_STATUS_MS);

    return () => {
      active = false;
      window.clearInterval(statusTimer);
      clearGrokSessionRetryTimer();
      closeGrokStream();
    };
  }, [
    apiBase,
    closeGrokStream,
    bootstrapGrokSession,
    clearGrokSessionRetryTimer,
    grokSessionId,
    refreshGrokStatus
  ]);

  useEffect(() => {
    if (!grokSessionId) {
      setGrokMessages([]);
      return;
    }
    void refreshGrokHistory(grokSessionId);
  }, [grokSessionId, refreshGrokHistory]);

  const sendGrokPrompt = useCallback(async () => {
    if (grokSending) return;
    const message = grokInput.trim();
    if (!message) return;
    let sessionId = grokSessionId;
    if (!grokSessionId) {
      sessionId = (await bootstrapGrokSession()) ?? "";
      if (!sessionId) {
        setGrokError("Session not ready yet.");
        return;
      }
      setGrokSessionId(sessionId);
      setGrokError("");
    }

    setGrokSending(true);
    setGrokError("");
    setGrokStreamText("");
    setGrokMessages((prev) => [
      ...prev,
      {
        messageId: `local-${Date.now()}-${Math.random()}`,
        sessionId,
        role: "user",
        content: message,
        metadata: null,
        createdAt: new Date().toISOString()
      }
    ]);
    setGrokInput("");

    closeGrokStream();

    try {
      const response = await fetchJson<{ runId: string; streamUrl: string }>(`${apiBase}/grok/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message, clientId: `web-${Date.now()}` })
      });

      const streamUrl = new URL(response.streamUrl, apiBase).toString();
      const source = new EventSource(streamUrl);
      grokEventSourceRef.current = source;
      let streamFinished = false;

      const parseStreamPayload = (raw: unknown) => {
        if (typeof raw !== "string") return {};
        try {
          return JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return {};
        }
      };

      const finishStream = () => {
        if (streamFinished) return;
        streamFinished = true;
        setGrokSending(false);
        source.close();
        grokEventSourceRef.current = null;
      };

      const onToken = (event: MessageEvent) => {
        const payload = parseStreamPayload((event as MessageEvent).data) as { text?: string };
        if (payload.text) {
          setGrokStreamText((prev) => prev + payload.text);
        }
      };

      const onAction = (event: MessageEvent) => {
        const payload = parseStreamPayload((event as MessageEvent).data) as {
          txHash?: string;
          url?: string;
        };
        const txHash = typeof payload.txHash === "string" ? payload.txHash : "";
        if (txHash) {
          setGrokMessages((prev) => [
            ...prev,
            {
              messageId: `action-${Date.now()}`,
              sessionId,
              role: "action",
              content: txHash,
              metadata: { txHash, url: payload.url },
              createdAt: new Date().toISOString()
            }
          ]);
        }
      };

      const onFinal = (event: MessageEvent) => {
        const payload = parseStreamPayload((event as MessageEvent).data) as { text?: string };
        const text = payload.text ?? grokStreamText;
        if (text) {
          setGrokMessages((prev) => [
            ...prev,
            {
              messageId: `assistant-${Date.now()}`,
              sessionId,
              role: "assistant",
              content: text,
              metadata: null,
              createdAt: new Date().toISOString()
            }
          ]);
        }
        setGrokStreamText("");
        finishStream();
        void refreshGrokHistory(sessionId);
      };

      const onStreamError = (event: Event) => {
        if (streamFinished) return;
        let message = "Stream error.";
        if (event instanceof MessageEvent) {
          const payload = parseStreamPayload(event.data) as { error?: unknown };
          if (typeof payload.error === "string" && payload.error.length > 0) {
            message = payload.error;
          } else if (payload.error !== undefined) {
            message = `Stream error: ${String(payload.error)}`;
          }
        }
        finishStream();
        setGrokError(message);
      };

      source.addEventListener("token", onToken);
      source.addEventListener("action", onAction);
      source.addEventListener("final", onFinal);
      source.addEventListener("error", onStreamError);
    } catch (error) {
      setGrokSending(false);
      setGrokError(String(error));
    }
  }, [
    apiBase,
    bootstrapGrokSession,
    closeGrokStream,
    grokInput,
    grokSessionId,
    grokSending,
    refreshGrokHistory
  ]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("xlink");
    if (!token) return;
    if (chainIdFromMeta === null) return;
    if (xLinkHandledRef.current === token) return;
    xLinkHandledRef.current = token;

    let cancelled = false;

    const finalize = async () => {
      setXLinkMessage("");
      setXLinkStatus("awaiting_signature");
      const pending = await fetchJson<{
        address: string;
        xUserId: string;
        xUsername: string;
        message: string;
      }>(`${apiBase}/auth/x/pending/${encodeURIComponent(token)}`);
      if (cancelled) return;

      const provider = getInjectedProvider();
      if (!provider) {
        setXLinkStatus("error");
        setXLinkMessage("No injected wallet provider found");
        return;
      }

      const addr = walletAddressRef.current || (await connectWallet());
      if (pending.address.toLowerCase() !== addr.toLowerCase()) {
        setXLinkStatus("error");
        setXLinkMessage("Wallet mismatch from X link flow.");
        return;
      }

      const signature = (await provider.request({
        method: "personal_sign",
        params: [pending.message, addr]
      })) as unknown;
      if (cancelled) return;
      if (typeof signature !== "string") {
        setXLinkStatus("error");
        setXLinkMessage("Wallet did not return a signature");
        return;
      }

      setXLinkStatus("finalizing");
      await fetchJson(`${apiBase}/auth/x/finalize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: addr,
          linkToken: token,
          signature
        })
      });
      if (cancelled) return;

      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("xlink");
      window.history.replaceState({}, "", nextUrl.toString());

      setXLinkStatus("linked");
      setXLinkMessage(`Linked: @${pending.xUsername}`);
    };

    void finalize().catch((error) => {
      if (cancelled) return;
      setXLinkStatus("error");
      setXLinkMessage(`X link failed: ${String(error)}`);
    });

    return () => {
      cancelled = true;
    };
  }, [apiBase, chainIdFromMeta, connectWallet]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function loadContracts() {
      try {
        let data: unknown;
        try {
          data = await fetchJson(`${apiBase}/meta/contracts`, { signal });
        } catch {
          data = await fetchJson(`${apiBase}/contracts.latest.json`, { signal });
        }
        if (signal.aborted) return;
        setContractsText(JSON.stringify(data, null, 2));
        const detectedChainId =
          typeof (data as { chainId?: unknown }).chainId === "number"
            ? (data as { chainId: number }).chainId
            : null;
        setChainIdFromMeta(detectedChainId);

        if (detectedChainId === 143) {
          try {
            const external = await fetchJson<ExternalResponse>(`${apiBase}/meta/external`, { signal });
            if (signal.aborted) return;
            setExternalMmo(external);
          } catch {
            if (!signal.aborted) {
              setExternalMmo(null);
            }
          }
        } else {
          setExternalMmo(null);
        }
      } catch (error) {
        if (!signal.aborted) {
          setContractsText("contracts refresh failed");
        }
      }
    }

    async function loadLeaderboard() {
      try {
        const data = await fetchJson<{ leaderboardUpdatedAtBlock?: number; indexingLagBlocks?: number; items?: LeaderboardItem[] }>(
          `${apiBase}/leaderboard?mode=live&limit=100`,
          { signal },
        );
        if (signal.aborted) return;
        setLeaderboardItems(Array.isArray(data.items) ? data.items : []);
        setLeaderboardMeta(
          `updated block ${data.leaderboardUpdatedAtBlock ?? "-"} | lag ${data.indexingLagBlocks ?? "-"} blocks`,
        );
      } catch {
        if (!signal.aborted) {
          setLeaderboardMeta("leaderboard refresh failed");
        }
      }
    }

    async function loadDiagnostics() {
      try {
        const data = await fetchJson<DiagnosticsResponse>(`${apiBase}/meta/diagnostics`, { signal });
        if (signal.aborted) return;
        setDiagnostics(data);
      } catch {
        if (!signal.aborted) {
          setDiagnostics(null);
        }
      }
    }

    async function loadRewards() {
      try {
        const data = await fetchJson<RewardsResponse>(`${apiBase}/meta/rewards`, { signal });
        if (signal.aborted) return;
        setRewards(data);
      } catch {
        if (!signal.aborted) {
          setRewards(null);
        }
      }
    }

    async function loadEpochMeta() {
      const targetEpochId = rewards?.latestFinalizedEpoch?.epochId ?? rewards?.currentEpoch?.epochId;
      if (!targetEpochId) {
        setLeaderboardEpoch(null);
        return;
      }

      try {
        const data = await fetchJson<LeaderboardEpochMeta>(`${apiBase}/leaderboard/epochs/${targetEpochId}`, { signal });
        if (signal.aborted) return;
        setLeaderboardEpoch(data);
      } catch {
        if (!signal.aborted) {
          setLeaderboardEpoch((prev) => (prev?.epochId === targetEpochId ? prev : null));
        }
      }
    }

    async function loadRfqs() {
      try {
        const data = await fetchJson<MarketRfqsResponse>(
          `${apiBase}/market/rfqs?activeOnly=true&limit=100`,
          { signal },
        );
        if (signal.aborted) return;
        setMarketRfqs(data);
      } catch {
        if (!signal.aborted) {
          setMarketRfqs(null);
        }
      }
    }

    void Promise.all([loadContracts(), loadLeaderboard(), loadDiagnostics(), loadRewards(), loadRfqs()]);

    const leaderboardTimer = window.setInterval(() => {
      void loadLeaderboard();
    }, POLL_LEADERBOARD_MS);
    const diagnosticsTimer = window.setInterval(() => {
      void loadDiagnostics();
    }, POLL_DIAGNOSTICS_MS);
    const rewardsTimer = window.setInterval(() => {
      void loadRewards();
    }, POLL_REWARDS_MS);
    const contractsTimer = window.setInterval(() => {
      void loadContracts();
    }, POLL_CONTRACTS_MS);
    const epochTimer = window.setInterval(() => {
      void loadEpochMeta();
    }, POLL_REWARDS_MS);
    const rfqTimer = window.setInterval(() => {
      void loadRfqs();
    }, POLL_RFQ_MS);

    return () => {
      controller.abort();
      window.clearInterval(leaderboardTimer);
      window.clearInterval(diagnosticsTimer);
      window.clearInterval(rewardsTimer);
      window.clearInterval(contractsTimer);
      window.clearInterval(epochTimer);
      window.clearInterval(rfqTimer);
    };
  }, [apiBase, rewards?.currentEpoch?.epochId]);

  useEffect(() => {
    if (!walletAddress) {
      setAgentCharacters(null);
      setAgentState(null);
      setAgentClaims(null);
      return;
    }

    let cancelled = false;
    const loadCharacters = async () => {
      try {
        const data = await fetchJson<AgentCharactersResponse>(`${apiBase}/agent/characters/${walletAddress}`);
        if (cancelled) return;
        setAgentCharacters(data);
      } catch {
        if (!cancelled) {
          setAgentCharacters(null);
        }
      }
    };

    void loadCharacters();

    const timer = window.setInterval(() => {
      void loadCharacters();
    }, POLL_AGENT_STATE_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [apiBase, walletAddress]);

  useEffect(() => {
    const characterId = selectedAgentCharacter?.characterId;
    if (!walletAddress || !characterId) {
      setAgentState(null);
      setAgentClaims(null);
      return;
    }

    let cancelled = false;
    const loadAgentState = async () => {
      try {
        const [stateData, claimsData] = await Promise.all([
          fetchJson<AgentStateResponsePayload>(`${apiBase}/agent/state/${characterId}`),
          fetchJson<LeaderboardClaimsResponse>(`${apiBase}/leaderboard/claims/${characterId}`)
        ]);
        if (cancelled) return;
        setAgentState(getAgentStateFromResponse(stateData));
        setAgentClaims(claimsData ?? null);
      } catch {
        if (!cancelled) {
          setAgentState(null);
          setAgentClaims(null);
        }
      }
    };

    void loadAgentState();

    const timer = window.setInterval(() => {
      void loadAgentState();
    }, POLL_AGENT_STATE_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [apiBase, walletAddress, selectedAgentCharacter?.characterId]);

  const statusBarPool = useMemo(() => {
    const live = rewards?.currentEpoch?.feesForPlayersWei;
    if (!live) return "-";
    return `${formatNative(live)} MON`;
  }, [rewards]);

  const statusBarAvgPool = useMemo(() => {
    const avg = rewards?.avgFeesForPlayersWei;
    if (!avg) return "-";
    return `${formatNative(avg)} MON`;
  }, [rewards]);

  const statusBarIndex = useMemo(() => {
    const lag = diagnostics?.indexer?.chainHeadBlock;
    return lag !== undefined && lag !== null ? `head ${lag}` : "head -";
  }, [diagnostics]);

  const statusBarRfqs = useMemo(() => {
    const items = Array.isArray(marketRfqs?.items) ? marketRfqs.items : [];
    const active = items.filter((item) => item.active && !item.isExpired).length;
    return `${active}`;
  }, [marketRfqs]);

  const statusBarAgents = useMemo(() => {
    return String(leaderboardItems.length);
  }, [leaderboardItems]);

  const feedSorted = useMemo(() => {
    return [...feedItems] as FeedEvent[];
  }, [feedItems]);

  const leaderboardDiagnosticsText = useMemo(() => {
    const cursor = diagnostics?.indexer?.cursor;
    if (cursor) {
      return `cursor ${cursor.lastProcessedBlock}/${cursor.lastProcessedLogIndex}`;
    }
    return leaderboardMeta;
  }, [diagnostics, leaderboardMeta]);

  const openOverlay = useCallback((panel: OverlayPanel) => {
    const activeElement = document.activeElement;
    overlayReturnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    setActiveSection(panel);
    setOverlayPanel(panel);
    window.location.hash = `#${panel}`;
  }, []);

  const closeOverlay = useCallback(() => {
    setOverlayPanel(null);
    setActiveSection("feed");
    window.history.replaceState({}, "", "#");
    const restore = overlayReturnFocusRef.current;
    if (restore) {
      window.requestAnimationFrame(() => {
        restore.focus();
      });
    }
  }, []);

  const openDocs = useCallback(() => {
    openOverlay("docs");
  }, [openOverlay]);

  const openAbout = useCallback(() => {
    openOverlay("about");
  }, [openOverlay]);

  useEffect(() => {
    if (!overlayPanel) return;

    const dialog = overlayDialogRef.current;
    if (!dialog) return;

    const getFocusables = () => {
      return Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "a[href], button, input, textarea, select, [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((node) => !node.hasAttribute("disabled"));
    };

    const nodes = getFocusables();
    const first = nodes[0];
    if (first) {
      first.focus();
    } else {
      dialog.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeOverlay();
        return;
      }

      if (event.key !== "Tab") return;

      const focusables = getFocusables();
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const firstNode = focusables[0];
      const lastNode = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === firstNode) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && document.activeElement === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeOverlay, overlayPanel]);

  return (
    <div className="relative isolate h-screen overflow-hidden bg-transparent text-text-primary">
      <script id="chainmmo-agent-manifest" type="application/json" aria-hidden="true">
        {agentManifestJson}
      </script>

        <div className="desktop-only h-full" data-testid="terminal-root">
          <a href="#main-content" className="skip-link">
            Skip to main content
          </a>

          <div className="mx-auto flex h-full w-full max-w-[2560px] flex-col app-shell">
          <Navbar
            walletAddress={walletAddress}
            walletStatus={walletStatus}
            xLinkStatus={xLinkStatus}
            xLinkMessage={xLinkMessage}
            appLive={Boolean(diagnostics)}
            activeSection={activeSection}
            openAbout={openAbout}
            connectWallet={() => {
              void connectWallet().catch(() => {});
            }}
            disconnectWallet={disconnectWallet}
            startXLink={() => {
              void startXLink();
            }}
            chainId={chainIdFromMeta}
            openDocs={openDocs}
          />

          <main id="main-content" className="terminal-grid h-full min-h-0 min-w-0 overflow-hidden px-1 py-1">
            <div className="h-full min-h-0 overflow-hidden" id="feed">
              <LiveFeed entries={feedSorted} error={feedError} />
            </div>

            <div className="grid h-full min-h-0 grid-rows-[minmax(0,55fr)_minmax(0,45fr)] gap-1" id="leaderboard">
              <LeaderboardPanel
                items={leaderboardItems}
                diagnosticsText={leaderboardDiagnosticsText}
                walletAddress={walletAddress}
                grokAddress={grokStatus.agentAddress}
              />
              <RewardsPanel rewards={rewards} claims={agentClaims} agentState={agentState} epochMeta={leaderboardEpoch} />
            </div>

            <div className="grid h-full min-h-0 grid-rows-[minmax(0,55fr)_minmax(0,45fr)] gap-1" id="agent">
              <GrokArena
                status={grokStatus}
                sessionReady={Boolean(grokSessionId)}
                messages={grokMessages}
                streamText={grokStreamText}
                sending={grokSending}
                error={grokError}
                prompt={grokInput}
                onPrompt={(value) => setGrokInput(value)}
                onSend={() => {
                  void sendGrokPrompt();
                }}
                onReset={resetGrokArena}
              />
              <div
                key={walletAddress ? "wallet-connected" : "wallet-disconnected"}
                className="wallet-connection-fade"
              >
                <AgentStatePanel
                  walletAddress={walletAddress}
                  characters={agentCharacters}
                  state={agentState}
                  claims={agentClaims}
                  onboardingReadOnlyCmd={onboardingReadOnlyCmd}
                />
              </div>
            </div>

            <div className="grid h-full min-h-0 grid-rows-[minmax(0,55fr)_minmax(0,45fr)] gap-1" id="market">
              <RfqMarketPanel response={marketRfqs} />
              <EconomyPanel
                diagnostics={diagnostics}
                rewards={rewards}
                leaderboardLength={leaderboardItems.length}
                externalMmo={externalMmo}
                rfqs={marketRfqs}
              />
            </div>
          </main>

          <StatusBar
            rewardPoolText={statusBarPool}
            avgPoolText={statusBarAvgPool}
            rfqCountText={statusBarRfqs}
            agentsText={statusBarAgents}
            indexerText={statusBarIndex}
            diagnostics={diagnostics ?? undefined}
          />
        </div>

        {overlayPanel && (
          <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-bg-base/95 p-2"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeOverlay();
              }
            }}
          >
            <div
              ref={overlayDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="overlay-panel-title"
              tabIndex={-1}
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
            >
              {overlayPanel === "docs" ? (
                <Panel title={<span id="overlay-panel-title">DOCS / SOCIALS</span>} className="h-[90vh] w-[min(940px,96vw)]">
                  <div className="flex h-full flex-col gap-3">
                    <DocsLinksPanel contractsText={contractsText} apiBase={apiBase} />
                    <div className="mt-auto flex justify-end">
                      <button type="button" className="btn-secondary" onClick={closeOverlay}>
                        Close
                      </button>
                    </div>
                  </div>
                </Panel>
              ) : (
                <Panel title={<span id="overlay-panel-title">ABOUT CHAINMMO</span>} className="h-[90vh] w-[min(940px,96vw)]">
                  <div className="flex h-full flex-col gap-3">
                    <AboutPanel
                      onboardingReadOnlyCmd={onboardingReadOnlyCmd}
                      playbookQuickstartUrl={playbookQuickstartUrl}
                      contractsText={contractsText}
                      apiBase={apiBase}
                    />
                    <div className="mt-auto flex justify-end">
                      <button type="button" className="btn-secondary" onClick={closeOverlay}>
                        Close
                      </button>
                    </div>
                  </div>
                </Panel>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="desktop-warning fixed inset-0 z-50 hidden flex-col items-center justify-center bg-bg-base/95 p-4 text-center">
        <p className="text-balance text-t-lg font-semibold text-text-bright">ChainMMO Terminal is designed for desktop viewports (1024px+).</p>
        <p className="mt-3 text-t-base text-text-muted">Resize your window or use a larger screen.</p>
      </div>
    </div>
  );
}
