import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

function buildTimeCspPlugin() {
  return {
    name: "chainmmo-build-time-csp",
    apply: "build" as const,
    transformIndexHtml(html: string) {
      const csp = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "img-src 'self' data:",
        "font-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "connect-src 'self'",
      ].join("; ");

      const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

      const charset = `<meta charset="utf-8" />`;
      if (html.includes(charset)) {
        return html.replace(charset, `${charset}\n    ${meta}`);
      }
      return html.replace("<head>", `<head>\n    ${meta}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), buildTimeCspPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
  },
});
