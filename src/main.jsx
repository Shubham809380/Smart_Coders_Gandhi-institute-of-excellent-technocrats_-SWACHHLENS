import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { heartbeatService } from "./services.js";
import { ThemeProvider } from "./contexts/ThemeContext.jsx";
import { LanguageProvider } from "./contexts/LanguageContext.jsx";
import MuiTheme from "./MuiTheme.jsx";
import App from "./App.jsx";
import "./styles.css";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "914852359886-14qs4268lk6ogubt6iho80lkheuffu66.apps.googleusercontent.com";

registerSW({ immediate: true });

// When a new service worker takes control (first install or update), reload once
// so the app never keeps running a stale or broken cached bundle.
let swRefreshing = false;
navigator.serviceWorker?.addEventListener("controllerchange", () => {
  if (swRefreshing) return;
  swRefreshing = true;
  window.location.reload();
});

heartbeatService.start();

createRoot(document.getElementById("root")).render(
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <ThemeProvider>
      <LanguageProvider>
        <MuiTheme>
          <App />
        </MuiTheme>
      </LanguageProvider>
    </ThemeProvider>
  </GoogleOAuthProvider>
);
