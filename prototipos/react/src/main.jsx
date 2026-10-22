import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { cssDosTemas } from "@dashzon/core";
import "@dashzon/ui/estilo.css";
import { App } from "./App.jsx";

// As cores dos temas vêm de temas/temas.json (a mesma fonte do oficial e do celular).
const temas = document.createElement("style");
temas.id = "dashzon-temas";
temas.textContent = cssDosTemas();
document.head.prepend(temas);

createRoot(document.getElementById("raiz")).render(<StrictMode><App /></StrictMode>);
