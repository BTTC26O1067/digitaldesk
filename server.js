const express = require("express");
const path = require("path");
const app = express();
// Render (and most hosts) provide the port through the PORT environment variable.
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "SAMEORIGIN");
  res.set("Referrer-Policy", "no-referrer");
  next();
});
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

function evaluate(gate, a, b) {
  switch (gate) {
    case "AND": return a & b;
    case "OR": return a | b;
    case "NOT": return a === 0 ? 1 : 0;
    case "NAND": return (a & b) ? 0 : 1;
    case "NOR": return (a | b) ? 0 : 1;
    case "XOR": return a !== b ? 1 : 0;
    case "XNOR": return a === b ? 1 : 0;
    default: throw new Error("Unknown gate");
  }
}

const GATES = ["AND", "OR", "NOT", "NAND", "NOR", "XOR", "XNOR"];

app.get("/", (req, res) => res.redirect("/digital.html"));
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.post("/api/evaluate", (req, res) => {
  const { gate, a, b } = req.body || {};
  if (typeof gate !== "string" || !GATES.includes(gate))
    return res.status(400).json({ error: "Choose a valid gate." });
  if (![0, 1].includes(a) || (gate !== "NOT" && ![0, 1].includes(b)))
    return res.status(400).json({ error: "Inputs must be 0 or 1." });
  return res.json({ gate, output: evaluate(gate, a, b) });
});

// Always answer API problems (bad JSON, oversized body) with JSON, not an HTML page.
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status === 500 ? "Server error." : "Invalid request body." });
});

if (require.main === module) {
  app.listen(PORT, () => console.log("DigitalDesk at http://localhost:" + PORT));
}
module.exports = app;
