import { CubicSpline } from '../math/Spline.js';

export class InteractionController {
    constructor(canvasManager) {
        this.cm = canvasManager;
        this.canvas = canvasManager.canvas;

        this.mode = 'IDLE'; // IDLE, DRAW_SYMMETRY, DRAW_LEADING, DRAW_TRAILING
        this.subMode = 'SPLINE'; // LINE, SPLINE

        // Event Binding
        this.canvas.addEventListener('wheel', this.onWheel.bind(this));
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        window.addEventListener('mousemove', this.onMouseMove.bind(this));
        window.addEventListener('mouseup', this.onMouseUp.bind(this));
        window.addEventListener('keydown', this.onKeyDown.bind(this));

        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };
    }

    setMode(mode) {
        this.mode = mode;
        this.cm.activePoints = [];
        this.cm.snapPoint = null;
        this.cm.previewShape = null;
    }

    onWheel(e) {
        e.preventDefault();
        const zoomIntensity = 0.1;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoom = Math.exp(wheel * zoomIntensity);

        const mouse = this.getMousePos(e);
        const worldMouseBefore = this.cm.screenToWorld(mouse.x, mouse.y);

        this.cm.transform.k *= zoom;

        const newX = mouse.x - worldMouseBefore.x * this.cm.transform.k;
        const newY = mouse.y - worldMouseBefore.y * this.cm.transform.k;

        this.cm.transform.x = newX;
        this.cm.transform.y = newY;
    }

    onMouseDown(e) {
        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            this.isDragging = true;
            this.lastMouse = this.getMousePos(e);
            return;
        }

        if (e.button === 0) { // Left Click
            const p = this.getMousePos(e);
            const worldP = this.cm.screenToWorld(p.x, p.y);

            // Check snap
            let finalP = worldP;
            if (this.cm.snapPoint) {
                finalP = this.cm.snapPoint;
            }

            if (this.mode.startsWith('DRAW')) {
                if (this.mode === 'DRAW_SYMMETRY') {
                    this.cm.activePoints.push(finalP);
                    this.cm.symmetryLine = {
                        p1: this.cm.activePoints[0],
                        p2: this.cm.activePoints[1] || finalP
                    };
                    if (this.cm.activePoints.length === 2) {
                        this.commitCurrentSegment();
                    }
                } else {
                    this.cm.activePoints.push(finalP);
                    // No automatic commit. User hits Space to commit segment.
                }
            }
        }
    }

    onMouseMove(e) {
        const p = this.getMousePos(e);

        if (this.isDragging) {
            const dx = p.x - this.lastMouse.x;
            const dy = p.y - this.lastMouse.y;
            this.cm.transform.x += dx;
            this.cm.transform.y += dy;
            this.lastMouse = p;
        }

        const worldP = this.cm.screenToWorld(p.x, p.y);
        this.cm.cursor = worldP;

        // Handle Snap
        this.handleSnapping(worldP);

        const effectiveCursor = this.cm.snapPoint || worldP;

        // Update Symmetry Preview
        if (this.mode === 'DRAW_SYMMETRY' && this.cm.activePoints.length === 1) {
            this.cm.symmetryLine = {
                p1: this.cm.activePoints[0],
                p2: effectiveCursor
            };
        }

        // Update Dotted Preview for Line/Spline
        // Preview = Active Points + Cursor
        if (this.mode === 'DRAW_LEADING' || this.mode === 'DRAW_TRAILING') {
            if (this.cm.activePoints.length > 0) {
                // Construct a temporary point array including cursor
                const previewPoints = [...this.cm.activePoints, effectiveCursor];
                const shape = this.createShapeFromPoints(previewPoints);
                this.cm.previewShape = shape;
            } else {
                this.cm.previewShape = null;
                // Optimization: Look for last committed segment endpoint to draw "rubber band" from?
                // Prompt: "dotted line... considering my mouse position and where I have already clicked"
                // If activePoints is empty, but we have segments, maybe user wants to continue from last segment end?
                // But wait, user clicks to start a NEW segment usually?
                // Actually, in CAD, if you just finished a segment, the next click starts a new one.
                // Unless it's a polyline tool.
                // Let's assume standard behavior:
                // 1. User clicks P1.
                // 2. User moves -> Preview Line P1-Cursor.
                // 3. User clicks P2 -> Active = [P1, P2]. Preview Line P1-P2-Cursor (if spline).
                // 4. User hits Space -> Segment committed. Active = [].

                // If Active is empty, we don't know where start is, so no preview line.
            }
        }
    }

    handleSnapping(worldP) {
        const snapDist = 15 / this.cm.transform.k;
        let foundSnap = null;
        const candidates = [];

        if (this.cm.symmetryLine && this.mode !== 'DRAW_SYMMETRY') {
            candidates.push(this.cm.symmetryLine.p1, this.cm.symmetryLine.p2);
        }

        // Endpoints of all existing segments
        this.cm.leadingEdgeSegments.forEach(s => {
            if (s.points.length) {
                candidates.push(s.points[0], s.points[s.points.length - 1]);
            }
        });
        this.cm.trailingEdgeSegments.forEach(s => {
            if (s.points.length) {
                candidates.push(s.points[0], s.points[s.points.length - 1]);
            }
        });

        // Active points
        if (this.cm.activePoints.length > 0) {
            candidates.push(this.cm.activePoints[0]);
        }

        for (const pt of candidates) {
            if (!pt) continue;
            const dist = Math.hypot(pt.x - worldP.x, pt.y - worldP.y);
            if (dist < snapDist) {
                foundSnap = pt;
                break;
            }
        }
        this.cm.snapPoint = foundSnap;
    }

    onMouseUp(e) {
        this.isDragging = false;
    }

    onKeyDown(e) {
        if (e.target.tagName === 'INPUT') return;

        if (e.key === ' ') { // Commit SEGMENT
            if (this.mode.startsWith('DRAW') && this.cm.activePoints.length > 1) {
                this.commitCurrentSegment();
            }
        }
        else if (e.key === 'Enter') { // Finish STEP (Complete Edge)
            if (this.mode.startsWith('DRAW')) {
                this.finishStep();
            }
        }
        else if (e.key === 'Escape' || e.key === 'e') { // Cancel current active points
            this.cm.activePoints = [];
            this.cm.previewShape = null;
        }
        else if ((e.metaKey || e.ctrlKey) && e.key === 'z') { // Undo Point or Segment?
            // 1. Check for Active Points (currently drawing segment)
            if (this.cm.activePoints.length > 0) {
                this.cm.activePoints.pop();
            }
            // 2. Check for Committed Segments or Symmetry Line in current mode
            else {
                let nothingToUndo = false;

                if (this.mode === 'DRAW_LEADING') {
                    if (this.cm.leadingEdgeSegments.length > 0) {
                        this.cm.leadingEdgeSegments.pop();
                    } else {
                        nothingToUndo = true;
                    }
                }
                else if (this.mode === 'DRAW_TRAILING') {
                    if (this.cm.trailingEdgeSegments.length > 0) {
                        this.cm.trailingEdgeSegments.pop();
                    } else {
                        nothingToUndo = true;
                    }
                }
                else if (this.mode === 'DRAW_SYMMETRY') {
                    // Logic: If I am in SYMMETRY mode, and I have a symmetry line, undoing it clears it.
                    // If I don't have one, I go back.
                    if (this.cm.symmetryLine) {
                        this.cm.symmetryLine = null;
                        this.cm.activePoints = [];
                    } else {
                        nothingToUndo = true;
                    }
                }
                else if (this.mode === 'IDLE') {
                    // For SCALING_RESULTS or UPLOAD, just go back
                    nothingToUndo = true; // Fall through to prevStep
                }
                else {
                    nothingToUndo = true;
                }

                // 3. Cross-Phase Undo
                if (nothingToUndo) {
                    if (window.app && window.app.workflowController) {
                        window.app.workflowController.prevStep();
                    }
                }
            }
        }
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    createShapeFromPoints(points) {
        if (this.subMode === 'LINE') {
            return {
                type: 'LINE',
                points: [...points]
            };
        } else {
            const spline = new CubicSpline([...points]);
            spline.type = 'SPLINE';
            return spline;
        }
    }

    commitCurrentSegment() {
        // Create final shape from active points (without cursor)
        const shape = this.createShapeFromPoints(this.cm.activePoints);

        if (this.mode === 'DRAW_LEADING') {
            this.cm.leadingEdgeSegments.push(shape);
        } else if (this.mode === 'DRAW_TRAILING') {
            this.cm.trailingEdgeSegments.push(shape);
        } else if (this.mode === 'DRAW_SYMMETRY') {
            // Already handled via symmetryLine property, but let's be consistent
            this.finishStep(); // Symmetry is single step
            return;
        }

        // Clear active
        this.cm.activePoints = [];
        this.cm.previewShape = null;
        // User continues drawing (next segment starts empty)
    }

    finishStep() {
        // Trigger next Step via global Workflow
        if (window.app && window.app.workflowController) {
            window.app.workflowController.nextStep();
        }
    }
}
