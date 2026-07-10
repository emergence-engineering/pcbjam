// sym_convert link-time diet stubs (ysync 0009 size research, steps (b)+(c)).
//
// This TU is listed in add_executable(sym_convert …) BEFORE the kiface object
// library and archives, and the target links with --allow-multiple-definition:
// wasm-ld resolves duplicate strong symbols to the FIRST definition, so these
// override the real out-of-line definitions without touching KiCad sources.
// The losing definitions become unreferenced and post-link GC drops them plus
// everything only they reached.
//
// Safety (verified in 0009-kicad-lint-size-research.md §3): ConvertLibrary uses
// only the symbol-library entry points (EnumerateSymbolLib/SaveLibrary/
// SaveSymbol); parse never resolves fonts (SetUnresolvedFontName) and the
// writer prints only already-set font names. Every stub below either throws or
// aborts LOUDLY — a violated assumption fails the conversion, never corrupts it.

#include <cstdio>
#include <cstdlib>

#include <ki_exception.h>
#include <font/font.h>
#include <sch_bus_entry.h>
#include <sch_field.h>
#include <sch_io/kicad_legacy/sch_io_kicad_legacy.h>
#include <sch_io/kicad_sexpr/sch_io_kicad_sexpr.h>
#include <sch_junction.h>
#include <sch_label.h>
#include <sch_line.h>
#include <sch_pin.h>
#include <sch_sheet.h>
#include <sch_symbol.h>
#include <sch_text.h>
#include <sch_textbox.h>

// ── (b) schematic-file entry points ──────────────────────────────────────────
// Originally BOTH plugins' load+save were stubbed, severing the whole
// schematic half. The --lint mode (ysync 0009 §7) needs the REAL s-expr
// LoadSchematicFile back, so only three of the four stay stubbed: the s-expr
// SAVE (lint/convert never write schematics) and the LEGACY load+save (.sch
// lint unsupported). The re-rooted schematic object model costs binary size —
// the price of the lint tier riding this binary instead of a second wasm.

void SCH_IO_KICAD_SEXPR::SaveSchematicFile( const wxString& aFileName, SCH_SHEET*, SCHEMATIC*,
                                            const std::map<std::string, UTF8>* )
{
    THROW_IO_ERROR( wxString::Format(
            wxS( "sym_convert: schematic saving is compiled out (stub); cannot save '%s'" ),
            aFileName ) );
}


SCH_SHEET* SCH_IO_KICAD_LEGACY::LoadSchematicFile( const wxString& aFileName, SCHEMATIC*,
                                                   SCH_SHEET*,
                                                   const std::map<std::string, UTF8>* )
{
    THROW_IO_ERROR( wxString::Format(
            wxS( "sym_convert: schematic loading is compiled out (stub); cannot load '%s'" ),
            aFileName ) );
}


void SCH_IO_KICAD_LEGACY::SaveSchematicFile( const wxString& aFileName, SCH_SHEET*, SCHEMATIC*,
                                             const std::map<std::string, UTF8>* )
{
    THROW_IO_ERROR( wxString::Format(
            wxS( "sym_convert: schematic saving is compiled out (stub); cannot save '%s'" ),
            aFileName ) );
}

// ── (e) UI virtuals whose real bodies reference pruned typeinfo/data ─────────
// The kiface prune (cut e) leaves these vtable-pinned bodies referencing
// typeinfo for SCH_NAVIGATE_TOOL / SCH_EDIT_FRAME and SCH_NAVIGATE_TOOL::
// g_BackLink — DATA symbols, which (unlike functions) cannot become JS imports
// under -sERROR_ON_UNDEFINED_SYMBOLS=0. Overriding the whole virtual here makes
// the real body a discarded duplicate, so its relocations are never processed
// and the KiCad sources stay untouched. All four are user-interaction paths a
// headless converter cannot reach (hypertext clicks, the message panel).

void SCH_FIELD::DoHypertextAction( EDA_DRAW_FRAME*, const VECTOR2I& ) const
{
}


void SCH_TEXT::DoHypertextAction( EDA_DRAW_FRAME*, const VECTOR2I& ) const
{
}


void SCH_TEXTBOX::DoHypertextAction( EDA_DRAW_FRAME*, const VECTOR2I& ) const
{
}


void SCH_PIN::GetMsgPanelInfo( EDA_DRAW_FRAME*, std::vector<MSG_PANEL_ITEM>& )
{
}

// The --lint mode re-roots the schematic object model (real LoadSchematicFile);
// these model TUs' GetMsgPanelInfo overrides dynamic_cast to SCH_EDIT_FRAME,
// whose typeinfo the kiface prune removed. Same treatment as SCH_PIN above —
// message-panel population is unreachable without a frame.

void SCH_BUS_ENTRY_BASE::GetMsgPanelInfo( EDA_DRAW_FRAME*, std::vector<MSG_PANEL_ITEM>& )
{
}


void SCH_JUNCTION::GetMsgPanelInfo( EDA_DRAW_FRAME*, std::vector<MSG_PANEL_ITEM>& )
{
}


void SCH_LABEL_BASE::GetMsgPanelInfo( EDA_DRAW_FRAME*, std::vector<MSG_PANEL_ITEM>& )
{
}


void SCH_LINE::GetMsgPanelInfo( EDA_DRAW_FRAME*, std::vector<MSG_PANEL_ITEM>& )
{
}


void SCH_SHEET::GetMsgPanelInfo( EDA_DRAW_FRAME*, std::vector<MSG_PANEL_ITEM>& )
{
}


void SCH_SYMBOL::GetMsgPanelInfo( EDA_DRAW_FRAME*, std::vector<MSG_PANEL_ITEM>& )
{
}

// ── (c) font-factory choke point — RETIRED by the --lint mode ─────────────────
// The abort stub on KIFONT::FONT::GetFont severed STROKE_FONT::LoadFont (and
// the 2.7 MB newstroke glyph data), OUTLINE_FONT (freetype + harfbuzz) and
// fontconfig while this binary only converted symbol libraries (whose parse
// never resolves fonts). Schematic lint changed that: SCH_SCREEN::Append
// RTree-inserts every parsed item by bounding box, and any text bbox resolves
// the draw font — so the REAL font engine is linked again (wasm fontconfig is
// the no-op variant; unknown names fall back to the stroke font). This is the
// bulk of the lint tier's size cost over the pure converter.
