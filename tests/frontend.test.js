const test = require("node:test");
const assert = require("node:assert/strict");
const { loadFrontend } = require("./load-frontend");

const GATE_TABLES = {
  AND: [0, 0, 0, 1], OR: [0, 1, 1, 1], NAND: [1, 1, 1, 0],
  NOR: [1, 0, 0, 0], XOR: [0, 1, 1, 0], XNOR: [1, 0, 0, 1],
};
const nand = () => ({ inputs: { A: 1, B: 1 }, gates: [
  { id: "gate2", type: "NOT", inputs: ["gate1"] },       // deliberately listed before its dependency
  { id: "gate1", type: "AND", inputs: ["A", "B"] } ], output: "gate2" });

test("UNIT: every two-input gate matches its truth table", () => {
  const f = loadFrontend();
  for (const [type, expected] of Object.entries(GATE_TABLES)) {
    [[0, 0], [0, 1], [1, 0], [1, 1]].forEach(([a, b], i) =>
      assert.equal(f.ddEvaluateGate(type, [a, b]), expected[i], `${type}(${a},${b})`));
  }
});
test("UNIT: NOT gate", () => {
  const f = loadFrontend();
  assert.equal(f.ddEvaluateGate("NOT", [0]), 1);
  assert.equal(f.ddEvaluateGate("NOT", [1]), 0);
});
test("UNIT: unknown gate throws", () => {
  assert.throws(() => loadFrontend().ddEvaluateGate("FOO", [1, 1]), /Unknown gate/);
});
test("UNIT: simulation evaluates dependencies in order (NOT listed before AND)", () => {
  const r = loadFrontend().ddSimulateCircuit(nand());
  assert.equal(r.output, 0);
  assert.equal(r.values.gate1, 1);
});
test("UNIT: missing connection and circular dependency are reported, not looped", () => {
  const f = loadFrontend();
  const missing = { inputs: { A: 1 }, gates: [{ id: "g", type: "AND", inputs: ["A", "Z"] }], output: "g" };
  assert.throws(() => f.ddSimulateCircuit(missing), /missing connection|circular/);
  const loop = { inputs: { A: 1 }, gates: [
    { id: "g1", type: "AND", inputs: ["A", "g2"] }, { id: "g2", type: "NOT", inputs: ["g1"] }], output: "g2" };
  assert.throws(() => f.ddSimulateCircuit(loop), /circular/);
});
test("UNIT: non-binary inputs rejected", () => {
  const c = nand(); c.inputs.A = 2;
  assert.throws(() => loadFrontend().ddSimulateCircuit(c), /Inputs must be 0 or 1/);
});
test("UNIT: truth table of AND→NOT equals NAND (1,1,1,0)", () => {
  const rows = loadFrontend().ddGenerateTruthTable(nand());
  assert.deepEqual(Array.from(rows, r => r.output), [1, 1, 1, 0]);
  assert.equal(rows.length, 4);
});
test("PERFORMANCE/BUG: truth table refuses >12 inputs instead of freezing", () => {
  const f = loadFrontend();
  const inputs = {}; for (let i = 0; i < 40; i++) inputs["I" + i] = 0;
  const t0 = Date.now();
  assert.throws(() => f.ddGenerateTruthTable({ inputs, gates: [], output: "I0" }), /limited to 12/);
  assert.ok(Date.now() - t0 < 100);
});
test("PERFORMANCE: 12-input truth table (4096 rows) finishes in under 2 seconds", () => {
  const f = loadFrontend();
  const inputs = {}, names = [];
  for (let i = 0; i < 12; i++) { inputs["I" + i] = 0; names.push("I" + i); }
  const gates = []; let prev = "I0";
  for (let i = 1; i < 12; i++) { gates.push({ id: "x" + i, type: "XOR", inputs: [prev, names[i]] }); prev = "x" + i; }
  const t0 = Date.now();
  const rows = f.ddGenerateTruthTable({ inputs, gates, output: prev });
  const ms = Date.now() - t0;
  assert.equal(rows.length, 4096);
  assert.ok(ms < 2000, "took " + ms + " ms");
});

// ---------- validation / save / restore / import ----------
const good = () => ({ version: 1, gateCount: 2, gates: [{ id: 1, type: "AND" }, { id: 2, type: "NOT" }],
  connections: [{ fromGateId: 1, toGateId: 2, inputIndex: 0 }], circuitInputValues: {} });
const bad = (mut) => { const d = good(); mut(d); return d; };

test("VALIDATION: valid project accepted (also old files without positions)", () => {
  const v = loadFrontend().ddValidateProject(good());
  assert.equal(v.gates.length, 2); assert.equal(v.connections.length, 1);
});
const REJECT = {
  "unknown gate type": [d => { d.gates[0].type = "FOO"; }, /Unknown gate type/],
  "duplicate gate id": [d => { d.gates[1].id = 1; }, /Duplicate gate id/],
  "connection to missing gate": [d => { d.connections[0].toGateId = 99; }, /missing gate/],
  "self connection": [d => { d.connections[0].toGateId = 1; }, /itself/],
  "input index too large for NOT": [d => { d.connections[0].inputIndex = 1; }, /invalid input point/],
  "negative input index": [d => { d.connections[0].inputIndex = -1; }, /invalid input point/],
  "two wires on one input": [d => { d.gates.push({ id: 3, type: "OR" }); d.connections.push({ fromGateId: 3, toGateId: 2, inputIndex: 0 }); }, /more than one wire/],
  "2-gate cycle": [d => { d.gates[0].type = "OR"; d.connections.push({ fromGateId: 2, toGateId: 1, inputIndex: 0 }); }, /circular/],
  "3-gate cycle": [d => { d.gates = [{ id: 1, type: "NOT" }, { id: 2, type: "NOT" }, { id: 3, type: "NOT" }];
      d.connections = [{ fromGateId: 1, toGateId: 2, inputIndex: 0 }, { fromGateId: 2, toGateId: 3, inputIndex: 0 }, { fromGateId: 3, toGateId: 1, inputIndex: 0 }]; }, /circular/],
};
for (const [name, [mut, re]] of Object.entries(REJECT)) {
  test("VALIDATION: rejects " + name, () => assert.throws(() => loadFrontend().ddValidateProject(bad(mut)), re));
}
test("VALIDATION: rejects non-objects / missing arrays", () => {
  const f = loadFrontend();
  for (const x of [null, undefined, 5, "x", {}, { gates: [] }, { gates: {}, connections: [] }])
    assert.throws(() => f.ddValidateProject(x), /Invalid DigitalDesk circuit file/);
});
test("VALIDATION: failed import leaves the current circuit untouched", () => {
  const f = loadFrontend();
  f.ddRestoreCircuit(good());
  assert.throws(() => f.ddRestoreCircuit(bad(d => { d.gates[0].type = "FOO"; })));
  assert.equal(f.run("gates.length"), 2);
  assert.equal(f.run("connections.length"), 1);
});
test("SAVE/RESTORE: export → import round trip keeps gates, wires, positions and switch values", () => {
  const f = loadFrontend();
  f.ddRestoreCircuit({ ...good(), gates: [{ id: 1, type: "AND", x: 40, y: 70 }, { id: 2, type: "NOT", x: 300, y: 90 }] });
  f.run('circuitInputValues["1:1"] = 1');
  const json = JSON.stringify(f.ddGetProjectData());
  const g = loadFrontend(); g.ddRestoreCircuit(JSON.parse(json));
  assert.deepEqual(JSON.parse(JSON.stringify(g.run("gates"))), JSON.parse(json).gates);
  assert.equal(g.run("gates[0].x"), 40); assert.equal(g.run("gates[1].y"), 90);
  assert.equal(g.run('circuitInputValues["1:1"]'), 1);
});
test("SAVE/RESTORE: Save Circuit writes to localStorage and startup restore reads it back", () => {
  const f = loadFrontend();
  f.ddRestoreCircuit(good()); f.ddSaveCircuit();
  assert.ok(f.store["digitaldesk-circuit"]);
  f.run("gates = []; connections = [];"); f.ddLoadSavedCircuit();
  assert.equal(f.run("gates.length"), 2);
});
test("SAVE/RESTORE: older file with letter-keyed input values (A,B) still restores correctly", () => {
  const f = loadFrontend();
  f.ddRestoreCircuit({ ...good(), gates: [{ id: 1, type: "AND" }, { id: 2, type: "NOT" }], circuitInputValues: { A: 1, B: 1 } });
  assert.equal(f.run('circuitInputValues["1:0"]'), 1);
  assert.equal(f.run('circuitInputValues["1:1"]'), 1);
});
test("BUG FIX: switch value stays on its own input when another wire is added", () => {
  const f = loadFrontend();
  // AND(1) and OR(2) unconnected: external inputs A,B (gate 1) and C,D (gate 2). Set gate 2 input 0 = 1.
  f.ddRestoreCircuit({ version: 1, gates: [{ id: 1, type: "AND" }, { id: 2, type: "OR" }], connections: [], circuitInputValues: {} });
  f.run('circuitInputValues["2:0"] = 1');
  // Wire OR's output... no: wire AND(1) into OR(2) input 1, which renames the external inputs.
  f.run("connections.push({fromGateId:1,toGateId:2,inputIndex:1})");
  const model = f.ddBuildWorkbenchCircuit();
  const name = model.inputNamesByPort["2:0"];
  assert.equal(model.circuit.inputs[name], 1, "value must still belong to gate 2 input 0");
  const others = Object.keys(model.circuit.inputs).filter(n => n !== name);
  others.forEach(n => assert.equal(model.circuit.inputs[n], 0));
});
test("CIRCULAR: wouldCreateCycle blocks a feedback wire but allows a forward wire", () => {
  const f = loadFrontend();
  f.run("gates=[{id:1,type:'AND'},{id:2,type:'NOT'},{id:3,type:'OR'}]; connections=[{fromGateId:1,toGateId:2,inputIndex:0},{fromGateId:2,toGateId:3,inputIndex:0}];");
  assert.equal(f.wouldCreateCycle(3, 1), true);   // 3 → 1 would close 1→2→3→1
  assert.equal(f.wouldCreateCycle(2, 1), true);
  assert.equal(f.wouldCreateCycle(1, 3), false);  // 1 → 3 is just a second forward path
});
test("INTEGRATION: workbench model for AND→NOT simulates as NAND with live signal values", () => {
  const f = loadFrontend();
  f.ddRestoreCircuit(good());
  const m = f.ddBuildWorkbenchCircuit();
  assert.equal(m.outputGateId, 2);
  assert.deepEqual(Array.from(f.ddGenerateTruthTable(m.circuit), r => r.output), [1, 1, 1, 0]);
  f.run('circuitInputValues["1:0"]=1; circuitInputValues["1:1"]=1');
  const r = f.ddSimulateCircuit(f.ddBuildWorkbenchCircuit().circuit);
  assert.equal(r.values.G1, 1); assert.equal(r.values.G2, 0);   // wire colours come from these values
});

test("UI: every gate type has a symbol drawing for the canvas and toolbox", () => {
  const f = loadFrontend();
  for (const type of ["AND", "OR", "NOT", "NAND", "NOR", "XOR", "XNOR"])
    assert.ok(f.run("DD_SYMBOLS." + type).includes("shape"), type);
});
test("UI: clicking an on-canvas switch flips only that input point (0→1→0)", () => {
  const f = loadFrontend();
  f.ddRestoreCircuit(good());
  f.ddTogglePortSwitch(1, 1);
  assert.equal(f.run('circuitInputValues["1:1"]'), 1);
  assert.equal(f.run('circuitInputValues["1:0"]'), undefined);
  f.ddTogglePortSwitch(1, 1);
  assert.equal(f.run('circuitInputValues["1:1"]'), 0);
});
test("UI: switch values change the simulated output (AND→NOT with both switches on gives 0)", () => {
  const f = loadFrontend();
  f.ddRestoreCircuit(good());
  f.ddTogglePortSwitch(1, 0); f.ddTogglePortSwitch(1, 1);
  const r = f.ddSimulateCircuit(f.ddBuildWorkbenchCircuit().circuit);
  assert.equal(r.output, 0);
});
