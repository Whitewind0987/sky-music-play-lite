import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

if (import.meta.env.DEV) {
  const startupStartedAt = (
    window as Window & { __SMPL_STARTUP_STARTED_AT__?: number }
  ).__SMPL_STARTUP_STARTED_AT__;

  if (typeof startupStartedAt === "number") {
    console.info(
      "[startup] React entry",
      `${(performance.now() - startupStartedAt).toFixed(1)}ms`,
    );
  } else {
    console.info("[startup] React entry");
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
