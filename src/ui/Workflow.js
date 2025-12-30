import { MACCalculator } from '../math/Geometry.js';

export class WorkflowController {
    constructor(interactionController, uiOverlay) {
        this.ic = interactionController;
        this.steps = [
            'UPLOAD',
            'SYMMETRY',
            'LEADING_EDGE',
            'TRAILING_EDGE',
            'SCALING_RESULTS' // Combined step
        ];

        this.currentStepIndex = 0;
        this.enterStep(0);
    }

    get currentStep() {
        return this.steps[this.currentStepIndex];
    }

    nextStep() {
        if (this.currentStepIndex < this.steps.length - 1) {
            this.currentStepIndex++;
            this.enterStep(this.currentStepIndex);
        }
    }

    prevStep() {
        if (this.currentStepIndex > 0) {
            this.currentStepIndex--;
            this.enterStep(this.currentStepIndex);
        }
    }

    enterStep(index) {
        const step = this.steps[index];
        console.log(`Entering step: ${step}`);

        // Reset Interaction State for new step
        this.ic.cm.activePoints = [];
        this.ic.cm.snapPoint = null;
        this.ic.cm.previewShape = null;

        let instruction = "";

        switch (step) {
            case 'UPLOAD':
                this.ic.setMode('IDLE');
                instruction = "1. Drag & Drop a blueprint image anywhere to start.";
                this.enableFileDrop();
                break;
            case 'SYMMETRY':
                this.ic.setMode('DRAW_SYMMETRY');
                this.ic.subMode = 'LINE';
                instruction = "2. Draw Centerline: Click Start and End of the Symmetry Axis.";
                break;
            case 'LEADING_EDGE':
                this.ic.setMode('DRAW_LEADING');
                this.ic.subMode = 'SPLINE';
                instruction = "3. Leading Edge: Click points. <br>SPACE to commit segment. <br>ENTER to Finish Edge.";
                break;
            case 'TRAILING_EDGE':
                this.ic.setMode('DRAW_TRAILING');
                this.ic.subMode = 'SPLINE';
                instruction = "4. Trailing Edge: Click points. <br>SPACE to commit segment. <br>ENTER to Finish Edge.";
                break;
            case 'SCALING_RESULTS':
                this.ic.setMode('IDLE');
                instruction = "5. Analysis & Results";
                // Show form immediately
                this.updateUI(step, instruction); // Call first to render box
                this.promptScalingAndCalc(); // Then populate
                return; // Early return as we updated UI manually
        }

        this.updateUI(step, instruction);
    }

    updateUI(step, instruction) {
        const overlay = document.getElementById('overlay');
        const status = document.getElementById('status');
        if (status) status.textContent = `Step: ${step}`;

        if (overlay) {
            overlay.innerHTML = `
                <div class="instruction-box">
                    <h2>${step.replace('_', ' ')}</h2>
                    <p id="instruction-text">${instruction}</p>
                    ${step === 'UPLOAD' ?
                    `<div style="margin-top:10px;">
                         <button id="upload-btn">Select File</button>
                         <input type="file" id="file-input" style="display:none;" accept="image/*">
                       </div>`
                    : ''}
                    ${step === 'LEADING_EDGE' || step === 'TRAILING_EDGE' ?
                    `<div class="tool-toggle">
                         <label>Tool:</label>
                         <select id="tool-select">
                           <option value="SPLINE">Spline (C2)</option>
                           <option value="LINE">Line (Polyline)</option>
                         </select>
                       </div>
                       <div class="shortcuts">
                            <span>⎵ SPACE: Commit Segment</span>
                            <span>↵ ENTER: Finish Edge</span>
                       </div>`
                    : ''}
                    <div id="results-area"></div>
                </div>
            `;

            const select = document.getElementById('tool-select');
            if (select) {
                select.value = this.ic.subMode;
                select.addEventListener('change', (e) => {
                    this.ic.subMode = e.target.value;
                });
            }

            // Re-bind upload button if exists
            const uploadBtn = document.getElementById('upload-btn');
            const fileInput = document.getElementById('file-input');
            if (uploadBtn && fileInput) {
                uploadBtn.onclick = () => fileInput.click();
                fileInput.onchange = (e) => {
                    const file = e.target.files[0];
                    if (file && file.type.startsWith('image/')) {
                        this.ic.cm.loadImage(file).then(() => {
                            this.nextStep();
                        });
                    }
                };
            }
        }
    }

    enableFileDrop() {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.body.addEventListener(eventName, e => e.preventDefault(), false);
        });

        document.body.addEventListener('drop', e => {
            if (this.currentStep !== 'UPLOAD') return;
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                this.ic.cm.loadImage(file).then(() => {
                    this.nextStep();
                });
            }
        });
    }

    promptScalingAndCalc() {
        const area = document.getElementById('results-area');
        if (!area) return;

        area.innerHTML = `
            <div class="input-group">
                <label>Real Wingspan (m):</label>
                <input type="number" id="wingspan-input" placeholder="e.g. 15.2" step="0.1">
                <button id="calc-btn">Calculate</button>
            </div>
            <div id="calc-output" style="margin-top:20px;"></div>
         `;

        const btn = document.getElementById('calc-btn');
        const input = document.getElementById('wingspan-input');

        if (input) input.focus();

        const perform = () => {
            const val = parseFloat(input.value);
            if (val > 0) {
                this.realWingspan = val;
                this.performCalculation();
            } else {
                alert("Please enter a valid wingspan.");
            }
        };

        if (btn) btn.onclick = perform;
        if (input) input.onkeydown = (e) => { if (e.key === 'Enter') perform(); };
    }

    performCalculation() {
        const cm = this.ic.cm;
        // Check for empty arrays
        if (!cm.leadingEdgeSegments.length || !cm.trailingEdgeSegments.length || !cm.symmetryLine) {
            alert("Missing geometry! Did you forget to hit ENTER to finish drawing?");
            return;
        }

        try {
            const result = MACCalculator.calculate(
                cm.leadingEdgeSegments,
                cm.trailingEdgeSegments,
                cm.symmetryLine,
                this.realWingspan
            );

            // Show Result inside Modal
            const output = document.getElementById('calc-output');
            if (output) {
                output.innerHTML = `
                    <div class="result-card">
                        <h3>Mean Aerodynamic Chord</h3>
                        <div class="result-value">${result.MAC.toFixed(3)} m</div>
                        <div class="result-detail">Est. Project Area: ${result.Area.toFixed(2)} m²</div>
                    </div>
                `;
            }

            // Visualization
            // Relative Coords of MAC LE:
            const ry = result.Y_mac_pixels;
            const rx = result.X_le_mac_pixels;

            const invRotate = (x, y) => {
                const realAngle = result.rotationAngle;
                const tx = x * Math.cos(realAngle) - y * Math.sin(realAngle);
                const ty = x * Math.sin(realAngle) + y * Math.cos(realAngle);
                return {
                    x: tx + result.origin.x,
                    y: ty + result.origin.y
                };
            };

            const pStart = invRotate(rx, ry);
            const pEnd = invRotate(rx + result.MAC_pixels, ry);

            cm.macLine = { p1: pStart, p2: pEnd };

        } catch (e) {
            console.error(e);
            alert("Calculation failed: " + e.message);
        }
    }
}
