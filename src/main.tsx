import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { PostHogProvider } from "posthog-js/react";

const root = createRoot(document.getElementById("root")!);

root.render(
  <React.StrictMode>
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={{
        api_host: "/relay-EjYu/",
        defaults: "2025-05-24",
        capture_exceptions: true,
        debug: import.meta.env.MODE === "development",
      }}
    >
      <App />
    </PostHogProvider>
  </React.StrictMode>
);
