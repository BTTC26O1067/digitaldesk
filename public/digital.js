// ==========================================
// DIGITALDESK - LOGIC GATE TESTER
// ==========================================

// This section sends one gate calculation to the Express backend.
document.getElementById("run").addEventListener("click", async function () {
    const gate = document.getElementById("gate").value;
    const a = Number(document.getElementById("a").value);
    const b = Number(document.getElementById("b").value);
    const result = document.getElementById("result");

    try {
        const response = await fetch("/api/evaluate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gate, a, b })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Request failed");
        }

        result.textContent = gate + " output = " + data.output;
    } catch (error) {
        result.textContent = "Error: " + error.message;
    }
});


// ==========================================
// REUSABLE LOGIC GATE SIMULATION ENGINE
// ==========================================

function ddEvaluateGate(type, inputs) {
    switch (type) {
        case "AND":
            return inputs.every(value => value === 1) ? 1 : 0;

        case "OR":
            return inputs.some(value => value === 1) ? 1 : 0;

        case "NOT":
            return inputs[0] === 1 ? 0 : 1;

        case "NAND":
            return inputs.every(value => value === 1) ? 0 : 1;

        case "NOR":
            return inputs.some(value => value === 1) ? 0 : 1;

        case "XOR":
            return inputs.filter(value => value === 1).length % 2;

        case "XNOR":
            return inputs.filter(value => value === 1).length % 2 === 0 ? 1 : 0;

        default:
            throw new Error("Unknown gate type: " + type);
    }
}

// Evaluates a circuit after its input values have been supplied.
// A gate is evaluated only after all of its source signals are available.
function ddSimulateCircuit(circuit) {
    const values = { ...circuit.inputs };
    const pendingGates = [...circuit.gates];

    for (const name in values) {
        if (values[name] !== 0 && values[name] !== 1) {
            throw new Error("Inputs must be 0 or 1: " + name);
        }
    }

    while (pendingGates.length > 0) {
        let progress = false;

        for (let i = 0; i < pendingGates.length; i++) {
            const gate = pendingGates[i];

            const ready = gate.inputs.every(source =>
                Object.prototype.hasOwnProperty.call(values, source)
            );

            if (!ready) {
                continue;
            }

            const inputValues = gate.inputs.map(source => values[source]);
            values[gate.id] = ddEvaluateGate(gate.type, inputValues);

            pendingGates.splice(i, 1);
            i--;
            progress = true;
        }

        if (!progress) {
            throw new Error(
                "The circuit has a missing connection or a circular connection."
            );
        }
    }

    if (!Object.prototype.hasOwnProperty.call(values, circuit.output)) {
        throw new Error("The final output is not connected.");
    }

    return {
        values: values,
        output: values[circuit.output]
    };
}

// Generates all 0/1 combinations for the circuit's external inputs.
const DD_MAX_TABLE_INPUTS = 12;
function ddGenerateTruthTable(circuit) {
    const inputNames = Object.keys(circuit.inputs);
    if (inputNames.length > DD_MAX_TABLE_INPUTS) {
        throw new Error("Truth tables are limited to " + DD_MAX_TABLE_INPUTS + " inputs.");
    }
    const numberOfRows = 2 ** inputNames.length;
    const rows = [];

    for (let i = 0; i < numberOfRows; i++) {
        const testInputs = {};

        for (let j = 0; j < inputNames.length; j++) {
            testInputs[inputNames[j]] =
                (i >> (inputNames.length - 1 - j)) & 1;
        }

        const testCircuit = {
            ...circuit,
            inputs: testInputs
        };

        const result = ddSimulateCircuit(testCircuit);

        rows.push({
            ...testInputs,
            output: result.output
        });
    }

    return rows;
}


// ==========================================
// DIGITAL LOGIC WORKBENCH AND CIRCUIT BUILDER
// ==========================================

let gateCount = 0;
let gates = [];
let connections = [];
let selectedOutputGateId = null;
let circuitInputValues = {};
let latestSignalValues = null;

const gateSelect = document.getElementById("workbenchGate");
const addGateButton = document.getElementById("addGateButton");
const clearWorkbenchButton = document.getElementById("clearWorkbenchButton");
const workbench = document.getElementById("gateWorkbench");
const circuitCanvas = document.getElementById("circuitCanvas");
const circuitControls = document.getElementById("circuitControls");
const truthTableHead = document.getElementById("truthTableHead");
const truthTableBody = document.getElementById("truthTableBody");
const truthTableMessage = document.getElementById("truthTableMessage");


// Build a simulation model from the gates and wires currently on the canvas.
// Every unconnected gate input becomes an external input such as A, B, or C.
function ddBuildWorkbenchCircuit() {
    const externalInputs = {};
    const inputNamesByPort = {};
    const portKeyByName = {};
    let inputNumber = 0;

    function getInputName() {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const name = inputNumber < alphabet.length
            ? alphabet[inputNumber]
            : "IN" + (inputNumber + 1);

        inputNumber++;
        return name;
    }

    const circuitGates = gates.map(gate => {
        const inputCount = gate.type === "NOT" ? 1 : 2;
        const gateInputs = [];

        for (let inputIndex = 0; inputIndex < inputCount; inputIndex++) {
            const connection = connections.find(item =>
                item.toGateId === gate.id && item.inputIndex === inputIndex
            );

            if (connection) {
                gateInputs.push("G" + connection.fromGateId);
            } else {
                const inputName = getInputName();
                const portKey = gate.id + ":" + inputIndex;
                gateInputs.push(inputName);
                externalInputs[inputName] = circuitInputValues[portKey] === 1 ? 1 : 0;
                inputNamesByPort[portKey] = inputName;
                portKeyByName[inputName] = portKey;
            }
        }

        return {
            id: "G" + gate.id,
            type: gate.type,
            inputs: gateInputs
        };
    });

    // The final output is the gate that does not feed another gate.
    const gatesUsedAsSources = new Set(
        connections.map(connection => connection.fromGateId)
    );

    const outputCandidates = gates.filter(gate =>
        !gatesUsedAsSources.has(gate.id)
    );

    const outputGate = outputCandidates.length > 0
        ? outputCandidates[outputCandidates.length - 1]
        : gates[gates.length - 1];

    return {
        circuit: {
            inputs: externalInputs,
            gates: circuitGates,
            output: "G" + outputGate.id
        },
        inputNamesByPort: inputNamesByPort,
        portKeyByName: portKeyByName,
        outputGateId: outputGate.id
    };
}


// Check whether adding source -> destination would create a circular circuit.
function wouldCreateCycle(sourceGateId, destinationGateId) {
    const stack = [destinationGateId];
    const visited = new Set();

    while (stack.length > 0) {
        const currentGateId = stack.pop();

        if (currentGateId === sourceGateId) {
            return true;
        }

        if (visited.has(currentGateId)) {
            continue;
        }

        visited.add(currentGateId);

        connections.forEach(connection => {
            if (connection.fromGateId === currentGateId) {
                stack.push(connection.toGateId);
            }
        });
    }

    return false;
}


// Update the signal label shown inside every gate on the canvas.
function updateGateSignalLabels(signalValues) {
    gates.forEach(gate => {
        const signalLabel = document.getElementById("gate-signal-" + gate.id);
        const value = signalValues ? signalValues["G" + gate.id] : undefined;
        const symbolBox = document.getElementById("canvas-gate-" + gate.id);
        if (symbolBox) symbolBox.classList.toggle("out-1", value === 1);

        if (!signalLabel) {
            return;
        }

        if (value === 0 || value === 1) {
            signalLabel.textContent = "Output: " + value;
            signalLabel.classList.toggle("signal-one", value === 1);
            signalLabel.classList.toggle("signal-zero", value === 0);
        } else {
            signalLabel.textContent = "Output: —";
            signalLabel.classList.remove("signal-one", "signal-zero");
        }
    });
}


// Draw the saved connections as SVG lines.
function drawConnections(wireLayer) {
    wireLayer.innerHTML = "";

    const canvasRect = circuitCanvas.getBoundingClientRect();

    connections.forEach(connection => {
        const outputPort = document.getElementById(
            "output-port-" + connection.fromGateId
        );

        const inputPort = document.getElementById(
            "input-port-" + connection.toGateId + "-" + connection.inputIndex
        );

        if (!outputPort || !inputPort) {
            return;
        }

        const outputRect = outputPort.getBoundingClientRect();
        const inputRect = inputPort.getBoundingClientRect();

        const x1 = outputRect.left + outputRect.width / 2 - canvasRect.left;
        const y1 = outputRect.top + outputRect.height / 2 - canvasRect.top;
        const x2 = inputRect.left + inputRect.width / 2 - canvasRect.left;
        const y2 = inputRect.top + inputRect.height / 2 - canvasRect.top;

        const wire = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path"
        );

        const bend = Math.max(40, Math.abs(x2 - x1) / 2);
        wire.setAttribute("d", "M" + x1 + " " + y1 + " C" + (x1 + bend) + " " + y1 +
            " " + (x2 - bend) + " " + y2 + " " + x2 + " " + y2);
        wire.setAttribute("fill", "none");
        const sourceValue = latestSignalValues
            ? latestSignalValues["G" + connection.fromGateId]
            : undefined;

        // Green means the wire carries 1; grey means it carries 0 or is not simulated yet.
        wire.setAttribute(
            "stroke",
            sourceValue === 1 ? "#16a34a" : sourceValue === 0 ? "#94a3b8" : "#2563eb"
        );
        wire.setAttribute("stroke-width", sourceValue === 1 ? "4" : "3");
        wire.setAttribute("data-signal", sourceValue === 0 || sourceValue === 1
            ? String(sourceValue)
            : "unknown");
        wire.setAttribute("stroke-linecap", "round");
        wire.style.pointerEvents = "stroke";
        wire.style.cursor = "pointer";
        wire.addEventListener("dblclick", function () {
            connections = connections.filter(item => item !== connection);
            drawConnections(wireLayer);
            renderCircuitControls();
        });

        wireLayer.appendChild(wire);
    });
}


// Create the input selectors and simulation button beneath the canvas.
function renderCircuitControls() {
    if (gates.length === 0) {
        circuitControls.innerHTML =
            "<p>Add gates to the canvas to configure and simulate a circuit.</p>";
        return;
    }

    const model = ddBuildWorkbenchCircuit();
    const inputNames = Object.keys(model.circuit.inputs);

    circuitControls.innerHTML = "";

    const heading = document.createElement("h3");
    heading.textContent = "Circuit Inputs";
    circuitControls.appendChild(heading);

    const explanation = document.createElement("p");
    explanation.textContent =
        "Each unconnected input point is treated as an external binary input.";
    circuitControls.appendChild(explanation);

    const inputContainer = document.createElement("div");
    inputContainer.className = "input-controls";

    inputNames.forEach(inputName => {
        const wrapper = document.createElement("div");
        wrapper.className = "input-control";

        const label = document.createElement("label");
        label.htmlFor = "circuit-input-" + inputName;
        label.textContent = "Input " + inputName;

        const select = document.createElement("select");
        select.id = "circuit-input-" + inputName;

        [0, 1].forEach(value => {
            const option = document.createElement("option");
            option.value = String(value);
            option.textContent = String(value);
            select.appendChild(option);
        });

        select.value = String(model.circuit.inputs[inputName]);

        select.addEventListener("change", function () {
            circuitInputValues[model.portKeyByName[inputName]] = Number(select.value);
            simulateWorkbenchCircuit();
        });

        wrapper.appendChild(label);
        wrapper.appendChild(select);
        inputContainer.appendChild(wrapper);
    });

    if (inputNames.length === 0) {
        const noInputs = document.createElement("p");
        noInputs.textContent =
            "All gate inputs are connected to other gates. No external inputs are needed.";
        inputContainer.appendChild(noInputs);
    }

    circuitControls.appendChild(inputContainer);

    const simulateButton = document.createElement("button");
    simulateButton.id = "simulateCircuitButton";
    simulateButton.textContent = "Simulate Circuit";
    simulateButton.addEventListener("click", simulateWorkbenchCircuit);
    circuitControls.appendChild(simulateButton);

    const output = document.createElement("p");
    output.id = "circuitOutput";
    output.textContent = "Circuit output will appear here.";
    circuitControls.appendChild(output);

    // Keep the displayed output and truth table synchronized with the current circuit.
    simulateWorkbenchCircuit();
}


// Display truth-table rows in the HTML table.
function ddDisplayTruthTable(rows) {
    truthTableHead.innerHTML = "";
    truthTableBody.innerHTML = "";

    if (!rows || rows.length === 0) {
        truthTableMessage.textContent =
            "No truth-table results are available yet.";
        return;
    }

    truthTableMessage.textContent =
        "Truth table generated from the circuit currently on the canvas.";

    const columns = Object.keys(rows[0]);
    const headerRow = document.createElement("tr");

    columns.forEach(column => {
        const heading = document.createElement("th");
        heading.textContent = column === "output" ? "Final Output" : "Input " + column;
        headerRow.appendChild(heading);
    });

    truthTableHead.appendChild(headerRow);

    rows.forEach(row => {
        const tableRow = document.createElement("tr");

        columns.forEach(column => {
            const cell = document.createElement("td");
            cell.textContent = row[column];
            tableRow.appendChild(cell);
        });

        truthTableBody.appendChild(tableRow);
    });
}


// Run the actual circuit made by the user and generate its truth table.
function simulateWorkbenchCircuit() {
    if (gates.length === 0) {
        return;
    }

    try {
        const model = ddBuildWorkbenchCircuit();
        const circuit = model.circuit;

        // Read the latest values from the input selectors.
        Object.keys(circuit.inputs).forEach(inputName => {
            const inputSelect = document.getElementById("circuit-input-" + inputName);
            if (inputSelect) {
                circuit.inputs[inputName] = Number(inputSelect.value);
                circuitInputValues[model.portKeyByName[inputName]] = Number(inputSelect.value);
            }
        });

        const result = ddSimulateCircuit(circuit);
        const outputElement = document.getElementById("circuitOutput");

        latestSignalValues = result.values;
        updateGateSignalLabels(latestSignalValues);
        ddUpdateSwitches(model);

        const wireLayer = document.getElementById("wireLayer");
        if (wireLayer) {
            drawConnections(wireLayer);
        }

        outputElement.textContent =
            "Final output (Gate " + model.outputGateId + "): " + result.output;

        console.log("Workbench signal values:", result.values);
        console.log("Workbench final output:", result.output);

        if (Object.keys(circuit.inputs).length > DD_MAX_TABLE_INPUTS) {
            ddDisplayTruthTable([]);
            truthTableMessage.textContent = "This circuit has more than " +
                DD_MAX_TABLE_INPUTS + " inputs, so the truth table is not generated.";
        } else {
            const truthTable = ddGenerateTruthTable(circuit);
            ddDisplayTruthTable(truthTable);
            console.table(truthTable);
        }
    } catch (error) {
        const outputElement = document.getElementById("circuitOutput");
        outputElement.textContent = "Simulation error: " + error.message;
        latestSignalValues = null;
        updateGateSignalLabels(null);

        const wireLayer = document.getElementById("wireLayer");
        if (wireLayer) {
            drawConnections(wireLayer);
        }

        truthTableHead.innerHTML = "";
        truthTableBody.innerHTML = "";
        truthTableMessage.textContent = "The circuit could not be simulated.";
    }
}


// ---------- Gate symbols, on-canvas switches and lamps ----------
const DD_SYMBOLS = (() => {
    const L = (x1, x2, y) => '<path class="lead" d="M' + x1 + ' ' + y + 'H' + x2 + '"/>';
    const ins = x => L(0, x, 28) + L(0, x, 56);
    const out = x => '<path class="lead lead-out" d="M' + x + ' 42H130"/>';
    const bub = x => '<circle class="shape" cx="' + x + '" cy="42" r="6"/>';
    const AND = '<path class="shape" d="M22 12H58A30 30 0 0 1 58 72H22Z"/>';
    const OR = '<path class="shape" d="M18 12Q62 12 92 42Q62 72 18 72Q38 42 18 12Z"/>';
    const XB = '<path class="shape back" d="M8 12Q28 42 8 72"/>';
    return {
        AND: ins(22) + out(88) + AND,
        NAND: ins(22) + out(100) + AND + bub(94),
        OR: ins(26) + out(92) + OR,
        NOR: ins(26) + out(104) + OR + bub(98),
        XOR: ins(14) + out(92) + OR + XB,
        XNOR: ins(14) + out(104) + OR + XB + bub(98),
        NOT: L(0, 24, 42) + out(96) + '<path class="shape" d="M24 14L84 42L24 70Z"/>' + bub(90)
    };
})();

function ddGateSymbol(type) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 130 84");
    svg.setAttribute("class", "gate-symbol");
    svg.innerHTML = DD_SYMBOLS[type] || "";
    return svg;
}

// Flip the switch drawn on an unconnected input point.
function ddTogglePortSwitch(gateId, inputIndex) {
    const key = gateId + ":" + inputIndex;
    circuitInputValues[key] = circuitInputValues[key] === 1 ? 0 : 1;
    renderCircuitControls();   // rebuilds the input list from circuitInputValues and re-simulates
}

// Show a switch on every open input and a lamp on every gate that feeds nothing.
function ddUpdateSwitches(model) {
    gates.forEach(gate => {
        const inputCount = gate.type === "NOT" ? 1 : 2;
        for (let i = 0; i < inputCount; i++) {
            const el = document.getElementById("port-switch-" + gate.id + "-" + i);
            if (!el) continue;
            const key = gate.id + ":" + i;
            const open = Object.prototype.hasOwnProperty.call(model.inputNamesByPort, key);
            el.style.display = open ? "block" : "none";
            el.className = "port-switch" + (circuitInputValues[key] === 1 ? " on" : "");
            el.textContent = circuitInputValues[key] === 1 ? "1" : "0";
            el.title = open ? "Input " + model.inputNamesByPort[key] + ": click to switch 0 / 1" : "";
        }
        const lamp = document.getElementById("out-lamp-" + gate.id);
        if (lamp) {
            const isEnd = !connections.some(c => c.fromGateId === gate.id);
            lamp.style.display = isEnd ? "block" : "none";
            lamp.className = "out-lamp" + (latestSignalValues && latestSignalValues["G" + gate.id] === 1 ? " on" : "");
        }
    });
}

// Rebuild the workbench cards and circuit canvas.
function displayGates() {
    workbench.innerHTML = "";
    circuitCanvas.innerHTML = "";

    if (gates.length === 0) {
        workbench.innerHTML = "<p>No gates added yet.</p>";
        circuitCanvas.innerHTML =
            "<p id='canvasMessage'>Your circuit canvas is empty. Add gates to start building!</p>";

        renderCircuitControls();
        ddDisplayTruthTable([]);
        return;
    }

    // The SVG layer is behind the gate components.
    const wireLayer = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg"
    );
    wireLayer.id = "wireLayer";
    circuitCanvas.appendChild(wireLayer);

    gates.forEach((gate, index) => {
        // Workbench card
        const gateCard = document.createElement("div");
        gateCard.className = "gate-card";
        gateCard.id = "gate-" + gate.id;

        const gateHeading = document.createElement("h3");
        gateHeading.textContent = "Gate " + (index + 1);

        const gateInfo = document.createElement("p");
        gateInfo.textContent = "Gate Type: " + gate.type;

        const removeButton = document.createElement("button");
        removeButton.className = "remove-gate-button";
        removeButton.textContent = "Remove";

        removeButton.addEventListener("click", function () {
            gates = gates.filter(item => item.id !== gate.id);

            connections = connections.filter(connection =>
                connection.fromGateId !== gate.id &&
                connection.toGateId !== gate.id
            );

            if (selectedOutputGateId === gate.id) {
                selectedOutputGateId = null;
            }

            displayGates();
        });

        gateCard.appendChild(gateHeading);
        gateCard.appendChild(gateInfo);
        gateCard.appendChild(removeButton);
        workbench.appendChild(gateCard);


        // Gate on the circuit canvas
        const canvasGate = document.createElement("div");
        canvasGate.className = "canvas-gate";
        canvasGate.id = "canvas-gate-" + gate.id;

        const canvasHeading = document.createElement("h3");
        canvasHeading.textContent = gate.type + " Gate";

        const canvasNumber = document.createElement("p");
        canvasNumber.textContent = "Gate " + (index + 1);

        canvasGate.appendChild(canvasHeading);
        canvasGate.appendChild(canvasNumber);
        canvasGate.appendChild(ddGateSymbol(gate.type));

        const signalLabel = document.createElement("p");
        signalLabel.id = "gate-signal-" + gate.id;
        signalLabel.className = "gate-signal-value";
        signalLabel.textContent = "Output: —";
        canvasGate.appendChild(signalLabel);

        // Create the input ports. NOT has one input; other gates have two.
        const inputCount = gate.type === "NOT" ? 1 : 2;

        for (let inputIndex = 0; inputIndex < inputCount; inputIndex++) {
            const inputPort = document.createElement("div");
            inputPort.id = "input-port-" + gate.id + "-" + inputIndex;
            inputPort.className = "gate-input-port";
            inputPort.style.top =
                ((inputIndex + 1) * 100 / (inputCount + 1)) + "%";

            const portSwitch = document.createElement("div");
            portSwitch.id = "port-switch-" + gate.id + "-" + inputIndex;
            portSwitch.className = "port-switch";
            portSwitch.addEventListener("pointerdown", function (event) {
                event.stopPropagation();
                ddTogglePortSwitch(gate.id, inputIndex);
            });
            inputPort.appendChild(portSwitch);

            inputPort.addEventListener("pointerdown", function (event) {
                event.stopPropagation();

                if (selectedOutputGateId === null) {
                    alert("Select an output point first, then select this input point.");
                    return;
                }

                if (selectedOutputGateId === gate.id) {
                    alert("A gate cannot connect to itself.");
                    return;
                }

                // Temporarily ignore the old wire on this input while checking the new route.
                const previousConnections = connections;
                connections = connections.filter(connection =>
                    !(connection.toGateId === gate.id &&
                      connection.inputIndex === inputIndex)
                );

                if (wouldCreateCycle(selectedOutputGateId, gate.id)) {
                    connections = previousConnections;
                    selectedOutputGateId = null;
                    document.querySelectorAll(".gate-output-port").forEach(port => {
                        port.classList.remove("selected");
                    });
                    alert("This connection would create a circular circuit. Choose another connection.");
                    return;
                }

                connections.push({
                    fromGateId: selectedOutputGateId,
                    toGateId: gate.id,
                    inputIndex: inputIndex
                });

                selectedOutputGateId = null;

                document.querySelectorAll(".gate-output-port").forEach(port => {
                    port.classList.remove("selected");
                });

                drawConnections(wireLayer);
                renderCircuitControls();
            });

            canvasGate.appendChild(inputPort);
        }

        // Create the output port.
        const outputPort = document.createElement("div");
        outputPort.id = "output-port-" + gate.id;
        outputPort.className = "gate-output-port";
        const lamp = document.createElement("div");
        lamp.id = "out-lamp-" + gate.id;
        lamp.className = "out-lamp";
        outputPort.appendChild(lamp);

        outputPort.addEventListener("pointerdown", function (event) {
            event.stopPropagation();

            if (selectedOutputGateId === gate.id) {
                selectedOutputGateId = null;
                outputPort.classList.remove("selected");
                return;
            }

            document.querySelectorAll(".gate-output-port").forEach(port => {
                port.classList.remove("selected");
            });

            selectedOutputGateId = gate.id;
            outputPort.classList.add("selected");
        });

        canvasGate.appendChild(outputPort);

        // Initial gate positions. Dragging changes these positions.
        if (!Number.isFinite(gate.x) || !Number.isFinite(gate.y)) {
            gate.x = 86 + (index % 5) * 190;
            gate.y = 25 + Math.floor(index / 5) * 130;
        }
        canvasGate.style.left = gate.x + "px";
        canvasGate.style.top = gate.y + "px";

        // Drag support
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;

        canvasGate.addEventListener("pointerdown", function (event) {
            isDragging = true;

            const gateRect = canvasGate.getBoundingClientRect();
            offsetX = event.clientX - gateRect.left;
            offsetY = event.clientY - gateRect.top;

            canvasGate.setPointerCapture(event.pointerId);
        });

        canvasGate.addEventListener("pointermove", function (event) {
            if (!isDragging) {
                return;
            }

            const canvasRect = circuitCanvas.getBoundingClientRect();

            let newLeft = event.clientX - canvasRect.left - offsetX;
            let newTop = event.clientY - canvasRect.top - offsetY;

            newLeft = Math.max(66, Math.min(
                newLeft,
                circuitCanvas.clientWidth - canvasGate.offsetWidth - 46
            ));

            newTop = Math.max(0, Math.min(
                newTop,
                circuitCanvas.clientHeight - canvasGate.offsetHeight
            ));

            canvasGate.style.left = newLeft + "px";
            canvasGate.style.top = newTop + "px";
            gate.x = newLeft;
            gate.y = newTop;

            drawConnections(wireLayer);
        });

        canvasGate.addEventListener("pointerup", function () {
            isDragging = false;
        });

        canvasGate.addEventListener("pointercancel", function () {
            isDragging = false;
        });

        circuitCanvas.appendChild(canvasGate);
    });

    drawConnections(wireLayer);
    renderCircuitControls();
}



// Project tools: save locally, export/import JSON, and load a NAND demonstration.
function ddGetProjectData() {
    return { version: 1, gateCount, gates, connections, circuitInputValues };
}
function ddSaveCircuit() {
    try {
        localStorage.setItem("digitaldesk-circuit", JSON.stringify(ddGetProjectData()));
        alert("Circuit saved in this browser.");
    } catch (err) {
        alert("Unable to save circuit: " + err.message);
    }
}
const DD_GATE_TYPES = ["AND", "OR", "NOT", "NAND", "NOR", "XOR", "XNOR"];

// Checks a saved/imported project completely before anything on screen is replaced.
function ddValidateProject(data) {
    if (!data || !Array.isArray(data.gates) || !Array.isArray(data.connections)) {
        throw new Error("Invalid DigitalDesk circuit file.");
    }
    const ids = new Set();
    const newGates = data.gates.map(g => {
        const id = Number(g && g.id), type = String(g && g.type);
        if (!Number.isInteger(id) || id < 1) throw new Error("A gate has an invalid id.");
        if (ids.has(id)) throw new Error("Duplicate gate id " + id + ".");
        if (!DD_GATE_TYPES.includes(type)) throw new Error("Unknown gate type: " + type);
        ids.add(id);
        const gate = { id, type };
        if (Number.isFinite(g.x) && Number.isFinite(g.y)) { gate.x = g.x; gate.y = g.y; }
        return gate;
    });
    const used = new Set(), indegree = {}, next = {};
    ids.forEach(id => { indegree[id] = 0; next[id] = []; });
    const newConnections = data.connections.map(c => {
        const from = Number(c && c.fromGateId), to = Number(c && c.toGateId), index = Number(c && c.inputIndex);
        if (!ids.has(from) || !ids.has(to)) throw new Error("A connection points to a missing gate.");
        if (from === to) throw new Error("A gate cannot connect to itself.");
        const maxInputs = newGates.find(g => g.id === to).type === "NOT" ? 1 : 2;
        if (!Number.isInteger(index) || index < 0 || index >= maxInputs) {
            throw new Error("A connection uses an invalid input point.");
        }
        if (used.has(to + ":" + index)) throw new Error("An input point has more than one wire.");
        used.add(to + ":" + index);
        indegree[to]++;
        next[from].push(to);
        return { fromGateId: from, toGateId: to, inputIndex: index };
    });
    const queue = [...ids].filter(id => indegree[id] === 0);
    let visited = 0;
    while (queue.length) {
        const id = queue.pop();
        visited++;
        next[id].forEach(n => { if (--indegree[n] === 0) queue.push(n); });
    }
    if (visited !== ids.size) throw new Error("The file contains a circular connection.");
    return { gates: newGates, connections: newConnections };
}

function ddRestoreCircuit(data) {
    const valid = ddValidateProject(data);
    gates = valid.gates;
    connections = valid.connections;
    gateCount = Math.max(Number(data.gateCount || 0) || 0, ...gates.map(g => g.id), 0);
    const saved = data.circuitInputValues && typeof data.circuitInputValues === "object"
        ? data.circuitInputValues : {};
    circuitInputValues = {};
    if (gates.length > 0) {
        // Input values are stored per input point; older files stored them by letter (A, B, ...).
        const model = ddBuildWorkbenchCircuit();
        Object.keys(model.portKeyByName).forEach(name => {
            const key = model.portKeyByName[name];
            const value = saved[key] !== undefined ? saved[key] : saved[name];
            if (value === 1) circuitInputValues[key] = 1;
        });
    }
    selectedOutputGateId = null;
    latestSignalValues = null;
    displayGates();
}
function ddLoadSavedCircuit() {
    const saved = localStorage.getItem("digitaldesk-circuit");
    if (!saved) return;
    try { ddRestoreCircuit(JSON.parse(saved)); }
    catch (err) { console.warn("Saved circuit could not be restored:", err); }
}
function ddExportCircuit() {
    const data = JSON.stringify(ddGetProjectData(), null, 2);
    const blob = new Blob([data], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "digitaldesk-circuit.json";
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
}
function ddImportCircuitFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try { ddRestoreCircuit(JSON.parse(reader.result)); }
        catch (err) { alert("Import failed: " + err.message); }
    };
    reader.onerror = () => alert("Could not read the selected file.");
    reader.readAsText(file);
}
function ddLoadNandExample() {
    gates = [{id:1,type:"AND"},{id:2,type:"NOT"}];
    connections = [{fromGateId:1,toGateId:2,inputIndex:0}];
    gateCount = 2;
    circuitInputValues = {};
    selectedOutputGateId = null;
    latestSignalValues = null;
    displayGates();
}
document.getElementById("saveCircuitButton").addEventListener("click", ddSaveCircuit);
document.getElementById("exportCircuitButton").addEventListener("click", ddExportCircuit);
document.getElementById("importCircuitButton").addEventListener("click", () =>
    document.getElementById("importCircuitFile").click());
document.getElementById("importCircuitFile").addEventListener("change", event => {
    ddImportCircuitFile(event.target.files[0]);
    event.target.value = "";
});
document.getElementById("exampleCircuitButton").addEventListener("click", ddLoadNandExample);

// Add a new gate.
function ddAddGate(type, x, y) {
    gateCount++;
    const gate = { id: gateCount, type: type };
    if (Number.isFinite(x) && Number.isFinite(y)) { gate.x = x; gate.y = y; }
    gates.push(gate);
    displayGates();
}

addGateButton.addEventListener("click", function () {
    ddAddGate(gateSelect.value);
});

// Toolbox: click a gate, or drag it onto the canvas.
document.querySelectorAll("#gatePalette [data-gate]").forEach(button => {
    button.innerHTML = '<svg viewBox="0 0 130 84" class="palette-symbol">' +
        DD_SYMBOLS[button.dataset.gate] + '</svg><span>' + button.dataset.gate + '</span>';
    button.addEventListener("click", () => ddAddGate(button.dataset.gate));
    button.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            ddAddGate(button.dataset.gate);
        }
    });
    button.addEventListener("dragstart", event =>
        event.dataTransfer.setData("text/plain", button.dataset.gate));
});
circuitCanvas.addEventListener("dragover", event => event.preventDefault());
circuitCanvas.addEventListener("drop", event => {
    event.preventDefault();
    const type = event.dataTransfer.getData("text/plain");
    if (!DD_GATE_TYPES.includes(type)) return;
    const rect = circuitCanvas.getBoundingClientRect();
    ddAddGate(type, Math.max(66, event.clientX - rect.left - 65),
                    Math.max(0, event.clientY - rect.top - 50));
});


// Remove all gates and connections.
clearWorkbenchButton.addEventListener("click", function () {
    gates = [];
    connections = [];
    selectedOutputGateId = null;
    circuitInputValues = {};

    displayGates();
});


// Restore the last saved project on startup, or show an empty workbench.
ddLoadSavedCircuit();
if (gates.length === 0) displayGates();
