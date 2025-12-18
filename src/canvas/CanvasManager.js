import { CubicSpline } from '../math/Spline.js';

export class CanvasManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Viewport State
        this.transform = { x: 0, y: 0, k: 1 };

        // Data State
        this.blueprintImage = null;
        this.symmetryLine = null; // { p1, p2 }

        // Multi-Segment Architecture.
        // Instead of single shapes, we store Arrays of shapes.
        this.leadingEdgeSegments = [];
        this.trailingEdgeSegments = [];
        this.macLine = null;

        // Temporary State
        this.activePoints = []; // User clicked points for CURRENT segment
        this.previewShape = null; // Calculated shape including cursor
        this.cursor = { x: 0, y: 0 };
        this.snapPoint = null;

        // If we want to show connection from last committed segment to current cursor when activePoints is empty?
        // Yes, if we are in a chain.

        this.startLoop();
    }

    startLoop() {
        const loop = () => {
            this.render();
            requestAnimationFrame(loop);
        };
        loop();
    }

    render() {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawGrid();

        this.ctx.setTransform(this.transform.k, 0, 0, this.transform.k, this.transform.x, this.transform.y);

        if (this.blueprintImage) {
            this.ctx.globalAlpha = 0.5;
            this.ctx.drawImage(this.blueprintImage, 0, 0);
            this.ctx.globalAlpha = 1.0;
        }

        if (this.symmetryLine) {
            this.drawInfiniteLine(this.symmetryLine.p1, this.symmetryLine.p2, '#ff4081');
        }

        // Draw Committed Segments
        this.leadingEdgeSegments.forEach(s => this.drawShape(s, '#00bcd4'));
        this.trailingEdgeSegments.forEach(s => this.drawShape(s, '#4caf50'));

        // Draw Preview Shape (Active)
        if (this.previewShape) {
            // Dotted style for preview
            this.ctx.save();
            this.ctx.setLineDash([5 / this.transform.k, 5 / this.transform.k]);
            // Color based on active tool (cyan for LE, green for TE)? 
            // Or just white for active.
            this.drawShape(this.previewShape, '#ffffff');
            this.ctx.restore();
        }

        // Draw Active Points (Construction nodes)
        this.drawPoints(this.activePoints, '#ffffff');

        // Draw MAC Result
        if (this.macLine) {
            this.ctx.save();
            this.ctx.strokeStyle = '#ffeb3b';
            this.ctx.lineWidth = 4 / this.transform.k;
            this.ctx.beginPath();
            this.ctx.moveTo(this.macLine.p1.x, this.macLine.p1.y);
            this.ctx.lineTo(this.macLine.p2.x, this.macLine.p2.y);
            this.ctx.stroke();
            this.drawPoint(this.macLine.p1, '#ffeb3b', 6);
            this.drawPoint(this.macLine.p2, '#ffeb3b', 6);
            this.ctx.restore();
        }

        // Draw Snap Area
        if (this.snapPoint) {
            this.drawPoint(this.snapPoint, '#ffff00', 6);
            this.ctx.strokeStyle = '#ffff00';
            this.ctx.lineWidth = 1 / this.transform.k;
            this.ctx.beginPath();
            this.ctx.arc(this.snapPoint.x, this.snapPoint.y, 10 / this.transform.k, 0, Math.PI * 2);
            this.ctx.stroke();
        }
    }

    drawGrid() {
        this.ctx.fillStyle = '#1e1e1e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawInfiniteLine(p1, p2, color) {
        if (!p1 || !p2) return;
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2 / this.transform.k;
        this.ctx.setLineDash([10 / this.transform.k, 5 / this.transform.k]);
        this.ctx.beginPath();
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        this.ctx.moveTo(p1.x - dx * 1000, p1.y - dy * 1000);
        this.ctx.lineTo(p1.x + dx * 1000, p1.y + dy * 1000);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        this.drawPoint(p1, color);
        this.drawPoint(p2, color);
    }

    drawShape(shape, color) {
        if (!shape) return;
        if (shape.type === 'LINE') {
            this.drawPolyline(shape.points, color);
        } else {
            this.drawSpline(shape, color);
        }
    }

    drawSpline(spline, color) {
        if (!spline || !spline.bezierPoints || !spline.bezierPoints.length) return;

        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 3 / this.transform.k;
        this.ctx.beginPath();

        const first = spline.bezierPoints[0];
        this.ctx.moveTo(first.p1.x, first.p1.y);

        for (const segment of spline.bezierPoints) {
            this.ctx.bezierCurveTo(
                segment.cp1.x, segment.cp1.y,
                segment.cp2.x, segment.cp2.y,
                segment.p2.x, segment.p2.y
            );
        }
        this.ctx.stroke();
        this.drawPoints(spline.points, color);
    }

    drawPolyline(points, color) {
        if (!points || points.length < 2) return;
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 3 / this.transform.k;
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
        }
        this.ctx.stroke();
        this.drawPoints(points, color);
    }

    drawPoints(points, color) {
        if (!points) return;
        points.forEach(p => this.drawPoint(p, color));
    }

    drawPoint(p, color, size = 4) {
        if (!p) return;
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, size / this.transform.k, 0, Math.PI * 2);
        this.ctx.fill();
    }

    worldToScreen(x, y) {
        return {
            x: x * this.transform.k + this.transform.x,
            y: y * this.transform.k + this.transform.y
        };
    }

    screenToWorld(x, y) {
        return {
            x: (x - this.transform.x) / this.transform.k,
            y: (y - this.transform.y) / this.transform.k
        };
    }

    loadImage(file) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                this.blueprintImage = img;
                const scaleX = this.canvas.width / img.width;
                const scaleY = this.canvas.height / img.height;
                const scale = Math.min(scaleX, scaleY) * 0.8;

                this.transform.k = scale;
                this.transform.x = (this.canvas.width - img.width * scale) / 2;
                this.transform.y = (this.canvas.height - img.height * scale) / 2;

                resolve();
            };
            img.src = URL.createObjectURL(file);
        });
    }
}
