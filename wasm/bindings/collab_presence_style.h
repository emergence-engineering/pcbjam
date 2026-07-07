/*
 * Presence overlay styling (collab-presence tuner) — shared by the pcbnew and
 * eeschema binding TUs so the drawing never diverges between editors.
 *
 * Every visual knob of the remote-presence rendering (selection boxes, name
 * tags, cursors, comment pin dots) lives in STYLE, JSON-patchable at runtime
 * via kicadCollabSetStyle — the dev-time PresenceTuner panel drives it to find
 * the look we want; the chosen values then become the defaults here.
 * Defaults == the shipped look.
 */

#pragma once

#ifdef __EMSCRIPTEN__

#include <gal/color4d.h>
#include <geometry/eda_angle.h>
#include <geometry/shape_poly_set.h>
#include <math/util.h>
#include <math/box2.h>
#include <view/view_overlay.h>
#include <nlohmann/json.hpp>
#include <algorithm>
#include <string>
#include <vector>
#include <wx/string.h>

namespace pcbjam_presence {

using json = nlohmann::json;

struct STYLE
{
    // ── selection box ──────────────────────────────────────────────────────
    // 0 rect · 1 corner brackets · 2 underline · 3 rounded rect · 4 filled only
    // 5 exact item outline (pcbnew; eeschema falls back to rect)
    int    selShape       = 0;
    double selStrokeWidth = 2.5;   // px
    double selStrokeAlpha = 0.9;
    double selFillAlpha   = 0.0;   // 0 = no fill
    double selPaddingPx   = 4.0;   // bbox inflate
    double selCornerPx    = 8.0;   // bracket arm length / rounding radius

    // ── selection name tag ────────────────────────────────────────────────
    bool   labelShow     = true;
    double labelSizePx   = 9.0;
    bool   labelChip     = false;  // filled background chip + white text
    int    labelVPos     = 0;      // 0 top · 1 bottom
    int    labelHPos     = 0;      // 0 start · 1 end · 2 center
    bool   labelInside   = false;  // inside vs outside the box
    double labelOffsetPx = 8.0;

    // ── remote cursor ─────────────────────────────────────────────────────
    // 0 cross · 1 pointer triangle · 2 circle + dot
    int    cursorShape        = 0;
    double cursorSizePx       = 7.0;
    double cursorWidthPx      = 2.0;
    double cursorAlpha        = 0.9;
    bool   cursorLabel        = true;
    double cursorLabelSizePx  = 10.0;
    bool   cursorLabelChip    = false;

    // ── colors ────────────────────────────────────────────────────────────
    // fixedColor: every peer in ONE color ("" = off). palette: recolor peers
    // by name hash from this list ([] = off) — for trying palettes without
    // changing what senders publish. Peer-provided color is the fallback.
    std::string              fixedColor;
    std::vector<std::string> palette;

    // ── comment pin dots ──────────────────────────────────────────────────
    double pinRadiusPx     = 7.0;
    double pinRingPx       = 1.5;
    double pinRingAlpha    = 0.9;
    double pinFillAlpha    = 1.0;
    double pinResolvedAlpha = 0.3;
};

inline KIGFX::COLOR4D parseHexColor( const std::string& aHex, const KIGFX::COLOR4D& aFallback )
{
    if( aHex.size() == 7 && aHex[0] == '#' )
    {
        long v = strtol( aHex.c_str() + 1, nullptr, 16 );
        return KIGFX::COLOR4D( ( ( v >> 16 ) & 0xff ) / 255.0, ( ( v >> 8 ) & 0xff ) / 255.0,
                               ( v & 0xff ) / 255.0, 1.0 );
    }

    return aFallback;
}

/** Patch aStyle from a (partial) JSON object — unknown keys ignored, absent
 *  keys keep their value, so the tuner can send full or incremental states. */
inline void patchStyle( STYLE& aStyle, const json& j )
{
    aStyle.selShape       = j.value( "selShape", aStyle.selShape );
    aStyle.selStrokeWidth = j.value( "selStrokeWidth", aStyle.selStrokeWidth );
    aStyle.selStrokeAlpha = j.value( "selStrokeAlpha", aStyle.selStrokeAlpha );
    aStyle.selFillAlpha   = j.value( "selFillAlpha", aStyle.selFillAlpha );
    aStyle.selPaddingPx   = j.value( "selPaddingPx", aStyle.selPaddingPx );
    aStyle.selCornerPx    = j.value( "selCornerPx", aStyle.selCornerPx );

    aStyle.labelShow     = j.value( "labelShow", aStyle.labelShow );
    aStyle.labelSizePx   = j.value( "labelSizePx", aStyle.labelSizePx );
    aStyle.labelChip     = j.value( "labelChip", aStyle.labelChip );
    aStyle.labelVPos     = j.value( "labelVPos", aStyle.labelVPos );
    aStyle.labelHPos     = j.value( "labelHPos", aStyle.labelHPos );
    aStyle.labelInside   = j.value( "labelInside", aStyle.labelInside );
    aStyle.labelOffsetPx = j.value( "labelOffsetPx", aStyle.labelOffsetPx );

    aStyle.cursorShape       = j.value( "cursorShape", aStyle.cursorShape );
    aStyle.cursorSizePx      = j.value( "cursorSizePx", aStyle.cursorSizePx );
    aStyle.cursorWidthPx     = j.value( "cursorWidthPx", aStyle.cursorWidthPx );
    aStyle.cursorAlpha       = j.value( "cursorAlpha", aStyle.cursorAlpha );
    aStyle.cursorLabel       = j.value( "cursorLabel", aStyle.cursorLabel );
    aStyle.cursorLabelSizePx = j.value( "cursorLabelSizePx", aStyle.cursorLabelSizePx );
    aStyle.cursorLabelChip   = j.value( "cursorLabelChip", aStyle.cursorLabelChip );

    aStyle.fixedColor = j.value( "fixedColor", aStyle.fixedColor );

    if( j.contains( "palette" ) && j["palette"].is_array() )
    {
        aStyle.palette.clear();

        for( const json& c : j["palette"] )
        {
            if( c.is_string() )
                aStyle.palette.push_back( c.get<std::string>() );
        }
    }

    aStyle.pinRadiusPx      = j.value( "pinRadiusPx", aStyle.pinRadiusPx );
    aStyle.pinRingPx        = j.value( "pinRingPx", aStyle.pinRingPx );
    aStyle.pinRingAlpha     = j.value( "pinRingAlpha", aStyle.pinRingAlpha );
    aStyle.pinFillAlpha     = j.value( "pinFillAlpha", aStyle.pinFillAlpha );
    aStyle.pinResolvedAlpha = j.value( "pinResolvedAlpha", aStyle.pinResolvedAlpha );
}

/** The color a peer renders with under this style (fixed > palette-by-name-hash
 *  > the sender-provided color). */
inline KIGFX::COLOR4D peerColor( const STYLE& aStyle, const std::string& aName,
                                 const KIGFX::COLOR4D& aProvided )
{
    if( !aStyle.fixedColor.empty() )
        return parseHexColor( aStyle.fixedColor, aProvided );

    if( !aStyle.palette.empty() )
    {
        unsigned h = 0x811c9dc5;

        for( char c : aName )
        {
            h ^= (unsigned char) c;
            h *= 0x01000193;
        }

        return parseHexColor( aStyle.palette[h % aStyle.palette.size()], aProvided );
    }

    return aProvided;
}

// Rough bitmap-font advance (the GAL stroke/bitmap glyphs are ~0.75 em wide) —
// good enough to size label chips and right-align labels for the tuner.
inline double textWidth( const std::string& aText, double aGlyphH )
{
    return aText.size() * aGlyphH * 0.75;
}

/** Name tag next to (or inside) a box, per the label placement knobs. `px` is
 *  world-units-per-screen-pixel. GAL BitmapText CENTERS on its position (the
 *  default justify is CENTER/CENTER — GAL::ResetTextAttributes), so the block
 *  math below computes a top-left and hands GAL the block's center. */
inline void drawLabel( KIGFX::VIEW_OVERLAY* aOv, const BOX2I& aBox, const std::string& aText,
                       const KIGFX::COLOR4D& aColor, double aPx, const STYLE& aS )
{
    if( !aS.labelShow || aText.empty() )
        return;

    double h = aS.labelSizePx * aPx;
    double w = textWidth( aText, h );
    double off = aS.labelOffsetPx * aPx;

    double x = aBox.GetOrigin().x;                                     // start

    if( aS.labelHPos == 1 )
        x = aBox.GetEnd().x - w;                                       // end
    else if( aS.labelHPos == 2 )
        x = ( aBox.GetOrigin().x + aBox.GetEnd().x ) / 2.0 - w / 2.0;  // center

    double y;   // top of the text block

    if( aS.labelVPos == 0 )
        y = aS.labelInside ? aBox.GetOrigin().y + off : aBox.GetOrigin().y - off - h;
    else
        y = aS.labelInside ? aBox.GetEnd().y - off - h : aBox.GetEnd().y + off;

    if( aS.labelChip )
    {
        double padX = 3 * aPx, padY = 2 * aPx;
        aOv->SetIsStroke( false );
        aOv->SetIsFill( true );
        aOv->SetFillColor( aColor.WithAlpha( 0.92 ) );
        aOv->Rectangle( VECTOR2D( x - padX, y - padY ),
                        VECTOR2D( x + w + padX, y + h + padY ) );
        aOv->SetIsStroke( true );
        aOv->SetIsFill( false );
        aOv->SetStrokeColor( KIGFX::COLOR4D( 1, 1, 1, 1 ) );
    }
    else
    {
        aOv->SetIsStroke( true );
        aOv->SetIsFill( false );
        aOv->SetStrokeColor( aColor );
    }

    aOv->SetGlyphSize( VECTOR2I( KiROUND( h ), KiROUND( h ) ) );
    aOv->BitmapText( wxString::FromUTF8( aText.c_str() ),
                     VECTOR2I( KiROUND( x + w / 2 ), KiROUND( y + h / 2 ) ), ANGLE_0 );
}

/** Selection highlight for one item, in the chosen shape. `aOutline` is the
 *  item's exact geometry for selShape 5 (pcbnew supplies it; eeschema passes
 *  nullptr and shape 5 falls back to the bbox rectangle). */
inline void drawSelectionBox( KIGFX::VIEW_OVERLAY* aOv, BOX2I aBox, const std::string& aName,
                              const KIGFX::COLOR4D& aColor, double aPx, const STYLE& aS,
                              const SHAPE_POLY_SET* aOutline = nullptr )
{
    if( aS.selShape == 5 && aOutline && aOutline->OutlineCount() > 0 )
    {
        aOv->SetIsStroke( true );
        aOv->SetIsFill( aS.selFillAlpha > 0.001 );
        aOv->SetStrokeColor( aColor.WithAlpha( aS.selStrokeAlpha ) );
        aOv->SetFillColor( aColor.WithAlpha( aS.selFillAlpha ) );
        aOv->SetLineWidth( aS.selStrokeWidth * aPx );
        aOv->Polygon( *aOutline );

        BOX2I labelBox = aOutline->BBox();
        labelBox.Inflate( KiROUND( aS.selPaddingPx * aPx ) );
        drawLabel( aOv, labelBox, aName, aColor, aPx, aS );
        return;
    }

    aBox.Inflate( KiROUND( aS.selPaddingPx * aPx ) );

    const VECTOR2D tl = aBox.GetOrigin();
    const VECTOR2D br = aBox.GetEnd();
    const VECTOR2D tr( br.x, tl.y );
    const VECTOR2D bl( tl.x, br.y );

    bool fill = aS.selFillAlpha > 0.001 || aS.selShape == 4;
    double fillAlpha = aS.selShape == 4 && aS.selFillAlpha <= 0.001 ? 0.18 : aS.selFillAlpha;

    aOv->SetIsStroke( aS.selShape != 4 );
    aOv->SetIsFill( fill );
    aOv->SetStrokeColor( aColor.WithAlpha( aS.selStrokeAlpha ) );
    aOv->SetFillColor( aColor.WithAlpha( fillAlpha ) );
    aOv->SetLineWidth( aS.selStrokeWidth * aPx );

    switch( aS.selShape )
    {
    default:
    case 0: // rectangle (fill rides along when selFillAlpha > 0)
    case 4: // filled only
        aOv->Rectangle( tl, br );
        break;

    case 1: // corner brackets
    {
        if( fill )
        {
            aOv->SetIsStroke( false );
            aOv->Rectangle( tl, br );
            aOv->SetIsStroke( true );
            aOv->SetIsFill( false );
        }

        double arm = std::min( { aS.selCornerPx * aPx, ( br.x - tl.x ) / 2.0,
                                 ( br.y - tl.y ) / 2.0 } );
        aOv->Line( tl, tl + VECTOR2D( arm, 0 ) );
        aOv->Line( tl, tl + VECTOR2D( 0, arm ) );
        aOv->Line( tr, tr + VECTOR2D( -arm, 0 ) );
        aOv->Line( tr, tr + VECTOR2D( 0, arm ) );
        aOv->Line( bl, bl + VECTOR2D( arm, 0 ) );
        aOv->Line( bl, bl + VECTOR2D( 0, -arm ) );
        aOv->Line( br, br + VECTOR2D( -arm, 0 ) );
        aOv->Line( br, br + VECTOR2D( 0, -arm ) );
        break;
    }

    case 2: // underline
        aOv->Line( bl, br );
        break;

    case 3: // rounded rectangle (lines + quarter arcs)
    {
        if( fill )
        {
            aOv->SetIsStroke( false );
            aOv->Rectangle( tl, br );
            aOv->SetIsStroke( true );
            aOv->SetIsFill( false );
        }

        double r = std::min( { aS.selCornerPx * aPx, ( br.x - tl.x ) / 2.0,
                               ( br.y - tl.y ) / 2.0 } );
        aOv->Line( tl + VECTOR2D( r, 0 ), tr + VECTOR2D( -r, 0 ) );
        aOv->Line( bl + VECTOR2D( r, 0 ), br + VECTOR2D( -r, 0 ) );
        aOv->Line( tl + VECTOR2D( 0, r ), bl + VECTOR2D( 0, -r ) );
        aOv->Line( tr + VECTOR2D( 0, r ), br + VECTOR2D( 0, -r ) );
        // Screen-y grows down: the "top-left" corner arc spans 180°→270°.
        aOv->Arc( tl + VECTOR2D( r, r ), r, EDA_ANGLE( 180, DEGREES_T ), EDA_ANGLE( 270, DEGREES_T ) );
        aOv->Arc( tr + VECTOR2D( -r, r ), r, EDA_ANGLE( 270, DEGREES_T ), EDA_ANGLE( 360, DEGREES_T ) );
        aOv->Arc( br + VECTOR2D( -r, -r ), r, EDA_ANGLE( 0, DEGREES_T ), EDA_ANGLE( 90, DEGREES_T ) );
        aOv->Arc( bl + VECTOR2D( r, -r ), r, EDA_ANGLE( 90, DEGREES_T ), EDA_ANGLE( 180, DEGREES_T ) );
        break;
    }
    }

    drawLabel( aOv, aBox, aName, aColor, aPx, aS );
}

/** Remote cursor (+ name label) in the chosen shape. */
inline void drawCursor( KIGFX::VIEW_OVERLAY* aOv, const VECTOR2D& aPos, const std::string& aName,
                        const KIGFX::COLOR4D& aColor, double aPx, const STYLE& aS )
{
    double s = aS.cursorSizePx * aPx;
    KIGFX::COLOR4D c = aColor.WithAlpha( aS.cursorAlpha );

    aOv->SetIsFill( false );
    aOv->SetIsStroke( true );
    aOv->SetStrokeColor( c );
    aOv->SetLineWidth( aS.cursorWidthPx * aPx );

    switch( aS.cursorShape )
    {
    default:
    case 0: // cross
        aOv->Cross( aPos, KiROUND( s ) );
        break;

    case 1: // pointer triangle (mouse-arrow-ish, filled)
    {
        aOv->SetIsFill( true );
        aOv->SetFillColor( c );
        VECTOR2D pts[3] = { aPos, aPos + VECTOR2D( 0.45 * s * 2, 1.6 * s ),
                            aPos + VECTOR2D( 1.1 * s, 1.1 * s ) };
        aOv->Polygon( pts, 3 );
        aOv->SetIsFill( false );
        break;
    }

    case 2: // circle + center dot
        aOv->Circle( aPos, s );
        aOv->SetIsFill( true );
        aOv->SetFillColor( c );
        aOv->Circle( aPos, 1.5 * aPx );
        aOv->SetIsFill( false );
        break;
    }

    if( aS.cursorLabel && !aName.empty() )
    {
        double h = aS.cursorLabelSizePx * aPx;
        double w = textWidth( aName, h );
        // Top-left of the text block, below-right of the cursor glyph; GAL
        // centers text on its position, so it gets the block center.
        VECTOR2D at = aPos + VECTOR2D( ( aS.cursorSizePx + 4 ) * aPx,
                                       ( aS.cursorSizePx + 4 ) * aPx );

        if( aS.cursorLabelChip )
        {
            double padX = 3 * aPx, padY = 2 * aPx;
            aOv->SetIsStroke( false );
            aOv->SetIsFill( true );
            aOv->SetFillColor( aColor.WithAlpha( 0.92 ) );
            aOv->Rectangle( at + VECTOR2D( -padX, -padY ),
                            at + VECTOR2D( w + padX, h + padY ) );
            aOv->SetIsStroke( true );
            aOv->SetIsFill( false );
            aOv->SetStrokeColor( KIGFX::COLOR4D( 1, 1, 1, 1 ) );
        }
        else
        {
            aOv->SetStrokeColor( c );
        }

        aOv->SetGlyphSize( VECTOR2I( KiROUND( h ), KiROUND( h ) ) );
        aOv->BitmapText( wxString::FromUTF8( aName.c_str() ),
                         VECTOR2I( KiROUND( at.x + w / 2 ), KiROUND( at.y + h / 2 ) ),
                         ANGLE_0 );
    }
}

/** Comment pin dot. */
inline void drawPin( KIGFX::VIEW_OVERLAY* aOv, const VECTOR2D& aPos, const KIGFX::COLOR4D& aColor,
                     bool aResolved, double aPx, const STYLE& aS )
{
    double fillAlpha = aResolved ? aS.pinResolvedAlpha : aS.pinFillAlpha;
    double ringAlpha = aResolved ? aS.pinRingAlpha * 0.4 : aS.pinRingAlpha;

    aOv->SetIsStroke( true );
    aOv->SetIsFill( true );
    aOv->SetFillColor( aColor.WithAlpha( fillAlpha ) );
    aOv->SetStrokeColor( KIGFX::COLOR4D( 1, 1, 1, ringAlpha ) );
    aOv->SetLineWidth( aS.pinRingPx * aPx );
    aOv->Circle( aPos, aS.pinRadiusPx * aPx );
}

} // namespace pcbjam_presence

#endif // __EMSCRIPTEN__
