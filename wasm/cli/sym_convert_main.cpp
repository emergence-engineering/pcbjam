/*
 * sym_convert — standalone KiCad file CLI, built as a WebAssembly module.
 *
 * Two modes, one binary (ysync 0009 §7 — the lint tier rides the dieted
 * converter instead of shipping a second wasm):
 *
 *   convert:  sym_convert <input.lib> <output.kicad_sym>
 *             legacy (.lib) -> S-expression (.kicad_sym) symbol-library
 *             conversion via SCH_IO_MGR::ConvertLibrary. Unchanged behavior.
 *
 *   lint:     sym_convert --lint [--strict] <file> [<file>...]
 *             "OK" = KiCad will load it (not necessarily load it UNCHANGED —
 *             KiCad normalizes while parsing). Per extension:
 *               .kicad_sch          full parse (SCH_IO_KICAD_SEXPR)
 *               .kicad_sym / .lib   full library parse (EnumerateSymbolLib)
 *               other s-expr files  structure-only (parens/strings/atoms)
 *             Every s-expr input additionally gets the uuid lints: duplicate
 *             (uuid) fields inside one node (KiCad keeps the last) and one
 *             uuid value on multiple nodes (eeschema silently Increment()s the
 *             second, pcbnew keeps both) — identity hazards for uuid-keyed
 *             sync. Warnings don't fail the run unless --strict.
 *             Exit: 0 ok, 1 any file failed, 2 usage.
 *
 * No GUI, no renderer, no embind bindings, no JS host logic. Wired into
 * eeschema/CMakeLists.txt behind the KICAD_SYM_CONVERTER_WASM option
 * (see scripts/kicad/build-sym_convert.sh).
 *
 * Targets:
 *   - Node:     built with -sENVIRONMENT=node -sNODERAWFS=1 (the default here);
 *               run with `node sym_convert.js in.lib out.kicad_sym`.
 *   - wasmtime: a follow-up build (no pthreads, -sSTANDALONE_WASM) lets the
 *               same code run host-less under `wasmtime sym_convert.wasm ...`.
 *
 * GPL note: this is GPL KiCad code. The artifact is meant to be invoked as a
 * separate process from the closed ingester, never linked into closed code.
 */

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <memory>
#include <string>
#include <vector>

#include <wx/arrstr.h>
#include <wx/filename.h>
#include <wx/init.h>
#include <wx/string.h>

#include <ki_exception.h>
#include <lib_symbol.h>
#include <pgm_base.h>
#include <project.h>
#include <settings/settings_manager.h>

#include <io/io_mgr.h>
#include <sch_io/sch_io.h>
#include <sch_io/sch_io_mgr.h>
#include <sch_screen.h>
#include <sch_sheet.h>
#include <schematic.h>

// ── minimal KiCad runtime for the schematic-load path ─────────────────────────
// LoadSchematicFile needs a SCHEMATIC with a PROJECT (settings manager), and
// ParseSchematic's tail calls Pgm().GetLanguageTag() (feeding the wasm
// no-fontconfig ListFonts, which is a cheap string walk). A minimal concrete
// PGM_BASE + headless SETTINGS_MANAGER — the qa fixtures' recipe
// (qa/schematic_utils/eeschema_test_utils.cpp) — is all that takes.

namespace
{

/** SYM_CONVERT_TRACE=1: stage prints for diagnosing hangs/traps in the field. */
void trace( const char* aMsg )
{
    if( std::getenv( "SYM_CONVERT_TRACE" ) )
        std::fprintf( stderr, "[trace] %s\n", aMsg );
}


class LINT_PGM : public PGM_BASE
{
public:
    void MacOpenFile( const wxString& ) override {}

    void CreateSettingsManager()
    {
        m_settings_manager = std::make_unique<SETTINGS_MANAGER>();
    }
};


SETTINGS_MANAGER& kiRuntime()
{
    static SETTINGS_MANAGER* s_manager = nullptr;

    if( !s_manager )
    {
        // JSON settings need a writable config dir; keep it away from any real
        // user config (0 = don't overwrite an explicit override).
        setenv( "KICAD_CONFIG_HOME", "/tmp/sym_convert-config", 0 );

        // Deliberately leaked: ~PGM_BASE runs Destroy() (curl/sentry cleanup)
        // from the EXIT_RUNTIME static-dtor pass, which the diet stubs out.
        trace( "kiRuntime: constructing LINT_PGM" );
        LINT_PGM* pgm = new LINT_PGM();
        SetPgm( pgm );
        trace( "kiRuntime: constructing SETTINGS_MANAGER" );
        pgm->CreateSettingsManager();
        s_manager = &pgm->GetSettingsManager();
        trace( "kiRuntime: ready" );
    }

    return *s_manager;
}

// ── structure-only s-expr walk + uuid lints ───────────────────────────────────
// Self-contained (no KiCad parser): balanced parens, terminated strings, and
// the two uuid pathologies. Runs on every s-expr input, INCLUDING fully parsed
// ones — the full parsers *normalize* these instead of reporting them.

struct LINT_REPORT
{
    std::vector<std::string> errors;
    std::vector<std::string> warnings;
};


struct SEXPR_NODE
{
    std::string head;      // first atom after '('
    std::string firstArg;  // second atom (a (uuid "X") node's value)
    int         line = 0;
    int         directUuidFields = 0;
    bool        sawHead = false;
};


void walkSexpr( const std::string& aText, const char* aPath, LINT_REPORT& aOut )
{
    std::vector<SEXPR_NODE> stack;
    std::map<std::string, std::vector<int>> uuidLines; // value -> lines seen on a node
    size_t i = 0;
    int    line = 1;
    int    topLevelForms = 0;

    auto err = [&]( int aLine, const std::string& aMsg )
    {
        char buf[512];
        std::snprintf( buf, sizeof( buf ), "%s:%d: error: %s", aPath, aLine, aMsg.c_str() );
        aOut.errors.push_back( buf );
    };
    auto warn = [&]( int aLine, const std::string& aMsg )
    {
        char buf[512];
        std::snprintf( buf, sizeof( buf ), "%s:%d: warning: %s", aPath, aLine, aMsg.c_str() );
        aOut.warnings.push_back( buf );
    };

    auto atomInto = [&]( SEXPR_NODE* aNode, const std::string& aAtom )
    {
        if( !aNode )
            return;

        if( !aNode->sawHead )
        {
            aNode->head = aAtom;
            aNode->sawHead = true;
        }
        else if( aNode->firstArg.empty() )
        {
            aNode->firstArg = aAtom;
        }
    };

    while( i < aText.size() )
    {
        const char c = aText[i];

        if( c == '\n' )
        {
            line++;
            i++;
        }
        else if( c == ' ' || c == '\t' || c == '\r' )
        {
            i++;
        }
        else if( c == '(' )
        {
            if( stack.empty() )
                topLevelForms++;

            SEXPR_NODE node;
            node.line = line;
            stack.push_back( node );
            i++;
        }
        else if( c == ')' )
        {
            if( stack.empty() )
            {
                err( line, "unbalanced ')'" );
                return;
            }

            SEXPR_NODE closed = stack.back();
            stack.pop_back();
            SEXPR_NODE* parent = stack.empty() ? nullptr : &stack.back();

            if( closed.head == "uuid" && parent )
            {
                parent->directUuidFields++;

                if( parent->directUuidFields == 2 )
                {
                    warn( closed.line,
                          "multiple (uuid) fields directly in one (" + parent->head
                                  + ") node — KiCad keeps only the last" );
                }

                if( !closed.firstArg.empty() )
                {
                    std::string value = closed.firstArg;

                    if( value.size() >= 2 && value.front() == '"' && value.back() == '"' )
                        value = value.substr( 1, value.size() - 2 );

                    uuidLines[value].push_back( closed.line );
                }
            }

            i++;
        }
        else if( c == '"' )
        {
            const int start = line;
            std::string atom;
            atom += c;
            i++;

            while( i < aText.size() && aText[i] != '"' )
            {
                if( aText[i] == '\\' && i + 1 < aText.size() )
                {
                    atom += aText[i];
                    i++;
                }

                if( aText[i] == '\n' )
                    line++;

                atom += aText[i];
                i++;
            }

            if( i >= aText.size() )
            {
                err( start, "unterminated string" );
                return;
            }

            atom += '"';
            i++;
            atomInto( stack.empty() ? nullptr : &stack.back(), atom );
        }
        else
        {
            std::string atom;

            while( i < aText.size() && !std::strchr( " \t\r\n()\"", aText[i] ) )
            {
                atom += aText[i];
                i++;
            }

            if( stack.empty() )
            {
                err( line, "atom outside any (…) form: '" + atom + "'" );
                return;
            }

            atomInto( &stack.back(), atom );
        }
    }

    if( !stack.empty() )
        err( stack.back().line, "unbalanced '(' — " + std::to_string( stack.size() )
                                        + " form(s) never closed" );

    if( topLevelForms == 0 && aOut.errors.empty() )
        err( 1, "no s-expression form found" );

    for( const auto& [value, lines] : uuidLines )
    {
        if( lines.size() < 2 )
            continue;

        std::string msg = "uuid \"" + value + "\" appears on " + std::to_string( lines.size() )
                          + " nodes (also line";
        msg += lines.size() > 2 ? "s" : "";

        for( size_t n = 1; n < lines.size(); n++ )
            msg += ( n > 1 ? ", " : " " ) + std::to_string( lines[n] );

        msg += ") — eeschema silently regenerates the duplicate, pcbnew keeps both";
        warn( lines[0], msg );
    }
}

// ── full-fidelity lints (the linked eeschema parsers) ─────────────────────────

void lintSchematicFile( const wxString& aAbsPath, LINT_REPORT& aOut )
{
    SETTINGS_MANAGER& manager = kiRuntime();
    trace( "lintSchematicFile: LoadProject" );
    // aSetActive=false: the set-active tail calls Pgm().GetLibraryManager()
    // (never constructed on the minimal LINT_PGM — a null vtable call) and the
    // kiway/env plumbing; none of it exists headless. Prj() still resolves to
    // the first loaded project.
    manager.LoadProject( wxEmptyString, false );
    manager.Prj().SetElem( PROJECT::ELEM::LEGACY_SYMBOL_LIBS, nullptr );

    trace( "lintSchematicFile: constructing SCHEMATIC" );
    SCHEMATIC schematic( &manager.Prj() );
    trace( "lintSchematicFile: Reset" );
    schematic.Reset();
    SCH_SHEET* defaultSheet = schematic.GetTopLevelSheet( 0 );

    trace( "lintSchematicFile: LoadSchematicFile" );
    IO_RELEASER<SCH_IO> pi( SCH_IO_MGR::FindPlugin( SCH_IO_MGR::SCH_KICAD ) );
    SCH_SHEET* root = pi->LoadSchematicFile( aAbsPath, &schematic );
    trace( "lintSchematicFile: loaded" );
    schematic.AddTopLevelSheet( root ); // the SCHEMATIC dtor owns the hierarchy
    schematic.RemoveTopLevelSheet( defaultSheet );
    delete defaultSheet;

    // Sub-sheet problems (e.g. a missing child .kicad_sch when linting one
    // materialized sheet) are queued by loadHierarchy, not thrown — only the
    // root file's own parse failure throws. Surface them as warnings.
    if( !pi->GetError().IsEmpty() )
    {
        for( const wxString& msgLine : wxSplit( pi->GetError(), '\n' ) )
        {
            if( !msgLine.IsEmpty() )
                aOut.warnings.push_back( std::string( aAbsPath.ToUTF8() ) + ": warning: sub-sheet: "
                                         + std::string( msgLine.ToUTF8() ) );
        }
    }
}


int lintSymbolLib( const wxString& aAbsPath )
{
    const SCH_IO_MGR::SCH_FILE_T type = SCH_IO_MGR::GuessPluginTypeFromLibPath( aAbsPath );

    if( type == SCH_IO_MGR::SCH_FILE_UNKNOWN )
        THROW_IO_ERROR( wxS( "unrecognized symbol library format" ) );

    IO_RELEASER<SCH_IO> pi( SCH_IO_MGR::FindPlugin( type ) );

    // The vector overload is the one ConvertLibrary exercises (the wxArrayString
    // flavor crashed a dieted build once — an indirectly-reachable-only helper).
    // The symbols stay owned by the plugin's cache; do not delete them.
    std::vector<LIB_SYMBOL*> symbols;
    pi->EnumerateSymbolLib( symbols, aAbsPath );
    return (int) symbols.size();
}

// ── lint driver ───────────────────────────────────────────────────────────────

bool lintOneFile( const char* aPath, bool aStrict )
{
    wxFileName fn( wxString::FromUTF8( aPath ) );
    fn.MakeAbsolute(); // LoadSchematicFile asserts an absolute path
    const wxString absPath = fn.GetFullPath();
    const wxString ext = fn.GetExt().Lower();

    LINT_REPORT report;
    const char* tier = "structure only";
    int symbolCount = -1;

    // The structural walk + uuid lints run on every s-expr format; the legacy
    // .lib format is not an s-expr, so it gets the full parse only.
    if( ext != wxS( "lib" ) )
    {
        std::string text;

        if( FILE* f = std::fopen( aPath, "rb" ) )
        {
            // Heap, not stack: a 64 KB stack buffer equals the default wasm
            // stack SIZE — it silently overflowed into the heap and corrupted
            // mimalloc's structures (trap deep inside _mi_malloc_generic).
            std::vector<char> buf( 65536 );
            size_t got;

            while( ( got = std::fread( buf.data(), 1, buf.size(), f ) ) > 0 )
                text.append( buf.data(), got );

            std::fclose( f );
            walkSexpr( text, aPath, report );
        }
        else
        {
            report.errors.push_back( std::string( aPath ) + ": error: cannot open file" );
        }
    }

    if( report.errors.empty() )
    {
        trace( "lintOneFile: structural walk done, dispatching full parse" );
        try
        {
            if( ext == wxS( "kicad_sch" ) )
            {
                lintSchematicFile( absPath, report );
                tier = "full parse";
            }
            else if( ext == wxS( "kicad_sym" ) || ext == wxS( "lib" ) )
            {
                symbolCount = lintSymbolLib( absPath );
                tier = "full parse";
            }
            // Anything else (kicad_pcb, kicad_wks, kicad_pro …) stays
            // structure-only: this binary links the eeschema parsers, not
            // pcbnew's. Native kicad-cli covers boards in container contexts.
        }
        catch( PARSE_ERROR& pe ) // non-const: ParseProblem() is unqualified
        {
            char buf[1024];
            std::snprintf( buf, sizeof( buf ), "%s:%d:%d: error: %s", aPath, pe.lineNumber,
                           pe.byteIndex, (const char*) pe.ParseProblem().ToUTF8() );
            report.errors.push_back( buf );
        }
        catch( const IO_ERROR& ioe )
        {
            report.errors.push_back( std::string( aPath ) + ": error: "
                                     + std::string( ioe.Problem().ToUTF8() ) );
        }
        catch( const std::exception& e )
        {
            report.errors.push_back( std::string( aPath ) + ": error: " + e.what() );
        }
    }

    for( const std::string& msg : report.errors )
        std::fprintf( stderr, "%s\n", msg.c_str() );

    for( const std::string& msg : report.warnings )
        std::fprintf( stderr, "%s\n", msg.c_str() );

    const bool failed = !report.errors.empty() || ( aStrict && !report.warnings.empty() );

    if( failed )
        std::fprintf( stderr, "%s: FAIL\n", aPath );
    else if( symbolCount >= 0 )
        std::fprintf( stderr, "%s: OK (%s, %d symbols)\n", aPath, tier, symbolCount );
    else
        std::fprintf( stderr, "%s: OK (%s)\n", aPath, tier );

    return !failed;
}

} // namespace


int main( int argc, char** argv )
{
    // Non-tty stderr is fully buffered under emscripten/musl, so a trap or
    // hang eats every diagnostic printed before it. A CLI's stderr must be
    // unbuffered — losing the error report is worse than the syscall cost.
    setvbuf( stderr, nullptr, _IONBF, 0 );

    // Bring up wxBase (no GUI): wxString / wxFileName / wxFFile rely on the
    // library being initialised.
    wxInitializer initializer( argc, argv );

    if( !initializer.IsOk() )
    {
        std::fprintf( stderr, "sym_convert: wxWidgets initialisation failed\n" );
        return 3;
    }

    if( argc >= 2 && std::strcmp( argv[1], "--lint" ) == 0 )
    {
        // The minimal headless runtime never registers app settings;
        // GetAppSettings fails SOFT to defaults but wxFAIL_MSGs on every call,
        // flooding stderr. Lint output must stay parseable — drop the asserts.
        wxDisableAsserts();

        int  firstFile = 2;
        bool strict = false;

        if( argc > firstFile && std::strcmp( argv[firstFile], "--strict" ) == 0 )
        {
            strict = true;
            firstFile++;
        }

        if( argc <= firstFile )
        {
            std::fprintf( stderr, "usage: sym_convert --lint [--strict] <file> [<file>...]\n" );
            return 2;
        }

        bool allOk = true;

        for( int n = firstFile; n < argc; n++ )
            allOk = lintOneFile( argv[n], strict ) && allOk;

        return allOk ? 0 : 1;
    }

    if( argc < 3 )
    {
        std::fprintf( stderr, "usage: sym_convert <input.lib> <output.kicad_sym>\n"
                              "       sym_convert --lint [--strict] <file> [<file>...]\n" );
        return 2;
    }

    const wxString inPath  = wxString::FromUTF8( argv[1] );
    const wxString outPath = wxString::FromUTF8( argv[2] );

    // aOldFileProps = nullptr: no library-table properties; ConvertLibrary
    // guesses the source format from the path and writes the SCH_KICAD format.
    const bool ok = SCH_IO_MGR::ConvertLibrary( nullptr, inPath, outPath );

    if( ok )
    {
        std::fprintf( stderr, "sym_convert: OK  %s -> %s\n", argv[1], argv[2] );
        return 0;
    }

    std::fprintf( stderr, "sym_convert: FAILED to convert %s\n", argv[1] );
    return 1;
}
