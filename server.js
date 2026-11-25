const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "digital.html")));
app.get("/health", (req, res) => res.json({ status: "ok", app: "DigitalDesk" }));
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
app.post("/api/evaluate", (req, res) => {
const { gate, a, b } = req.body || {};
const gates = ["AND","OR","NOT","NAND","NOR","XOR","XNOR"];
if (!gates.includes(gate))
return res.status(400).json({ error: "Choose a valid gate." });
if (![0,1].includes(a) || (gate !== "NOT" && ![0,1].includes(b)))
return res.status(400).json({ error: "Inputs must be 0 or 1." });
return res.json({ gate, output: evaluate(gate, a, b) });
});
app.listen(PORT, () => console.log("DigitalDesk at http://localhost:" + PORT));