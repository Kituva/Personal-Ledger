import React from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.jsx";
import "./styles.css";
import { requestPersistence } from "./db.js";

// Pick up a new build on the next launch without prompting.
registerSW({ immediate: true });

// Ask the browser to keep our data. Fire and forget.
requestPersistence();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
