const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const app = require("../server");

let server, base;
test.before(async () => { server = app.listen(0); await new Promise(r => server.once("listening", r)); base = "http://127.0.0.1:" + server.address().port; });
test.after(() => server.close());

const post = (body, raw) => fetch(base + "/api/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: raw ?? JSON.stringify(body) });
const EXP = { AND: a => a[0] & a[1], OR: a => a[0] | a[1], NAND: a => 1 - (a[0] & a[1]), NOR: a => 1 - (a[0] | a[1]), XOR: a => a[0] ^ a[1], XNOR: a => 1 - (a[0] ^ a[1]) };

test("API: all 24 two-input gate/input combinations are correct", async () => {
  for (const [gate, fn] of Object.entries(EXP)) for (const a of [0, 1]) for (const b of [0, 1]) {
    const r = await post({ gate, a, b }); const j = await r.json();
    assert.equal(r.status, 200); assert.deepEqual(j, { gate, output: fn([a, b]) }, `${gate} ${a} ${b}`);
  }
});
test("API: NOT gate ignores b and works without it", async () => {
  assert.deepEqual(await (await post({ gate: "NOT", a: 0 })).json(), { gate: "NOT", output: 1 });
  assert.deepEqual(await (await post({ gate: "NOT", a: 1 })).json(), { gate: "NOT", output: 0 });
});
test("SECURITY: invalid gates and inputs get 400 JSON errors", async () => {
  const cases = [{}, { gate: "FOO", a: 0, b: 0 }, { gate: "__proto__", a: 1, b: 1 }, { gate: "constructor", a: 1, b: 1 },
    { gate: ["AND"], a: 1, b: 1 }, { gate: { toString: 1 }, a: 1, b: 1 }, { gate: "AND", a: "1", b: 1 }, { gate: "AND", a: 2, b: 1 },
    { gate: "AND", a: true, b: 1 }, { gate: "AND", a: 1.5, b: 1 }, { gate: "AND", a: 1 }, { gate: "AND", a: null, b: null },
    { gate: "<script>alert(1)</script>", a: 1, b: 1 }];
  for (const c of cases) { const r = await post(c); assert.equal(r.status, 400, JSON.stringify(c)); assert.ok((await r.json()).error); }
});
test("SECURITY: malformed JSON → JSON 400 (not an HTML stack page)", async () => {
  const r = await post(null, "{bad"); assert.equal(r.status, 400);
  assert.match(r.headers.get("content-type"), /json/); assert.ok((await r.json()).error);
});
test("SECURITY: oversized body rejected with JSON error", async () => {
  const r = await post({ gate: "AND", a: 1, b: 1, pad: "x".repeat(50000) });
  assert.equal(r.status, 413); assert.match(r.headers.get("content-type"), /json/);
});
test("SECURITY: no X-Powered-By, nosniff and frame headers present", async () => {
  const r = await fetch(base + "/digital.html");
  assert.equal(r.headers.get("x-powered-by"), null);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-frame-options"), "SAMEORIGIN");
});
test("SECURITY: path traversal cannot read server.js or package.json", async () => {
  for (const p of ["/../server.js", "/..%2fserver.js", "/%2e%2e/package.json", "/server.js", "/package.json"]) {
    const r = await fetch(base + p); const t = await r.text();
    assert.ok(!t.includes("express") || r.status !== 200, p); assert.notEqual(r.status, 200, p);
  }
});
test("SYSTEM: static files served, / redirects to the app, /health ok", async () => {
  for (const f of ["digital.html", "digital.js", "digital.css"]) assert.equal((await fetch(base + "/" + f)).status, 200, f);
  const root = await fetch(base + "/", { redirect: "manual" });
  assert.equal(root.status, 302); assert.equal(root.headers.get("location"), "/digital.html");
  assert.deepEqual(await (await fetch(base + "/health")).json(), { status: "ok" });
});
test("INTEGRATION: the page references only files the server serves, and the toolbox + canvas ids exist", async () => {
  const html = await (await fetch(base + "/digital.html")).text();
  for (const id of ["run", "gate", "a", "b", "result", "truthTable", "addGateButton", "clearWorkbenchButton", "saveCircuitButton",
    "exportCircuitButton", "importCircuitButton", "importCircuitFile", "exampleCircuitButton", "circuitCanvas", "circuitControls", "gatePalette"])
    assert.ok(html.includes(`id="${id}"`), "missing #" + id);
  assert.equal((html.match(/data-gate="/g) || []).length, 7);
  assert.ok(html.includes('src="digital.js"') && html.includes('href="digital.css"'));
});
test("PERFORMANCE: 300 requests (30 in parallel) complete quickly with correct answers", async () => {
  const t0 = Date.now(); let ok = 0;
  for (let batch = 0; batch < 10; batch++) {
    const rs = await Promise.all(Array.from({ length: 30 }, (_, i) => post({ gate: "XOR", a: i & 1, b: 1 }).then(r => r.json())));
    rs.forEach((j, i) => { if (j.output === ((i & 1) ^ 1)) ok++; });
  }
  const ms = Date.now() - t0; assert.equal(ok, 300); assert.ok(ms < 5000, ms + " ms");
  console.log(`   300 requests in ${ms} ms`);
});
test("DEPLOYMENT: server listens on the PORT environment variable (Render requirement)", async () => {
  const port = 40000 + Math.floor(Math.random() * 10000);
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env: { ...process.env, PORT: String(port) } });
  try {
    let up = false;
    for (let i = 0; i < 30 && !up; i++) { await new Promise(r => setTimeout(r, 200)); try { up = (await fetch(`http://127.0.0.1:${port}/health`)).ok; } catch {} }
    assert.ok(up, "server did not start on PORT=" + port);
  } finally { child.kill(); }
});
