import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Berkeley Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Courier New", "monospace"],
        mono: ["Berkeley Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Courier New", "monospace"],
        display: ["Berkeley Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Courier New", "monospace"]
      },
      fontSize: {
        "t-xs": ["11px", { lineHeight: "14px", letterSpacing: "0.02em" }],
        "t-sm": ["12px", { lineHeight: "16px", letterSpacing: "0.02em" }],
        "t-base": ["14px", { lineHeight: "20px" }],
        "t-md": ["15px", { lineHeight: "20px" }],
        "t-lg": ["16px", { lineHeight: "22px", letterSpacing: "-0.01em" }],
        "t-xl": ["18px", { lineHeight: "24px", letterSpacing: "-0.01em" }],
        "t-display": ["22px", { lineHeight: "26px", letterSpacing: "-0.03em" }],
        "t-stat": ["20px", { lineHeight: "24px", letterSpacing: "-0.01em" }]
      },
      colors: {
        "bg-base": "#0C0D0F",
        "bg-surface": "#13141A",
        "bg-raised": "#1A1B23",
        "bg-overlay": "#21222C",
        "border-subtle": "#262733",
        "border-medium": "#33344A",
        "text-muted": "#5C5E72",
        "text-secondary": "#8B8DA3",
        "text-primary": "#C8CAD4",
        "text-bright": "#EAEBF0",
        muted: "#5C5E72",
        accent: "#C8AA6E",
        "accent-dim": "#9E8755",
        "accent-glow": "rgba(200,170,110,0.15)",
        positive: "#2ECC71",
        "positive-dim": "#1B7A43",
        warning: "#F39C12",
        negative: "#E74C3C",
        "negative-dim": "#8B2E25",
        info: "#5DADE2",
        "info-dim": "#2E6F8E"
      },
      boxShadow: {
        "panel-alert": "0 0 24px rgba(200,170,110,0.18)",
        "row-glow": "0 0 8px 0 rgba(200,170,110,0.18)",
      },
      animation: {
        stream: "stream-dot 1.2s ease-in-out infinite"
      },
      keyframes: {
        "stream-dot": {
          "0%,100%": { opacity: 0.4 },
          "50%": { opacity: 1 }
        }
      }
    }
  }
} satisfies Config;
