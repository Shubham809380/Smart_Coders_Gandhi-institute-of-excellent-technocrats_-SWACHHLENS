import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { SocketProvider } from "./utils/socket.jsx";
import { heartbeatService } from "./services.js";
import { ThemeProvider } from "./contexts/ThemeContext.jsx";
import MuiTheme from "./MuiTheme.jsx";
import App from "./App.jsx";
import "./styles.css";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "914852359886-14qs4268lk6ogubt6iho80lkheuffu66.apps.googleusercontent.com";

registerSW({ immediate: true });
heartbeatService.start();

createRoot(document.getElementById("root")).render(
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <SocketProvider>
      <ThemeProvider>
        <MuiTheme>
          <App />
        </MuiTheme>
      </ThemeProvider>
    </SocketProvider>
  </GoogleOAuthProvider>
);
