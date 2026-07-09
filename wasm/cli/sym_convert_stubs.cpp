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
#include <sch_field.h>
#include <sch_io/kicad_legacy/sch_io_kicad_legacy.h>
#include <sch_io/kicad_sexpr/sch_io_kicad_sexpr.h>
#include <sch_pin.h>
#include <sch_text.h>
#include <sch_textbox.h>

// ── (b) schematic-file entry points ──────────────────────────────────────────
// Severs the schematic half of both instantiated plugins: ParseSchematic,
// SCHEMATIC/SCH_SCREEN/sheets, SCH_SYMBOL/SCH_LINE/labels/groups vtables (and
// their Plot/font/GUI edges), Fontconfig()->ListFonts and Pgm().

SCH_SHEET* SCH_IO_KICAD_SEXPR::LoadSchematicFile( const wxString& aFileName, SCHEMATIC*,
                                                  SCH_SHEET*,
                                                  const std::map<std::string, UTF8>* )
{
    THROW_IO_ERROR( wxString::Format(
            wxS( "sym_convert: schematic loading is compiled out (stub); cannot load '%s'" ),
            aFileName ) );
}


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

// ── (c) font-factory choke point ─────────────────────────────────────────────
// The single route into the font engine: severs STROKE_FONT::LoadFont (and the
// 2.7 MB newstroke glyph data), OUTLINE_FONT (freetype + harfbuzz), fontconfig.
// abort() (not a soft null) so any violated assumption surfaces immediately in
// the qa corpus instead of producing subtly wrong output.

namespace KIFONT
{

FONT* FONT::GetFont( const wxString&, bool, bool, const std::vector<wxString>*, bool )
{
    std::fprintf( stderr,
                  "sym_convert: FATAL: KIFONT::FONT::GetFont called — the font engine is "
                  "compiled out (ysync 0009 diet stub)\n" );
    std::abort();
}

} // namespace KIFONT
