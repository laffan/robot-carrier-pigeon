import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { applyStoredNightVision } from "./lib/nightVision";

// Night vision from the first frame, before the settings have loaded.
applyStoredNightVision();

const app = mount(App, { target: document.getElementById("app")! });

export default app;
