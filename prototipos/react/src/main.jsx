import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@dashzon/ui/estilo.css";
import { App } from "./App.jsx";

createRoot(document.getElementById("raiz")).render(<StrictMode><App /></StrictMode>);
