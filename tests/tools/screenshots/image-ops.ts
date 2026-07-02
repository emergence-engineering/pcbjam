/**
 * Reusable pixel operations for the screenshot tooling: PNG load/save, padding,
 * the pixelmatch-backed diff, connected-component clustering ("where to look"),
 * box drawing, and horizontal compositing for the triptych.
 *
 * All images are handled as pngjs PNGs whose `.data` is a length `w*h*4` RGBA
 * Buffer, regardless of the source PNG colour type (pngjs normalizes to RGBA).
 */
import * as fs from 'fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { PIXELMATCH, DIFF_COLOR, CLUSTER, TRIPTYCH, LABEL } from './config';
import { glyphFor } from './font8x8';

export type Box = { x: number; y: number; width: number; height: number; area: number };

export type DiffResult = {
    width: number;
    height: number;
    dimsMatch: boolean;
    /** AA-excluded changed-pixel count (from pixelmatch). */
    diffPixels: number;
    /** diffPixels / (width*height). */
    changedRatio: number;
    /** mean |Δ| over every RGBA channel sample of the whole frame (matches the legacy metric). */
    meanChannelDiff: number;
    /** pixelmatch heatmap: dimmed base + red diffs / yellow AA. */
    heatmap: PNG;
    /** boolean mask (1 = real, non-AA changed pixel) for clustering. */
    mask: Uint8Array;
};

export function loadPng(file: string): PNG {
    return PNG.sync.read(fs.readFileSync(file));
}

export function savePng(file: string, png: PNG): void {
    fs.writeFileSync(file, PNG.sync.write(png));
}

/** New PNG of `w`×`h` filled with `fill` (RGBA), with `src` blitted at top-left. */
export function padTo(src: PNG, w: number, h: number, fill: [number, number, number, number]): PNG {
    const out = new PNG({ width: w, height: h });
    for (let i = 0; i < out.data.length; i += 4) {
        out.data[i] = fill[0];
        out.data[i + 1] = fill[1];
        out.data[i + 2] = fill[2];
        out.data[i + 3] = fill[3];
    }
    for (let y = 0; y < Math.min(h, src.height); y++) {
        const srcRow = y * src.width * 4;
        const dstRow = y * w * 4;
        const rowBytes = Math.min(w, src.width) * 4;
        src.data.copy(out.data, dstRow, srcRow, srcRow + rowBytes);
    }
    return out;
}

/**
 * Diff two images. On a dimension mismatch both are padded (magenta) to the
 * union size and `dimsMatch` is false (the caller treats that as CHANGED).
 * The changed-pixel mask is read back from the heatmap's red diff pixels, so it
 * inherits pixelmatch's anti-aliasing exclusion.
 */
export function diffImages(a: PNG, b: PNG): DiffResult {
    const dimsMatch = a.width === b.width && a.height === b.height;
    const width = Math.max(a.width, b.width);
    const height = Math.max(a.height, b.height);
    const pa = dimsMatch ? a : padTo(a, width, height, TRIPTYCH.padFill);
    const pb = dimsMatch ? b : padTo(b, width, height, TRIPTYCH.padFill);

    const heatmap = new PNG({ width, height });
    const diffPixels = pixelmatch(pa.data, pb.data, heatmap.data, width, height, {
        threshold: PIXELMATCH.threshold,
        includeAA: PIXELMATCH.includeAA,
        diffColor: DIFF_COLOR,
    });

    // Whole-frame mean channel delta (drift-vs-regression heuristic input).
    let totalChannelDiff = 0;
    for (let i = 0; i < pa.data.length; i++) {
        totalChannelDiff += Math.abs(pa.data[i] - pb.data[i]);
    }
    const meanChannelDiff = totalChannelDiff / pa.data.length;

    // Mask = heatmap pixels painted with DIFF_COLOR (red). AA pixels are yellow, so excluded.
    const mask = new Uint8Array(width * height);
    for (let p = 0; p < width * height; p++) {
        const o = p * 4;
        if (heatmap.data[o] > 200 && heatmap.data[o + 1] < 80 && heatmap.data[o + 2] < 80) {
            mask[p] = 1;
        }
    }

    return {
        width,
        height,
        dimsMatch,
        diffPixels,
        changedRatio: diffPixels / (width * height),
        meanChannelDiff,
        heatmap,
        mask,
    };
}

/** Dilate a boolean mask by `r` (square structuring element), out of place. */
function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
    if (r <= 0) return mask;
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!mask[y * w + x]) continue;
            const y0 = Math.max(0, y - r);
            const y1 = Math.min(h - 1, y + r);
            const x0 = Math.max(0, x - r);
            const x1 = Math.min(w - 1, x + r);
            for (let yy = y0; yy <= y1; yy++) {
                for (let xx = x0; xx <= x1; xx++) out[yy * w + xx] = 1;
            }
        }
    }
    return out;
}

/**
 * 8-connected connected-components over the (dilated) mask → bounding boxes,
 * largest-area first, capped at `maxBoxes`, specks below `minBoxArea` dropped.
 */
export function cluster(mask: Uint8Array, w: number, h: number): Box[] {
    const grown = dilate(mask, w, h, CLUSTER.dilate);
    const seen = new Uint8Array(w * h);
    const boxes: Box[] = [];
    const stack: number[] = [];

    for (let start = 0; start < grown.length; start++) {
        if (!grown[start] || seen[start]) continue;
        let minX = w, minY = h, maxX = 0, maxY = 0, count = 0;
        stack.push(start);
        seen[start] = 1;
        while (stack.length) {
            const p = stack.pop()!;
            const px = p % w;
            const py = (p - px) / w;
            count++;
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (!dx && !dy) continue;
                    const nx = px + dx;
                    const ny = py + dy;
                    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                    const np = ny * w + nx;
                    if (grown[np] && !seen[np]) {
                        seen[np] = 1;
                        stack.push(np);
                    }
                }
            }
        }
        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const area = bw * bh;
        if (area >= CLUSTER.minBoxArea) {
            boxes.push({ x: minX, y: minY, width: bw, height: bh, area });
        }
    }
    boxes.sort((p, q) => q.area - p.area);
    return boxes.slice(0, CLUSTER.maxBoxes);
}

/** Draw 2px rectangle outlines for each box onto a copy of `png`. */
export function drawBoxes(png: PNG, boxes: Box[]): PNG {
    const out = new PNG({ width: png.width, height: png.height });
    png.data.copy(out.data);
    const [r, g, b] = CLUSTER.boxColor;
    const set = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= out.width || y >= out.height) return;
        const o = (y * out.width + x) * 4;
        out.data[o] = r;
        out.data[o + 1] = g;
        out.data[o + 2] = b;
        out.data[o + 3] = 255;
    };
    for (const box of boxes) {
        for (let t = 0; t < 2; t++) {
            for (let x = box.x; x < box.x + box.width; x++) {
                set(x, box.y + t);
                set(x, box.y + box.height - 1 - t);
            }
            for (let y = box.y; y < box.y + box.height; y++) {
                set(box.x + t, y);
                set(box.x + box.width - 1 - t, y);
            }
        }
    }
    return out;
}

/** Nearest-neighbour downscale by `scale` (0<scale<1). Fast, quality secondary — it only exists to fit Discord's size caps. */
export function resizeNearest(png: PNG, scale: number): PNG {
    const w = Math.max(1, Math.round(png.width * scale));
    const h = Math.max(1, Math.round(png.height * scale));
    const out = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++) {
        const sy = Math.min(png.height - 1, Math.floor(y / scale));
        for (let x = 0; x < w; x++) {
            const sx = Math.min(png.width - 1, Math.floor(x / scale));
            const s = (sy * png.width + sx) * 4;
            const d = (y * w + x) * 4;
            out.data[d] = png.data[s];
            out.data[d + 1] = png.data[s + 1];
            out.data[d + 2] = png.data[s + 2];
            out.data[d + 3] = png.data[s + 3];
        }
    }
    return out;
}

/** Encode `png`, halving resolution until the PNG is <= maxBytes (or it can't shrink further). */
export function encodeWithinCap(png: PNG, maxBytes: number): Buffer {
    let current = png;
    let buf = PNG.sync.write(current);
    while (buf.length > maxBytes && current.width > 320) {
        current = resizeNearest(current, 0.5);
        buf = PNG.sync.write(current);
    }
    return buf;
}

/** Horizontally montage images (heights normalized to the tallest) with a gap + bg. */
export function composite(panels: PNG[]): PNG {
    const gap = TRIPTYCH.gap;
    const bg = TRIPTYCH.bg;
    const height = Math.max(...panels.map((p) => p.height));
    const width = panels.reduce((s, p) => s + p.width, 0) + gap * (panels.length - 1);
    const out = new PNG({ width, height });
    for (let i = 0; i < out.data.length; i += 4) {
        out.data[i] = bg[0];
        out.data[i + 1] = bg[1];
        out.data[i + 2] = bg[2];
        out.data[i + 3] = bg[3];
    }
    let xOffset = 0;
    for (const panel of panels) {
        for (let y = 0; y < panel.height; y++) {
            const srcRow = y * panel.width * 4;
            const dstRow = (y * width + xOffset) * 4;
            panel.data.copy(out.data, dstRow, srcRow, srcRow + panel.width * 4);
        }
        xOffset += panel.width + gap;
    }
    return out;
}

/** Draw `text` at (x0,y0) with the 8x8 bitmap font, each pixel scaled `scale`×. Clips at edges. */
export function drawText(png: PNG, x0: number, y0: number, text: string, color: [number, number, number], scale: number): void {
    let x = x0;
    for (const ch of text) {
        const glyph = glyphFor(ch);
        for (let row = 0; row < 8; row++) {
            const bits = glyph[row];
            if (!bits) continue;
            for (let col = 0; col < 8; col++) {
                if (!((bits >> col) & 1)) continue;
                for (let dy = 0; dy < scale; dy++) {
                    const py = y0 + row * scale + dy;
                    if (py < 0 || py >= png.height) continue;
                    for (let dx = 0; dx < scale; dx++) {
                        const px = x + col * scale + dx;
                        if (px < 0 || px >= png.width) continue;
                        const o = (py * png.width + px) * 4;
                        png.data[o] = color[0];
                        png.data[o + 1] = color[1];
                        png.data[o + 2] = color[2];
                        png.data[o + 3] = 255;
                    }
                }
            }
        }
        x += 9 * scale; // 8px glyph + 1px spacing
    }
}

/**
 * Return a copy of `png` with a `bg`-coloured caption strip appended at the bottom,
 * showing `text` in white. Auto-fits the font scale to the width; if even scale 1
 * overflows, truncates the tail (keeps the name, trims the spec) with `..`.
 */
export function withBottomLabel(png: PNG, text: string, bg: [number, number, number]): PNG {
    const advance = 9; // per-char glyph cells at scale 1
    const maxW = Math.max(1, png.width - 2 * LABEL.hpad);
    let scale = LABEL.maxScale;
    while (scale > 1 && text.length * advance * scale > maxW) scale--;
    let label = text;
    const maxChars = Math.max(1, Math.floor(maxW / (advance * scale)));
    if (label.length > maxChars) label = label.slice(0, Math.max(1, maxChars - 2)) + '..';

    const stripH = 8 * scale + 2 * LABEL.vpad;
    const out = new PNG({ width: png.width, height: png.height + stripH });
    png.data.copy(out.data, 0, 0, png.data.length); // original image on top (same width)
    for (let y = png.height; y < out.height; y++) {
        for (let x = 0; x < out.width; x++) {
            const o = (y * out.width + x) * 4;
            out.data[o] = bg[0];
            out.data[o + 1] = bg[1];
            out.data[o + 2] = bg[2];
            out.data[o + 3] = 255;
        }
    }
    drawText(out, LABEL.hpad, png.height + LABEL.vpad, label, LABEL.text, scale);
    return out;
}
