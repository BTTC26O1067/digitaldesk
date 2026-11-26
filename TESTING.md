# DigitalDesk – Milestone 4: Testing & Validation

Run everything with `npm test` (Node built-in test runner, no extra packages).

## Result of the last run
41 tests, 41 passed, 0 failed (unit, integration, system, security, performance, deployment).
The same frontend tests were also run against the ORIGINAL `digital.js`: the 40-input truth table hung
(killed after 20 s) and 16 other tests failed, confirming the bugs below existed and are now fixed.

## Bugs found and fixed
| # | Bug (reproduced) | Fix |
|---|------------------|-----|
| 1 | Server ignored `PORT`, so Render could not reach the app | `process.env.PORT \|\| 3000` |
| 2 | `/` returned 404 | redirects to `/digital.html`; `/health` added |
| 3 | Malformed JSON to `/api/evaluate` returned an HTML error page | JSON error handler, 10 kb body limit |
| 4 | `X-Powered-By` exposed; no basic security headers | removed; nosniff / frame / referrer headers |
| 5 | Truth table with many inputs (2^n rows) froze the browser | capped at 12 inputs with a message |
| 6 | Switch values moved to the wrong input when a wire was added (values were keyed by letter) | values keyed per input point; old files converted |
| 7 | Gate positions reset to the grid whenever a gate was added; not saved | positions stored, saved, exported, restored |
| 8 | Import accepted bad files (unknown gates, duplicate ids, bad wires, cycles) | full validation before anything is replaced |
| 9 | No way to delete a wire | double-click a wire |

## Requirements check
Gates AND/OR/NOT/NAND/NOR/XOR/XNOR: tested. Simulation + truth table: tested. Wire colours: signal values
tested, colours themselves NOT visually tested. Save/Restore, JSON export/import: tested (logic only).
Circular connections: blocked when wiring and when importing: tested. Frontend/backend: API tested over HTTP.
Render: PORT handling tested.

## Not tested / remaining issues
* No real browser was available, so drag and drop, clicking ports, colours and the new layout were NOT tested in a browser. Please click through the app once yourself.
* The truth table shows one output (the last gate that feeds nothing). Circuits with several end gates (e.g. a half adder) show only one.
* Gate symbols, on-canvas switches and lamps were added after the first test round. Their logic is tested, but how they LOOK and behave under the mouse was not checked in a browser.
* Switches appear on open inputs (not as separate draggable components) and lamps on gates that feed nothing; there are no separate switch/lamp parts in the toolbox.
* No sequential circuits, waveform view or tutorial mode yet (listed in the original proposal).
* Saved circuits live in the browser's localStorage; there is no database or user accounts.
* No rate limiting on the API.
