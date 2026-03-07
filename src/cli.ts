#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "./ui/app.js";

// Render app with clear on exit for clean terminal
const { waitUntilExit } = render(React.createElement(App), { exitOnCtrlC: true });

// Clear screen on exit
waitUntilExit().then(() => {
  process.stdout.write("\x1b[2J\x1b[H");
});
