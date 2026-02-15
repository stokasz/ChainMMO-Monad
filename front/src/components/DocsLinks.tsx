import { CopyButton } from "./shared/CopyButton";

interface DocsLinksProps {
  contractsText: string;
  apiBase: string;
}

export function DocsLinksPanel({ contractsText, apiBase }: DocsLinksProps) {
  const docsLinks = [
    {
      label: "Human Guide",
      href: `${apiBase}/meta/playbook/product-purpose?format=markdown`,
      badge: "DOCS"
    },
    {
      label: "AI Agent Guide",
      href: `${apiBase}/meta/playbook/agent-bootstrap-mcp-only-minimal?format=markdown`,
      badge: "AI"
    },
    {
      label: "Raw API",
      href: `${apiBase}/meta/capabilities`,
      badge: "API"
    }
  ];

  const socialLinks = [
    {
      label: "@stokasz",
      href: "https://x.com/stokasz",
      badge: "X"
    },
    {
      label: "GitHub",
      href: "https://github.com/stokasz/chainmmo-monad",
      badge: "GH"
    }
  ];

  return (
    <div id="docs" className="flex h-full min-h-0 flex-col gap-3 text-t-xs">
        <section className="panel-bodyless space-y-1.5">
          <div className="flex items-center justify-between">
            <h3 className="uppercase tracking-[0.08em] text-text-bright">DOCS</h3>
            <span className="rounded-full border border-accent/45 bg-accent/10 px-2 py-0.5 text-t-xs text-accent">quick links</span>
          </div>
          <p className="text-text-primary">
            Terminal-grade entry points for human and agent workflows.
          </p>
          <div className="grid gap-1">
            {docsLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex w-full items-center justify-between gap-2 rounded-sm border border-accent/40 bg-accent/12 px-2 py-1.5 text-text-bright hover:border-accent hover:bg-accent/22"
              >
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex h-5 min-w-8 shrink-0 justify-center rounded-full border border-accent/50 bg-accent/16 px-2 py-[1px] text-t-xs">
                    {link.badge}
                  </span>
                  <span>{link.label}</span>
                </span>
                <span className="text-accent transition-transform group-hover:translate-x-0.5">↗</span>
              </a>
            ))}
          </div>
        </section>

        <section className="panel-bodyless" id="socials">
          <h3 className="mb-1.5 uppercase tracking-[0.08em] text-text-bright">SOCIALS</h3>
          <ul className="grid gap-1.5">
            {socialLinks.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex w-full items-center justify-between gap-2 rounded-sm border border-white/25 bg-bg-overlay/75 px-2 py-1.5 text-text-bright hover:border-accent/70 hover:bg-bg-overlay"
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex h-5 min-w-8 shrink-0 items-center justify-center rounded-full border border-bg-overlay bg-bg-overlay/70 text-t-xs text-text-bright">
                      {link.badge}
                    </span>
                    <span>{link.label}</span>
                  </span>
                  <span className="text-accent transition-transform group-hover:translate-x-0.5">↗</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-2 flex min-h-0 flex-1 flex-col panel-bodyless">
          <h3 className="mb-1.5 uppercase tracking-[0.08em] text-text-bright">CONTRACTS JSON</h3>
          <pre className="min-h-0 flex-1 overflow-auto border border-border-subtle bg-bg-raised/55 px-2 py-1 panel-code">
            {contractsText}
          </pre>
          <div className="mt-2 flex justify-end">
            <CopyButton text={contractsText} />
          </div>
        </section>
    </div>
  );
}
