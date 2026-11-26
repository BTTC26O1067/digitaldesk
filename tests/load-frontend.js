// Loads public/digital.js inside a sandbox with a minimal fake DOM so the
// real frontend logic (simulation, validation, save/restore) can be tested in Node.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function makeElement() {
  const e = {
    innerHTML: "", textContent: "", style: {}, dataset: {}, children: [], value: "0",
    clientWidth: 800, clientHeight: 600, offsetWidth: 130, offsetHeight: 84,
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, setAttribute() {}, click() {}, remove() {}, setPointerCapture() {},
    appendChild(c) { e.children.push(c); return c; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 800, height: 600 }; },
  };
  return e;
}

function loadFrontend() {
  const cache = {};
  const store = {};
  const document = {
    getElementById(id) {
      if (id.startsWith("circuit-input-")) return null; // generated controls do not exist in the fake DOM
      return (cache[id] = cache[id] || makeElement());
    },
    querySelectorAll: () => [],
    createElement: () => makeElement(),
    createElementNS: () => makeElement(),
    body: makeElement(),
  };
  const ctx = vm.createContext({
    document, console: { log() {}, table() {}, warn() {}, error() {} },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    alert() {}, fetch: async () => ({ ok: true, json: async () => ({}) }),
    Blob: class {}, URL: { createObjectURL: () => "", revokeObjectURL() {} }, FileReader: class {},
  });
  const code = fs.readFileSync(path.join(__dirname, "..", "public", "digital.js"), "utf8");
  vm.runInContext(code, ctx, { filename: "digital.js" });
  ctx.run = src => vm.runInContext(src, ctx);   // access to the script's top-level state
  ctx.store = store;
  return ctx;
}
module.exports = { loadFrontend };
