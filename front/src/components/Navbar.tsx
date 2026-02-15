import { useState, type MouseEventHandler } from "react";
import logoUrl from "../../assets/logo.png";

type WalletStatus = "idle" | "starting" | "awaiting_signature" | "finalizing" | "linked" | "error";

interface NavbarProps {
  walletAddress: string;
  walletStatus: string;
  xLinkStatus: WalletStatus | "linked" | "error";
  xLinkMessage: string;
  appLive: boolean;
  activeSection: string;
  openAbout: () => void;
  connectWallet: MouseEventHandler<HTMLButtonElement>;
  disconnectWallet: MouseEventHandler<HTMLButtonElement>;
  startXLink: MouseEventHandler<HTMLButtonElement>;
  chainId: number | null;
  openDocs: () => void;
}

export function Navbar({
  walletAddress,
  walletStatus,
  xLinkStatus,
  xLinkMessage,
  appLive,
  activeSection,
  openAbout,
  connectWallet,
  disconnectWallet,
  startXLink,
  chainId,
  openDocs
}: NavbarProps) {
  const linkedHandle = xLinkMessage.startsWith("Linked: @") ? xLinkMessage.replace("Linked: ", "") : null;
  const xLinkLine =
    xLinkStatus === "linked"
      ? xLinkMessage
      : xLinkStatus === "error"
        ? xLinkMessage
        : xLinkStatus === "starting"
          ? "Opening X OAuth..."
          : xLinkStatus === "awaiting_signature"
            ? "Awaiting wallet signature..."
            : xLinkStatus === "finalizing"
              ? "Finalizing X link..."
              : "";
  const xButtonLabel =
    xLinkStatus === "starting"
      ? "Connecting X..."
      : xLinkStatus === "awaiting_signature"
        ? "Awaiting signature..."
        : xLinkStatus === "finalizing"
          ? "Finalizing..."
          : xLinkStatus === "linked" && linkedHandle
            ? linkedHandle
            : "Connect X";
  const xButtonDisabled =
    xLinkStatus === "starting" ||
    xLinkStatus === "awaiting_signature" ||
    xLinkStatus === "finalizing" ||
    xLinkStatus === "linked";
  const [logoSrc, setLogoSrc] = useState<string>(logoUrl);
  const appStatusDotClass = appLive
    ? "bg-positive/95 shadow-[0_0_10px_rgba(46,204,113,0.85)] animate-stream"
    : "bg-negative/90";

  return (
    <header className="h-[48px] border-b border-border-subtle bg-bg-base/55 backdrop-blur">
      <div className="mx-auto flex h-full max-w-[2560px] items-center gap-6 px-3" data-testid="navbar">
        <a
          href="#"
          className="mr-4 inline-flex items-center gap-2 text-t-display tracking-[-0.03em] text-accent"
          aria-label="CHAINMMO home"
        >
          <img
            src={logoSrc}
            alt="CHAINMMO logo"
            className="h-7 w-7 shrink-0 rounded-sm border border-border-subtle/60"
            onError={() => {
              if (logoSrc !== "/logo.png") {
                setLogoSrc("/logo.png");
              }
            }}
          />
          <span>CHAINMMO</span>
        </a>

        <nav className="flex items-center gap-2" aria-label="Primary">
          <a
            href="#about"
            className={`nav-link ${activeSection === "about" ? "active" : ""}`}
            onClick={(event) => {
              event.preventDefault();
              openAbout();
            }}
          >
            About
          </a>

          <a
            href="#docs"
            className={`nav-link ${activeSection === "docs" ? "active" : ""}`}
            onClick={(event) => {
              event.preventDefault();
              openDocs();
            }}
          >
            Docs
          </a>
          <span className="text-t-base font-medium tracking-[0.02em] text-text-muted">Benchmark your AI agent in the MMORPG on MONAD</span>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded border border-positive/40 bg-positive/12 px-2 py-0.5 text-t-xs font-semibold ${appLive ? "text-positive" : "border-border-subtle text-text-muted"}`}>
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 rounded-full ${appStatusDotClass}`}
            />
            {appLive ? "LIVE" : "OFF"}
          </span>
          <span className="mr-2 text-t-xs text-text-muted">chain {chainId ?? "-"}</span>
          <button
            type="button"
            className={walletAddress ? "btn-ghost h-8 inline-flex items-center gap-1.5" : "btn-primary inline-flex h-8 items-center !py-0"}
            onClick={walletAddress ? disconnectWallet : connectWallet}
            title={walletAddress || "Connect your EVM wallet"}
          >
            {walletAddress ? (
              <span key="connected" className="wallet-connection-fade inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-positive/90" />
                <span className="font-mono text-t-xs">{`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`}</span>
              </span>
            ) : <span key="disconnected" className="wallet-connection-fade inline-flex items-center gap-1.5">Connect Wallet</span>}
          </button>
          <button
            type="button"
            className="btn-secondary h-8"
            onClick={startXLink}
            disabled={xButtonDisabled}
          >
            {xButtonLabel}
          </button>
          <span className="ml-1 max-w-[220px] truncate text-t-xs text-text-muted" title={xLinkLine || walletStatus || " "}>
            {xLinkLine || walletStatus || ""}
          </span>
        </div>
      </div>
    </header>
  );
}
