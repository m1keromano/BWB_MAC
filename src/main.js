import './style.css'
import { CanvasManager } from './canvas/CanvasManager.js';
import { InteractionController } from './canvas/Interaction.js';
import { WorkflowController } from './ui/Workflow.js';

console.log('BWB MAC Calculator Initialized');

const canvas = document.getElementById('designCanvas');

// Initialize Systems
const canvasManager = new CanvasManager(canvas);
const interactionController = new InteractionController(canvasManager);
const workflowController = new WorkflowController(interactionController, null);

// Make global for debugging
window.app = {
    canvasManager,
    interactionController,
    workflowController
};

// Handle Window Resize
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // CanvasManager loop handles redraw, but we might want to trigger grid recalc if it was cached
    // canvasManager.drawGrid(); 
}
window.addEventListener('resize', resize);
resize();
