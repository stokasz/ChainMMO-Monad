import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        body: [
          "Cormorant Garamond",
          "ui-serif",
          "Georgia",
          "Cambria",
          '"Times New Roman"',
          "Times",
          "serif"
        ],
        display: [
          "Cinzel",
          "Cormorant Garamond",
          "ui-serif",
          "Georgia",
          "Cambria",
          '"Times New Roman"',
          "Times",
          "serif"
        ],
        brand: [
          "Cinzel Decorative",
          "Cinzel",
          "Cormorant Garamond",
          "ui-serif",
          "Georgia",
          "Cambria",
          '"Times New Roman"',
          "Times",
          "serif"
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          '"Liberation Mono"',
          '"Courier New"',
          "monospace"
        ]
      },
      fontSize: {
        "ui-xs": ["0.75rem", { lineHeight: "1rem" }],
        "ui-sm": ["0.875rem", { lineHeight: "1.25rem" }],
        "ui-base": ["1rem", { lineHeight: "1.6rem" }],
        "ui-lg": ["1.125rem", { lineHeight: "1.8rem" }],
        "ui-xl": ["1.25rem", { lineHeight: "1.8rem" }],
        "ui-2xl": ["1.5rem", { lineHeight: "2.1rem" }],
        "ui-3xl": ["2rem", { lineHeight: "2.3rem", letterSpacing: "-0.02em" }],
        "ui-display": ["2.5rem", { lineHeight: "1.05", letterSpacing: "-0.03em" }]
      },
      colors: {
        bonfire: { DEFAULT: "#E8A545", dim: "#C17328", deep: "#8B4513" },
        ember: "#C17328",
        ash: "#8B8B8B",
        void: "#0A0A0A",
        blood: "#8B0000",
        steel: { DEFAULT: "#2A2A2E", light: "#3A3A40" },
        "souls-gold": "#C8AA6E"
      },
      keyframes: {
        "bonfire-flicker": {
          "0%, 100%": {
            boxShadow: "0 0 30px 8px rgba(232,165,69,0.12), 0 0 60px 20px rgba(193,115,40,0.06)"
          },
          "50%": {
            boxShadow: "0 0 40px 12px rgba(232,165,69,0.22), 0 0 80px 30px rgba(193,115,40,0.10)"
          }
        },
        "souls-pulse": {
          "0%, 100%": { textShadow: "0 0 8px rgba(200,170,110,0.3)" },
          "50%": { textShadow: "0 0 16px rgba(200,170,110,0.6)" }
        }
      },
      animation: {
        "bonfire-flicker": "bonfire-flicker 3s ease-in-out infinite",
        "souls-pulse": "souls-pulse 2s ease-in-out infinite"
      }
    }
  }
} satisfies Config;
