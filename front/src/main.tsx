import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { FatalErrorBoundary } from "./components/FatalErrorBoundary";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("missing #root");
}

createRoot(rootEl).render(
  <React.StrictMode>
    <FatalErrorBoundary>
      <App />
    </FatalErrorBoundary>
  </React.StrictMode>
);
