
// Mock Classes
class CanvasManager {
    constructor() {
        this.activePoints = [];
        this.leadingEdgeSegments = [];
        this.trailingEdgeSegments = [];
        this.symmetryLine = null;
    }
}

class InteractionController {
    constructor(cm) {
        this.cm = cm;
        this.mode = 'IDLE';
    }

    // Copied Logic for Testing
    undo() {
        if (this.cm.activePoints.length > 0) {
            console.log("Undoing Active Point");
            this.cm.activePoints.pop();
            return "ActivePoint";
        }
        else {
            let nothingToUndo = false;

            if (this.mode === 'DRAW_LEADING') {
                if (this.cm.leadingEdgeSegments.length > 0) {
                    console.log("Undoing LE Segment");
                    this.cm.leadingEdgeSegments.pop();
                    return "LESegment";
                } else {
                    nothingToUndo = true;
                }
            }
            else if (this.mode === 'DRAW_TRAILING') {
                if (this.cm.trailingEdgeSegments.length > 0) {
                    console.log("Undoing TE Segment");
                    this.cm.trailingEdgeSegments.pop();
                    return "TESegment";
                } else {
                    nothingToUndo = true;
                }
            }
            else if (this.mode === 'DRAW_SYMMETRY') {
                if (this.cm.symmetryLine) {
                    console.log("Undoing Symmetry Line");
                    this.cm.symmetryLine = null;
                    return "SymmetryLine";
                } else {
                    nothingToUndo = true;
                }
            }
            else {
                nothingToUndo = true;
            }

            if (nothingToUndo) {
                console.log("Triggering Prev Step");
                if (this.workflowController) {
                    this.workflowController.prevStep();
                    return "PrevStep";
                }
            }
        }
        return "Nothing";
    }
}

class WorkflowController {
    constructor(ic) {
        this.ic = ic;
        this.steps = ['UPLOAD', 'SYMMETRY', 'LEADING_EDGE', 'TRAILING_EDGE'];
        this.currentStepIndex = 0;
        this.enterStep(0);
    }

    enterStep(index) {
        this.currentStepIndex = index;
        const step = this.steps[index];
        console.log(`ENTER STEP: ${step}`);
        if (step === 'SYMMETRY') this.ic.mode = 'DRAW_SYMMETRY';
        else if (step === 'LEADING_EDGE') this.ic.mode = 'DRAW_LEADING';
        else if (step === 'TRAILING_EDGE') this.ic.mode = 'DRAW_TRAILING';
        else this.ic.mode = 'IDLE';
    }

    nextStep() {
        if (this.currentStepIndex < this.steps.length - 1) this.enterStep(this.currentStepIndex + 1);
    }

    prevStep() {
        if (this.currentStepIndex > 0) this.enterStep(this.currentStepIndex - 1);
    }
}

// TEST SCENARIO
const cm = new CanvasManager();
const ic = new InteractionController(cm);
const wc = new WorkflowController(ic);
ic.workflowController = wc;

console.log("--- TEST START ---");

// 1. SYMMETRY STEP
wc.enterStep(1); // SYMMETRY
cm.symmetryLine = { p1: {}, p2: {} }; // Draw Symmetry
wc.nextStep(); // Go to LEADING_EDGE

// 2. LEADING EDGE STEP
cm.leadingEdgeSegments.push({}); // Draw Seg 1
cm.leadingEdgeSegments.push({}); // Draw Seg 2
cm.activePoints.push({}); // Draw Point

// 3. START UNDOING
console.log("Undo 1 (Point): " + ic.undo()); // Expect Point
console.log("Undo 2 (Seg 2): " + ic.undo()); // Expect LE Segment
console.log("Undo 3 (Seg 1): " + ic.undo()); // Expect LE Segment
console.log("Undo 4 (Step Back): " + ic.undo()); // Expect PrevStep (Back to SYMMETRY)

// 4. BACK IN SYMMETRY
if (wc.steps[wc.currentStepIndex] !== 'SYMMETRY') console.error("FAILED to go back to Symmetry");

console.log("Undo 5 (Symmetry Line): " + ic.undo()); // Expect SymmetryLine

// 5. STEP BACK TO UPLOAD
console.log("Undo 6 (Step Back): " + ic.undo()); // Expect PrevStep (Back to UPLOAD)

if (wc.steps[wc.currentStepIndex] !== 'UPLOAD') console.error("FAILED to go back to Upload");

console.log("--- TEST END ---");
