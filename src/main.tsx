import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import { App } from "./app";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
