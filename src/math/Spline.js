/**
 * Solves a tridiagonal system Ax = d for x.
 * A is defined by diagonals a (lower), b (main), c (upper).
 * @param {number[]} a Lower diagonal (length n, a[0] ignored)
 * @param {number[]} b Main diagonal (length n)
 * @param {number[]} c Upper diagonal (length n, c[n-1] ignored)
 * @param {number[]} d Right hand side vector (length n)
 * @returns {number[]} Solution vector x
 */
export function thomasAlgorithm(a, b, c, d) {
    const n = d.length;
    const cPrime = new Float64Array(n);
    const dPrime = new Float64Array(n);
    const x = new Float64Array(n);

    // Forward elimination
    cPrime[0] = c[0] / b[0];
    dPrime[0] = d[0] / b[0];

    for (let i = 1; i < n; i++) {
        const demon = b[i] - a[i] * cPrime[i - 1];
        if (i < n - 1) {
            cPrime[i] = c[i] / demon;
        }
        dPrime[i] = (d[i] - a[i] * dPrime[i - 1]) / demon;
    }

    // Back substitution
    x[n - 1] = dPrime[n - 1];
    for (let i = n - 2; i >= 0; i--) {
        x[i] = dPrime[i] - cPrime[i] * x[i + 1];
    }

    return x;
}

/**
 * Global C2 Cubic Spline Interpolation
 * Solves for derivatives (tangents) at each knot to ensure continuous curvature.
 */
export class CubicSpline {
    constructor(points) {
        this.points = points; // Array of {x, y}
        this.bezierPoints = [];
        if (points.length > 1) {
            this.solve();
        }
    }

    get isSolvable() {
        return this.points.length >= 2;
    }

    solve() {
        if (!this.isSolvable) return;
        const n = this.points.length - 1;

        // We separate x and y and solve them as 1D splines parameterized by t
        // However, for a 2D curve passing through points, we usually parameterize by chord length or just index.
        // The prompt asks for "Global Cubic Spline". 
        // A common approach for 2D curves is to compute simpler derivatives if x is monotonic, 
        // but for arbitrary shapes (airfoils), x is not monotonic.
        // We should treat x and y coupled or parameterized.
        // Let's use chord-length parameterization or uniform parameterization.
        // Beacuse we want "CAD-like", chord-length is safer.
        // But for simplicity and speed, let's solve for derivatives Dx and Dy w.r.t some parameter t.

        // Let's assume the standard Thomas Algorithm setup for finding derivatives D at knots.
        // System for internal knots i=1..n-1:
        // 1 * D_{i-1} + 4 * D_i + 1 * D_{i+1} = 3 * (P_{i+1} - P_{i-1})  (for uniform knots)
        // With clamped or natural boundary conditions.

        // Let's use Natural Spline conditions (curvature = 0 at ends).
        // Or "Not-a-knot".
        // Let's try uniform parameterization t=0,1,2... first as it's robust for UI drawing.

        // Right Hand Side for X and Y
        const rhsX = new Float64Array(n + 1);
        const rhsY = new Float64Array(n + 1);

        // Diagonals
        const a = new Float64Array(n + 1).fill(1);
        const b = new Float64Array(n + 1).fill(4);
        const c = new Float64Array(n + 1).fill(1);

        // Boundary Conditions (Natural Spline: 2nd deriv = 0 -> 2*D_0 + D_1 = 3*(P_1-P_0))
        // Actually, let's use the explicit matrix for derivatives:
        // [2 1       ] [D0]   [3(P1-P0)]
        // [1 4 1     ] [D1] = [3(P2-P0)]
        // ...
        // [       1 2] [Dn]   [3(Pn-Pn-1)]

        b[0] = 2; c[0] = 1;
        b[n] = 2; a[n] = 1;

        // Fill RHS
        rhsX[0] = 3 * (this.points[1].x - this.points[0].x);
        rhsY[0] = 3 * (this.points[1].y - this.points[0].y);

        for (let i = 1; i < n; i++) {
            rhsX[i] = 3 * (this.points[i + 1].x - this.points[i - 1].x);
            rhsY[i] = 3 * (this.points[i + 1].y - this.points[i - 1].y);
        }

        rhsX[n] = 3 * (this.points[n].x - this.points[n - 1].x);
        rhsY[n] = 3 * (this.points[n].y - this.points[n - 1].y);

        const Dx = thomasAlgorithm(a, b, c, rhsX);
        const Dy = thomasAlgorithm(a, b, c, rhsY);

        // Convert to Bezier Control Points
        // For segment between P_i and P_{i+1}:
        // cp1 = P_i + D_i / 3
        // cp2 = P_{i+1} - D_{i+1} / 3

        this.bezierPoints = [];
        for (let i = 0; i < n; i++) {
            const p1 = this.points[i];
            const p2 = this.points[i + 1];

            const cp1 = {
                x: p1.x + Dx[i] / 3,
                y: p1.y + Dy[i] / 3
            };

            const cp2 = {
                x: p2.x - Dx[i + 1] / 3,
                y: p2.y - Dy[i + 1] / 3
            };

            this.bezierPoints.push({
                p1, // Start point (move to for first)
                cp1,
                cp2,
                p2 // End point
            });
        }
    }
}
