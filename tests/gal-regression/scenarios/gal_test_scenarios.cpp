/**
 * GAL Test Scenarios Implementation
 *
 * Uses KiCad's GAL API to render test patterns.
 * These serve as baselines for WEBGL_GAL visual regression testing.
 */

#include "gal_test_scenarios.h"
#include "kicad_stubs.h"  // For COLOR4D, VECTOR2D, EDA_ANGLE

// Include GAL header for the actual class definition
#include <gal/graphics_abstraction_layer.h>

#include <cmath>
#include <vector>
#include <deque>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace GALTest {

// Import KIGFX types
using KIGFX::COLOR4D;
using KIGFX::GAL;

// Scenario names
static const char* SCENARIO_NAMES[] = {
    "basic-lines",
    "line-widths",
    "circles",
    "arcs",
    "rectangles",
    "polygons",
    "alpha-blending",
    "transforms",
    "grid-cursor",
    "segments",
    "complex-scene"
};

static const int SCENARIO_COUNT = sizeof(SCENARIO_NAMES) / sizeof(SCENARIO_NAMES[0]);

int GetScenarioCount() {
    return SCENARIO_COUNT;
}

const char* GetScenarioName(int index) {
    if (index >= 0 && index < SCENARIO_COUNT) {
        return SCENARIO_NAMES[index];
    }
    return "unknown";
}

//=============================================================================
// Scenario Implementations using GAL API
//=============================================================================

// Scenario 0: Basic lines
static void RenderBasicLines(KIGFX::GAL* gal, int width, int height) {
    double cx = width / 2.0;
    double cy = height / 2.0;
    double len = std::min(width, height) * 0.35;

    gal->SetLineWidth(1.0);
    gal->SetIsFill(false);
    gal->SetIsStroke(true);

    // Horizontal line (red)
    gal->SetStrokeColor(COLOR4D(1.0, 0.2, 0.2, 1.0));
    gal->DrawLine(VECTOR2D(cx - len, cy), VECTOR2D(cx + len, cy));

    // Vertical line (green)
    gal->SetStrokeColor(COLOR4D(0.2, 1.0, 0.2, 1.0));
    gal->DrawLine(VECTOR2D(cx, cy - len), VECTOR2D(cx, cy + len));

    // Diagonal lines (blue, yellow)
    gal->SetStrokeColor(COLOR4D(0.2, 0.2, 1.0, 1.0));
    gal->DrawLine(VECTOR2D(cx - len, cy - len), VECTOR2D(cx + len, cy + len));

    gal->SetStrokeColor(COLOR4D(1.0, 1.0, 0.2, 1.0));
    gal->DrawLine(VECTOR2D(cx - len, cy + len), VECTOR2D(cx + len, cy - len));

    // Radial lines (white)
    gal->SetStrokeColor(COLOR4D(0.8, 0.8, 0.8, 1.0));
    for (int i = 0; i < 8; i++) {
        double angle = M_PI * i / 8;
        double x = cos(angle) * len * 0.8;
        double y = sin(angle) * len * 0.8;
        gal->DrawLine(VECTOR2D(cx + x * 0.3, cy + y * 0.3), VECTOR2D(cx + x, cy + y));
    }
}

// Scenario 1: Line widths
static void RenderLineWidths(KIGFX::GAL* gal, int width, int height) {
    double widths[] = {0.5, 1.0, 2.0, 3.0, 5.0, 8.0, 12.0};
    int count = sizeof(widths) / sizeof(widths[0]);

    double margin = 50.0;
    double spacing = (height - 2 * margin) / (count + 1);

    gal->SetIsFill(false);
    gal->SetIsStroke(true);

    for (int i = 0; i < count; i++) {
        double y = margin + (i + 1) * spacing;

        // Color gradient
        double t = (double)i / (count - 1);
        gal->SetStrokeColor(COLOR4D(1.0 - t * 0.5, 0.3 + t * 0.4, 0.2 + t * 0.6, 1.0));
        gal->SetLineWidth(widths[i]);
        gal->DrawLine(VECTOR2D(margin, y), VECTOR2D(width - margin, y));
    }
}

// Scenario 2: Circles
static void RenderCircles(KIGFX::GAL* gal, int width, int height) {
    double cx = width / 2.0;
    double cy = height / 2.0;

    // Filled circles
    gal->SetIsFill(true);
    gal->SetIsStroke(false);

    gal->SetFillColor(COLOR4D(0.8, 0.2, 0.2, 0.8));
    gal->DrawCircle(VECTOR2D(cx - 150, cy - 100), 60);

    gal->SetFillColor(COLOR4D(0.2, 0.8, 0.2, 0.8));
    gal->DrawCircle(VECTOR2D(cx, cy - 100), 80);

    gal->SetFillColor(COLOR4D(0.2, 0.2, 0.8, 0.8));
    gal->DrawCircle(VECTOR2D(cx + 150, cy - 100), 50);

    // Stroked circles
    gal->SetIsFill(false);
    gal->SetIsStroke(true);
    gal->SetLineWidth(2.0);

    gal->SetStrokeColor(COLOR4D(1.0, 0.5, 0.0, 1.0));
    gal->DrawCircle(VECTOR2D(cx - 150, cy + 100), 70);

    gal->SetStrokeColor(COLOR4D(0.0, 1.0, 1.0, 1.0));
    gal->DrawCircle(VECTOR2D(cx, cy + 100), 90);

    gal->SetStrokeColor(COLOR4D(1.0, 0.0, 1.0, 1.0));
    gal->DrawCircle(VECTOR2D(cx + 150, cy + 100), 55);

    // Concentric circles
    gal->SetStrokeColor(COLOR4D(0.6, 0.6, 0.6, 1.0));
    gal->SetLineWidth(1.0);
    for (double r = 20; r <= 200; r += 30) {
        gal->DrawCircle(VECTOR2D(cx, cy), r);
    }
}

// Scenario 3: Arcs
static void RenderArcs(KIGFX::GAL* gal, int width, int height) {
    double cx = width / 2.0;
    double cy = height / 2.0;
    double radius = std::min(width, height) * 0.25;

    gal->SetIsFill(false);
    gal->SetIsStroke(true);
    gal->SetLineWidth(3.0);

    // 90 degree arcs in each quadrant
    gal->SetStrokeColor(COLOR4D(1.0, 0.3, 0.3, 1.0));
    gal->DrawArc(VECTOR2D(cx, cy), radius,
                 EDA_ANGLE(0, DEGREES_T), EDA_ANGLE(90, DEGREES_T));

    gal->SetStrokeColor(COLOR4D(0.3, 1.0, 0.3, 1.0));
    gal->DrawArc(VECTOR2D(cx, cy), radius,
                 EDA_ANGLE(90, DEGREES_T), EDA_ANGLE(90, DEGREES_T));

    gal->SetStrokeColor(COLOR4D(0.3, 0.3, 1.0, 1.0));
    gal->DrawArc(VECTOR2D(cx, cy), radius,
                 EDA_ANGLE(180, DEGREES_T), EDA_ANGLE(90, DEGREES_T));

    gal->SetStrokeColor(COLOR4D(1.0, 1.0, 0.3, 1.0));
    gal->DrawArc(VECTOR2D(cx, cy), radius,
                 EDA_ANGLE(270, DEGREES_T), EDA_ANGLE(90, DEGREES_T));

    // Inner arcs
    gal->SetLineWidth(2.0);
    gal->SetStrokeColor(COLOR4D(0.8, 0.5, 0.8, 1.0));
    gal->DrawArc(VECTOR2D(cx, cy), radius * 0.6,
                 EDA_ANGLE(30, DEGREES_T), EDA_ANGLE(120, DEGREES_T));

    gal->SetStrokeColor(COLOR4D(0.5, 0.8, 0.8, 1.0));
    gal->DrawArc(VECTOR2D(cx, cy), radius * 0.6,
                 EDA_ANGLE(210, DEGREES_T), EDA_ANGLE(120, DEGREES_T));
}

// Scenario 4: Rectangles
static void RenderRectangles(KIGFX::GAL* gal, int width, int height) {
    double margin = 50.0;

    // Filled rectangles
    gal->SetIsFill(true);
    gal->SetIsStroke(false);

    gal->SetFillColor(COLOR4D(0.8, 0.2, 0.2, 0.9));
    gal->DrawRectangle(VECTOR2D(margin, margin), VECTOR2D(margin + 120, margin + 80));

    gal->SetFillColor(COLOR4D(0.2, 0.8, 0.2, 0.9));
    gal->DrawRectangle(VECTOR2D(margin + 140, margin), VECTOR2D(margin + 240, margin + 100));

    gal->SetFillColor(COLOR4D(0.2, 0.2, 0.8, 0.9));
    gal->DrawRectangle(VECTOR2D(margin + 260, margin), VECTOR2D(margin + 340, margin + 120));

    // Stroked rectangles
    gal->SetIsFill(false);
    gal->SetIsStroke(true);
    gal->SetLineWidth(2.0);

    gal->SetStrokeColor(COLOR4D(1.0, 0.5, 0.0, 1.0));
    gal->DrawRectangle(VECTOR2D(margin, height - margin - 100),
                       VECTOR2D(margin + 150, height - margin - 20));

    gal->SetStrokeColor(COLOR4D(0.0, 1.0, 1.0, 1.0));
    gal->DrawRectangle(VECTOR2D(margin + 170, height - margin - 110),
                       VECTOR2D(margin + 280, height - margin - 20));

    gal->SetStrokeColor(COLOR4D(1.0, 0.0, 1.0, 1.0));
    gal->DrawRectangle(VECTOR2D(margin + 300, height - margin - 90),
                       VECTOR2D(margin + 390, height - margin - 20));

    // Nested rectangles
    gal->SetLineWidth(1.0);
    double cx = width / 2.0;
    double cy = height / 2.0;
    for (int i = 0; i < 6; i++) {
        double t = (double)i / 5;
        gal->SetStrokeColor(COLOR4D(t, 0.5, 1.0 - t, 1.0));
        double size = 30 + i * 25;
        gal->DrawRectangle(VECTOR2D(cx - size, cy - size * 0.6),
                           VECTOR2D(cx + size, cy + size * 0.6));
    }
}

// Scenario 5: Polygons
static void RenderPolygons(KIGFX::GAL* gal, int width, int height) {
    double cx = width / 2.0;
    double cy = height / 2.0;

    // Triangle (filled)
    gal->SetIsFill(true);
    gal->SetIsStroke(false);
    gal->SetFillColor(COLOR4D(1.0, 0.3, 0.3, 0.8));

    std::deque<VECTOR2D> triangle = {
        VECTOR2D(cx - 200, cy - 50),
        VECTOR2D(cx - 130, cy - 50),
        VECTOR2D(cx - 165, cy - 120)
    };
    gal->DrawPolygon(triangle);

    // Square (filled)
    gal->SetFillColor(COLOR4D(0.3, 1.0, 0.3, 0.8));
    std::deque<VECTOR2D> square = {
        VECTOR2D(cx - 50, cy - 50),
        VECTOR2D(cx + 30, cy - 50),
        VECTOR2D(cx + 30, cy - 130),
        VECTOR2D(cx - 50, cy - 130)
    };
    gal->DrawPolygon(square);

    // Pentagon (filled)
    gal->SetFillColor(COLOR4D(0.3, 0.3, 1.0, 0.8));
    std::deque<VECTOR2D> pentagon;
    for (int i = 0; i < 5; i++) {
        double angle = -M_PI / 2 + 2 * M_PI * i / 5;
        pentagon.push_back(VECTOR2D(cx + 165 + cos(angle) * 50, cy - 90 + sin(angle) * 50));
    }
    gal->DrawPolygon(pentagon);

    // Star (stroked)
    gal->SetIsFill(false);
    gal->SetIsStroke(true);
    gal->SetLineWidth(2.0);
    gal->SetStrokeColor(COLOR4D(1.0, 0.8, 0.0, 1.0));

    std::deque<VECTOR2D> star;
    for (int i = 0; i < 10; i++) {
        double angle = -M_PI / 2 + M_PI * i / 5;
        double r = (i % 2 == 0) ? 60 : 30;
        star.push_back(VECTOR2D(cx + cos(angle) * r, cy + 80 + sin(angle) * r));
    }
    // Draw as polyline (closed)
    std::vector<VECTOR2D> starVec(star.begin(), star.end());
    starVec.push_back(star.front());  // Close the shape
    gal->DrawPolyline(starVec);

    // Hexagon (stroked)
    gal->SetStrokeColor(COLOR4D(0.8, 0.3, 0.8, 1.0));
    std::deque<VECTOR2D> hexagon;
    for (int i = 0; i < 6; i++) {
        double angle = M_PI * i / 3;
        hexagon.push_back(VECTOR2D(cx - 150 + cos(angle) * 45, cy + 80 + sin(angle) * 45));
    }
    std::vector<VECTOR2D> hexVec(hexagon.begin(), hexagon.end());
    hexVec.push_back(hexagon.front());  // Close the shape
    gal->DrawPolyline(hexVec);
}

// Scenario 6: Alpha blending
static void RenderAlphaBlending(KIGFX::GAL* gal, int width, int height) {
    double cx = width / 2.0;
    double cy = height / 2.0;

    gal->SetIsFill(true);
    gal->SetIsStroke(false);

    // Overlapping rectangles with different alphas
    gal->SetFillColor(COLOR4D(1.0, 0.0, 0.0, 0.5));
    gal->DrawRectangle(VECTOR2D(cx - 150, cy - 80), VECTOR2D(cx + 30, cy + 40));

    gal->SetFillColor(COLOR4D(0.0, 1.0, 0.0, 0.5));
    gal->DrawRectangle(VECTOR2D(cx - 60, cy - 80), VECTOR2D(cx + 120, cy + 40));

    gal->SetFillColor(COLOR4D(0.0, 0.0, 1.0, 0.5));
    gal->DrawRectangle(VECTOR2D(cx - 105, cy - 20), VECTOR2D(cx + 75, cy + 100));

    // Overlapping circles
    gal->SetFillColor(COLOR4D(1.0, 1.0, 0.0, 0.4));
    gal->DrawCircle(VECTOR2D(cx - 180, cy + 100), 60);

    gal->SetFillColor(COLOR4D(0.0, 1.0, 1.0, 0.4));
    gal->DrawCircle(VECTOR2D(cx - 130, cy + 100), 60);

    gal->SetFillColor(COLOR4D(1.0, 0.0, 1.0, 0.4));
    gal->DrawCircle(VECTOR2D(cx - 155, cy + 60), 60);

    // Alpha gradient
    for (int i = 0; i < 8; i++) {
        double alpha = 0.1 + i * 0.1;
        gal->SetFillColor(COLOR4D(0.5, 0.5, 0.5, alpha));
        gal->DrawRectangle(VECTOR2D(cx + 50 + i * 30, cy - 50),
                           VECTOR2D(cx + 75 + i * 30, cy + 50));
    }
}

// Scenario 7: Transforms
static void RenderTransforms(KIGFX::GAL* gal, int width, int height) {
    double cx = width / 2.0;
    double cy = height / 2.0;

    gal->SetIsFill(false);
    gal->SetIsStroke(true);
    gal->SetLineWidth(2.0);

    // Original (reference)
    gal->SetStrokeColor(COLOR4D(0.5, 0.5, 0.5, 1.0));
    gal->DrawRectangle(VECTOR2D(cx - 230, cy - 120), VECTOR2D(cx - 170, cy - 80));

    // Translated
    gal->Save();
    gal->Translate(VECTOR2D(100, 20));
    gal->SetStrokeColor(COLOR4D(1.0, 0.3, 0.3, 1.0));
    gal->DrawRectangle(VECTOR2D(cx - 230, cy - 120), VECTOR2D(cx - 170, cy - 80));
    gal->Restore();

    // Rotated
    gal->Save();
    gal->Translate(VECTOR2D(cx, cy - 80));
    gal->Rotate(30.0 * M_PI / 180.0);
    gal->SetStrokeColor(COLOR4D(0.3, 1.0, 0.3, 1.0));
    gal->DrawRectangle(VECTOR2D(-30, -20), VECTOR2D(30, 20));
    gal->Restore();

    // Scaled
    gal->Save();
    gal->Translate(VECTOR2D(cx + 120, cy - 80));
    gal->Scale(VECTOR2D(1.5, 0.8));
    gal->SetStrokeColor(COLOR4D(0.3, 0.3, 1.0, 1.0));
    gal->DrawRectangle(VECTOR2D(-30, -20), VECTOR2D(30, 20));
    gal->Restore();

    // Combined transforms
    gal->Save();
    gal->Translate(VECTOR2D(cx, cy + 80));
    gal->Rotate(45.0 * M_PI / 180.0);
    gal->Scale(VECTOR2D(1.2, 1.2));
    gal->SetStrokeColor(COLOR4D(1.0, 1.0, 0.3, 1.0));
    gal->DrawRectangle(VECTOR2D(-40, -25), VECTOR2D(40, 25));
    gal->Restore();

    // Nested transforms
    gal->Save();
    gal->Translate(VECTOR2D(cx - 150, cy + 100));
    gal->SetStrokeColor(COLOR4D(0.8, 0.4, 0.8, 1.0));
    gal->DrawCircle(VECTOR2D(0, 0), 30);

    gal->Save();
    gal->Rotate(60.0 * M_PI / 180.0);
    gal->Translate(VECTOR2D(50, 0));
    gal->SetStrokeColor(COLOR4D(0.4, 0.8, 0.8, 1.0));
    gal->DrawCircle(VECTOR2D(0, 0), 20);
    gal->Restore();

    gal->Restore();
}

// Scenario 8: Grid and cursor
static void RenderGridCursor(KIGFX::GAL* gal, int width, int height) {
    gal->SetIsFill(false);
    gal->SetIsStroke(true);

    // Grid
    gal->SetStrokeColor(COLOR4D(0.3, 0.3, 0.4, 0.5));
    gal->SetLineWidth(1.0);

    double gridSize = 40.0;
    for (double x = gridSize; x < width; x += gridSize) {
        gal->DrawLine(VECTOR2D(x, 0), VECTOR2D(x, height));
    }
    for (double y = gridSize; y < height; y += gridSize) {
        gal->DrawLine(VECTOR2D(0, y), VECTOR2D(width, y));
    }

    // Major grid
    gal->SetStrokeColor(COLOR4D(0.4, 0.4, 0.5, 0.7));
    double majorGridSize = 200.0;
    gal->SetLineWidth(2.0);
    for (double x = majorGridSize; x < width; x += majorGridSize) {
        gal->DrawLine(VECTOR2D(x, 0), VECTOR2D(x, height));
    }
    for (double y = majorGridSize; y < height; y += majorGridSize) {
        gal->DrawLine(VECTOR2D(0, y), VECTOR2D(width, y));
    }

    // Cursor (crosshair)
    double cx = width / 2.0;
    double cy = height / 2.0;
    double cursorSize = 30.0;

    gal->SetLineWidth(2.0);
    gal->SetStrokeColor(COLOR4D(1.0, 1.0, 1.0, 1.0));
    gal->DrawLine(VECTOR2D(cx - cursorSize, cy), VECTOR2D(cx + cursorSize, cy));
    gal->DrawLine(VECTOR2D(cx, cy - cursorSize), VECTOR2D(cx, cy + cursorSize));

    // Cursor circle
    gal->SetStrokeColor(COLOR4D(1.0, 1.0, 0.0, 0.8));
    gal->DrawCircle(VECTOR2D(cx, cy), cursorSize * 0.8);
}

// Scenario 9: Segments (thick lines with round caps)
static void RenderSegments(KIGFX::GAL* gal, int width, int height) {
    double margin = 80.0;

    // Horizontal segments with different widths
    double widths[] = {5.0, 10.0, 20.0, 30.0};
    int count = sizeof(widths) / sizeof(widths[0]);

    gal->SetIsFill(true);
    gal->SetIsStroke(false);

    for (int i = 0; i < count; i++) {
        double y = margin + i * 80;
        double w = widths[i];

        gal->SetFillColor(COLOR4D(0.3 + i * 0.2, 0.5, 0.8 - i * 0.15, 1.0));

        // DrawSegment draws a rounded segment
        gal->DrawSegment(VECTOR2D(margin, y), VECTOR2D(width - margin, y), w);
    }

    // Diagonal segment
    gal->SetFillColor(COLOR4D(1.0, 0.5, 0.2, 1.0));
    gal->DrawSegment(VECTOR2D(margin, height - margin),
                     VECTOR2D(width / 2.0, height - margin - 150), 15.0);
}

// Scenario 10: Complex scene (PCB-like)
static void RenderComplexScene(KIGFX::GAL* gal, int width, int height) {
    // Use layer depths to ensure proper z-ordering
    // Lower depth = closer to camera (drawn on top with GL_LESS)

    // Background "board" - deepest layer
    gal->SetLayerDepth(100);
    gal->SetIsFill(true);
    gal->SetIsStroke(false);
    gal->SetFillColor(COLOR4D(0.1, 0.3, 0.1, 1.0));
    gal->DrawRectangle(VECTOR2D(50, 50), VECTOR2D(width - 50, height - 50));

    // Traces (copper) - middle layer
    gal->SetLayerDepth(50);
    gal->SetIsFill(false);
    gal->SetIsStroke(true);
    gal->SetStrokeColor(COLOR4D(0.8, 0.6, 0.2, 1.0));
    gal->SetLineWidth(3.0);

    // Horizontal traces
    for (int i = 0; i < 5; i++) {
        double y = 100 + i * 100;
        gal->DrawLine(VECTOR2D(80, y), VECTOR2D(width - 80, y));
    }

    // Vertical traces
    for (int i = 0; i < 6; i++) {
        double x = 100 + i * 120;
        gal->DrawLine(VECTOR2D(x, 80), VECTOR2D(x, height - 80));
    }

    // Pads (circles) - above traces
    gal->SetLayerDepth(30);
    gal->SetIsFill(true);
    gal->SetIsStroke(false);
    gal->SetFillColor(COLOR4D(0.9, 0.7, 0.3, 1.0));
    for (int i = 0; i < 5; i++) {
        for (int j = 0; j < 6; j++) {
            double x = 100 + j * 120;
            double y = 100 + i * 100;
            gal->DrawCircle(VECTOR2D(x, y), 15);
        }
    }

    // Holes - above pads
    gal->SetLayerDepth(20);
    gal->SetFillColor(COLOR4D(0.1, 0.1, 0.1, 1.0));
    for (int i = 0; i < 5; i++) {
        for (int j = 0; j < 6; j++) {
            double x = 100 + j * 120;
            double y = 100 + i * 100;
            gal->DrawCircle(VECTOR2D(x, y), 5);
        }
    }

    // Component outline - top layer
    gal->SetLayerDepth(10);
    gal->SetIsFill(false);
    gal->SetIsStroke(true);
    gal->SetStrokeColor(COLOR4D(1.0, 1.0, 0.0, 1.0));
    gal->SetLineWidth(1.0);
    gal->DrawRectangle(VECTOR2D(width / 2 - 80, height / 2 - 40),
                       VECTOR2D(width / 2 + 80, height / 2 + 40));

    // Reference designator placeholder - topmost
    gal->SetLayerDepth(5);
    gal->SetStrokeColor(COLOR4D(1.0, 1.0, 1.0, 1.0));
    gal->DrawRectangle(VECTOR2D(width / 2 - 20, height / 2 - 15),
                       VECTOR2D(width / 2 + 20, height / 2 + 15));
}

//=============================================================================
// Main dispatch function
//=============================================================================

void RenderScenario(KIGFX::GAL* gal, int index, int width, int height) {
    switch (index) {
        case 0: RenderBasicLines(gal, width, height); break;
        case 1: RenderLineWidths(gal, width, height); break;
        case 2: RenderCircles(gal, width, height); break;
        case 3: RenderArcs(gal, width, height); break;
        case 4: RenderRectangles(gal, width, height); break;
        case 5: RenderPolygons(gal, width, height); break;
        case 6: RenderAlphaBlending(gal, width, height); break;
        case 7: RenderTransforms(gal, width, height); break;
        case 8: RenderGridCursor(gal, width, height); break;
        case 9: RenderSegments(gal, width, height); break;
        case 10: RenderComplexScene(gal, width, height); break;
        default: break;
    }
}

}  // namespace GALTest
