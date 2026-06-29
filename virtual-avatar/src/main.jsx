import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import HomeSimulation from "./ui/HomeSimulation.jsx";
import "./styles.css";

const RootComponent = window.location.pathname === "/simulation" ? HomeSimulation : App;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>
);
