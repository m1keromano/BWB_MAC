export const MACCalculator = {

    calculate(leadingSegments, trailingSegments, symmetryLine, realWingspan) {
        // Step A: Coordinate Transform Setup
        const symDx = symmetryLine.p2.x - symmetryLine.p1.x;
        const symDy = symmetryLine.p2.y - symmetryLine.p1.y;
        const angle = Math.atan2(symDy, symDx);

        const transform = (p) => {
            const tx = p.x - symmetryLine.p1.x;
            const ty = p.y - symmetryLine.p1.y;
            const rx = tx * Math.cos(-angle) - ty * Math.sin(-angle);
            const ry = tx * Math.sin(-angle) + ty * Math.cos(-angle);
            return { x: rx, y: ry };
        };

        // Flatten and Sample all segments
        const LE_samples = this.sampleSegments(leadingSegments, transform);
        const TE_samples = this.sampleSegments(trailingSegments, transform);

        // Find Spanwise Bounds (Y)
        const minY = Math.max(this.getMinY(LE_samples), this.getMinY(TE_samples));
        const maxY = Math.min(this.getMaxY(LE_samples), this.getMaxY(TE_samples));

        // Check for validity
        if (LE_samples.length < 2 || TE_samples.length < 2) {
            throw new Error("Insufficient points");
        }

        // Integration
        let area = 0;
        let moment_y = 0;
        let integral_c_sq = 0;

        const dy = (maxY - minY) / 1000;
        if (dy === 0) throw new Error("Zero span detected");

        for (let y = minY; y <= maxY; y += dy) {
            const x_le = this.interpolateX(LE_samples, y);
            const x_te = this.interpolateX(TE_samples, y);

            const chord = Math.abs(x_te - x_le);
            const da = chord * dy;

            area += da;
            moment_y += Math.abs(y) * da;
            integral_c_sq += (chord * chord) * dy;
        }

        if (area === 0) throw new Error("Zero area detected");

        const MAC_pixels = integral_c_sq / area;
        const Y_mac_pixels = moment_y / area;

        // Find visual Y where local chord ~= MAC
        let visual_Y = Y_mac_pixels;
        let minDiff = Infinity;

        // Search across the span for the chord closest to MAC
        // We can reuse the integration steps or re-iterate
        for (let y = minY; y <= maxY; y += dy) {
            const x_le = this.interpolateX(LE_samples, y);
            const x_te = this.interpolateX(TE_samples, y);
            const currentChord = Math.abs(x_te - x_le);
            const diff = Math.abs(currentChord - MAC_pixels);

            if (diff < minDiff) {
                minDiff = diff;
                visual_Y = y;
            }
        }

        // If we are on the negative side (left wing) for visualization preference (optional),
        // we might want to ensure visual_Y matches the centroid's sign or force it positive/negative.
        // The integration area calculation might cover both wings or one. 
        // Assuming standard half-span analysis or symmetric full span.
        // If the user drew a full plane, minY to maxY covers it.
        // The centroid Y_mac_pixels dictates roughly where the "weight" is.
        // Let's stick to the found visual_Y, but maybe bias towards the side of the centroid?
        // Actually, simple minDiff is safer for now.

        const X_le_mac_pixels = this.interpolateX(LE_samples, visual_Y);

        // Scaling
        const maxDist = Math.max(
            this.getMaxDist(LE_samples),
            this.getMaxDist(TE_samples)
        );

        const scaleFactor = (realWingspan / 2) / maxDist;

        const MAC_meters = MAC_pixels * scaleFactor;
        const Area_meters = area * (scaleFactor * scaleFactor) * (minY * maxY < 0 ? 1 : 2);

        return {
            MAC: MAC_meters,
            Area: Area_meters,
            MAC_pixels,
            Y_mac_pixels: visual_Y,
            X_le_mac_pixels,
            scaleFactor,
            rotationAngle: angle,
            origin: symmetryLine.p1
        };
    },

    sampleSegments(segments, transform) {
        let allPoints = [];
        for (const shape of segments) {
            const points = this.sampleShape(shape, transform);
            allPoints.push(...points);
        }
        // Deduplicate or stitching?
        // If segments are contiguous, end of S1 is start of S2. 
        // We might have duplicate points. Sorting by Y handles it generally.
        allPoints.sort((a, b) => a.y - b.y);
        return allPoints;
    },

    sampleShape(shape, transform) {
        let points = [];
        if (shape.type === 'LINE') {
            points = shape.points.map(transform);
        } else {
            if (shape.bezierPoints) {
                for (const seg of shape.bezierPoints) {
                    for (let i = 0; i <= 10; i++) {
                        const t = i / 10;
                        const p = this.getBezierPoint(seg, t);
                        points.push(transform(p));
                    }
                }
            } else {
                points = shape.points.map(transform);
            }
        }
        return points;
    },

    getBezierPoint(seg, t) {
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt * mt * mt;
        const t2 = t * t;
        const t3 = t * t * t;

        return {
            x: mt3 * seg.p1.x + 3 * mt2 * t * seg.cp1.x + 3 * mt * t2 * seg.cp2.x + t3 * seg.p2.x,
            y: mt3 * seg.p1.y + 3 * mt2 * t * seg.cp1.y + 3 * mt * t2 * seg.cp2.y + t3 * seg.p2.y
        };
    },

    interpolateX(samples, y) {
        if (y < samples[0].y || y > samples[samples.length - 1].y) {
            if (Math.abs(y - samples[0].y) < 1e-9) return samples[0].x;
            if (Math.abs(y - samples[samples.length - 1].y) < 1e-9) return samples[samples.length - 1].x;
            return 0; // Out of bounds
        }

        for (let i = 0; i < samples.length - 1; i++) {
            if (samples[i].y <= y && samples[i + 1].y >= y) {
                const dy = samples[i + 1].y - samples[i].y;
                if (dy === 0) return samples[i].x;
                const t = (y - samples[i].y) / dy;
                return samples[i].x + t * (samples[i + 1].x - samples[i].x);
            }
        }
        return samples[samples.length - 1].x;
    },

    getMinY(samples) {
        if (!samples.length) return 0;
        return samples[0].y;
    },
    getMaxY(samples) {
        if (!samples.length) return 0;
        return samples[samples.length - 1].y;
    },
    getMaxDist(samples) {
        if (!samples.length) return 0;
        let max = 0;
        for (const p of samples) max = Math.max(max, Math.abs(p.y));
        return max;
    }
};
