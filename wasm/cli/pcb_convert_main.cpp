/*
 * pcb_convert — standalone KiCad board CLI, built as a WebAssembly module.
 * The pcbnew-side sibling of sym_convert (pcbjam-mcp 0001 tier 3a).
 *
 *   drc:      pcb_convert --drc [--json] [--strict] <file.kicad_pcb> [<out>]
 *             Headless DRC. Replicates the scripting LoadBoard() path (the
 *             real one is Python-scripting code, stubbed to nullptr in WASM
 *             builds): PCB_IO_MGR::Load + DRC_ENGINE::InitEngine(.kicad_dru)
 *             + connectivity build, then runs DRC_ENGINE::RunTests the way
 *             kicad-cli's JobExportDrc does — no parity (needs the eeschema
 *             kiface over kiway), no zone refill (tools/ pruned; existing
 *             fills are checked as-is), no footprint-lib preload (the two
 *             library-parity tests are force-ignored).
 *             Writes a kicad-cli-compatible report (text, or JSON with
 *             --json) to <out> (default: <file>-drc.rpt/.json).
 *             Exit: 0 clean, 1 violations (--strict: also warnings +
 *             unconnected), 2 usage, 4 load/run failure.
 *
 *   gerbers:  pcb_convert --gerbers <file.kicad_pcb> [<outdir>]
 *             One .gbr per enabled layer (stackup plot order) + the .gbrjob
 *             file, kicad-cli CLI defaults (no board-plot-params), into
 *             <outdir> (default: the input's directory). Zone fills plot as
 *             saved (no re-check). Exit: 0 ok, 2 usage, 4 failure.
 *
 * No GUI, no renderer, no embind bindings. Wired into pcbnew/CMakeLists.txt
 * behind the KICAD_PCB_CONVERTER_WASM option (see
 * scripts/kicad/build-pcb_convert.sh).
 *
 * GPL note: this is GPL KiCad code. The artifact is meant to be invoked as a
 * separate process from closed code, never linked into it.
 */

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <unistd.h>
#include <unordered_set>

#include <wx/filename.h>
#include <wx/image.h>
#include <wx/init.h>
#include <wx/string.h>

#include <base_screen.h>
#include <board.h>
#include <board_design_settings.h>
#include <drc/drc_engine.h>
#include <drc/drc_item.h>
#include <drc/drc_report.h>
#include <exporters/gerber_jobfile_writer.h>
#include <jobs/job_export_pcb_gerbers.h>
#include <ki_exception.h>
#include <layer_ids.h>
#include <lset.h>
#include <libraries/library_manager.h>
#include <pcb_io/pcb_io_mgr.h>
#include <pcb_marker.h>
#include <pcb_plotter.h>
#include <pcbplot.h>
#include <pgm_base.h>
#include <plotters/plotter_gerber.h>
#include <project.h>
#include <project/project_file.h>
#include <properties/property.h>
#include <properties/property_mgr.h>
#include <reporter.h>
#include <settings/settings_manager.h>
#include <widgets/report_severity.h>

// ── minimal KiCad runtime (mirror of sym_convert_main.cpp's LINT_PGM) ─────────

namespace
{

/** PCB_CONVERT_TRACE=1: stage prints for diagnosing hangs/traps in the field. */
void trace( const char* aMsg )
{
    if( std::getenv( "PCB_CONVERT_TRACE" ) )
        std::fprintf( stderr, "[trace] %s\n", aMsg );
}


class DRC_PGM : public PGM_BASE
{
public:
    void MacOpenFile( const wxString& ) override {}

    void CreateSettingsManager()
    {
        m_settings_manager = std::make_unique<SETTINGS_MANAGER>();
    }

    // The full InitPgm() is deliberately not run (kiway/curl plumbing); but
    // the DRC engine parallelizes through GetThreadPool(), which only exists
    // after m_singleton.Init() — without it the pool call wanders on a
    // null-object read (address 0 is readable linear memory under wasm).
    void CreateSingleton()
    {
        m_singleton.Init();
    }

    // Pgm().GetLibraryManager() returns *m_library_manager unchecked; an empty
    // manager (no tables) is valid and keeps any stray lookup from wandering.
    void CreateLibraryManager()
    {
        m_library_manager = std::make_unique<LIBRARY_MANAGER>();
    }
};


SETTINGS_MANAGER& kiRuntime()
{
    static SETTINGS_MANAGER* s_manager = nullptr;

    if( !s_manager )
    {
        // JSON settings need a writable config dir; keep it away from any real
        // user config (0 = don't overwrite an explicit override).
        setenv( "KICAD_CONFIG_HOME", "/tmp/pcb_convert-config", 0 );

        // Pin the KiCad thread pool to one worker BEFORE the first
        // ADVANCED_CFG::GetCfg() call latches the value: the link ships only
        // -sPTHREAD_POOL_SIZE=2 preloaded pthread workers, and the default
        // (0 = hardware_concurrency) would spawn a pool the node runtime can
        // only grow after returning to the event loop — which a blocking CLI
        // never does.
        {
            const char* configHome = std::getenv( "KICAD_CONFIG_HOME" );
            wxFileName advCfg( wxString::FromUTF8( configHome ), wxS( "kicad_advanced" ) );

            if( !advCfg.DirExists() )
                advCfg.Mkdir( wxS_DIR_DEFAULT, wxPATH_MKDIR_FULL );

            if( !advCfg.FileExists() )
            {
                if( FILE* f = std::fopen( advCfg.GetFullPath().ToUTF8(), "wb" ) )
                {
                    std::fputs( "MaximumThreads=1\n", f );
                    std::fclose( f );
                }
            }
        }

        // Deliberately leaked: ~PGM_BASE runs Destroy() (curl/sentry cleanup)
        // from the EXIT_RUNTIME static-dtor pass.
        trace( "kiRuntime: constructing DRC_PGM" );
        DRC_PGM* pgm = new DRC_PGM();
        SetPgm( pgm );
        trace( "kiRuntime: constructing SETTINGS_MANAGER" );
        pgm->CreateSettingsManager();
        trace( "kiRuntime: singleton (thread pool)" );
        pgm->CreateSingleton();
        trace( "kiRuntime: library manager (empty)" );
        pgm->CreateLibraryManager();
        s_manager = &pgm->GetSettingsManager();
        trace( "kiRuntime: ready" );
    }

    return *s_manager;
}


// ── headless board load ───────────────────────────────────────────────────────
// Replica of the scripting LoadBoard() (pcbnew_scripting_helpers.cpp:153),
// which the WASM build stubs to nullptr (it lives behind KICAD_SCRIPTING and
// #includes Python.h). Prints diagnostics and returns null on failure.

BOARD* loadBoardHeadless( const char* aInPath )
{
    wxFileName fn( wxString::FromUTF8( aInPath ) );
    fn.MakeAbsolute();
    const wxString absPath = fn.GetFullPath();

    SETTINGS_MANAGER& manager = kiRuntime();

    wxFileName pro( fn );
    pro.SetExt( wxS( "kicad_pro" ) );

    // A board can embed bitmap images in several formats.
    wxInitAllImageHandlers();

    // aSetActive=false: the set-active tail needs kiway plumbing that doesn't
    // exist headless (mirrors sym_convert's lint loader).
    trace( "loadBoardHeadless: LoadProject" );
    manager.LoadProject( pro.FileExists() ? pro.GetFullPath() : wxString( wxEmptyString ), false );
    PROJECT& project = manager.Prj();

    BASE_SCREEN::m_DrawingSheetFileName = project.GetProjectFile().m_BoardDrawingSheetFile;

    trace( "loadBoardHeadless: PCB_IO_MGR::Load" );
    BOARD* brd = nullptr;

    try
    {
        brd = PCB_IO_MGR::Load( PCB_IO_MGR::KICAD_SEXP, absPath );
    }
    catch( PARSE_ERROR& pe )
    {
        std::fprintf( stderr, "%s:%d:%d: error: %s\n", aInPath, pe.lineNumber, pe.byteIndex,
                      (const char*) pe.ParseProblem().ToUTF8() );
        return nullptr;
    }
    catch( const IO_ERROR& ioe )
    {
        std::fprintf( stderr, "%s: error: %s\n", aInPath,
                      (const char*) ioe.Problem().ToUTF8() );
        return nullptr;
    }

    if( !brd )
    {
        std::fprintf( stderr, "%s: error: failed to load board\n", aInPath );
        return nullptr;
    }

    // Custom DRC rule conditions (A.Layer == 'F.Cu', …) resolve layer names
    // through the property system's PCB_LAYER_ID enum map.
    trace( "loadBoardHeadless: layer enum map" );
    ENUM_MAP<PCB_LAYER_ID>& layerEnum = ENUM_MAP<PCB_LAYER_ID>::Instance();

    layerEnum.Choices().Clear();
    layerEnum.Undefined( UNDEFINED_LAYER );

    for( PCB_LAYER_ID layer : LSET::AllLayersMask() )
    {
        layerEnum.Map( layer, LSET::Name( layer ) );      // canonical name
        layerEnum.Map( layer, brd->GetLayerName( layer ) ); // user name
    }

    brd->SetProject( &project );

    trace( "loadBoardHeadless: DRC_ENGINE InitEngine" );
    BOARD_DESIGN_SETTINGS& bds = brd->GetDesignSettings();
    bds.m_DRCEngine = std::make_shared<DRC_ENGINE>( brd, &bds );

    try
    {
        wxFileName rules( pro );
        rules.SetExt( wxS( "kicad_dru" ) );
        bds.m_DRCEngine->InitEngine( rules );
    }
    catch( ... )
    {
        // Best efforts — implicit (board-settings) rules still apply.
        std::fprintf( stderr, "%s: warning: custom DRC rules failed to load\n", aInPath );
    }

    for( PCB_MARKER* marker : brd->ResolveDRCExclusions( true ) )
        brd->Add( marker );

    trace( "loadBoardHeadless: BuildConnectivity" );
    brd->BuildConnectivity();
    brd->BuildListOfNets();
    brd->SynchronizeNetsAndNetClasses( true );

    // Component-class assignment rules from the project; without this,
    // hasComponentClass() conditions in custom rules never match.
    brd->SynchronizeComponentClasses( std::unordered_set<wxString>() );

    brd->UpdateUserUnits( brd, nullptr );

    return brd;
}


// ── headless DRC ──────────────────────────────────────────────────────────────
// Mirrors PCBNEW_JOBS_HANDLER::JobExportDrc with the headless deltas: no
// parity (kiway/eeschema kiface), no zone refill (tool framework pruned), no
// footprint-lib preload (the two library tests are force-ignored), markers
// added straight to the board instead of through a BOARD_COMMIT.

int runDrc( const char* aInPath, bool aJson, bool aStrict, const char* aOutPath )
{
    wxFileName fn( wxString::FromUTF8( aInPath ) );
    fn.MakeAbsolute();

    BOARD* brd = loadBoardHeadless( aInPath );

    if( !brd )
        return 4;

    BOARD_DESIGN_SETTINGS& bds = brd->GetDesignSettings();

    // Library-parity tests dereference Pgm().GetLibraryManager() adapters that
    // have no tables headless; parity-with-schematic needs the eeschema kiface.
    bds.m_DRCSeverities[ DRCE_LIB_FOOTPRINT_ISSUES ] = RPT_SEVERITY_IGNORE;
    bds.m_DRCSeverities[ DRCE_LIB_FOOTPRINT_MISMATCH ] = RPT_SEVERITY_IGNORE;

    std::shared_ptr<DRC_ENGINE> drcEngine = bds.m_DRCEngine;

    drcEngine->SetViolationHandler(
            [&]( const std::shared_ptr<DRC_ITEM>& aItem, const VECTOR2I& aPos, int aLayer,
                 const std::function<void( PCB_MARKER* )>& aPathGenerator )
            {
                PCB_MARKER* marker = new PCB_MARKER( aItem, aPos, aLayer );
                aPathGenerator( marker );
                brd->Add( marker );
            } );

    trace( "runDrc: RunTests" );
    brd->RecordDRCExclusions();
    brd->DeleteMARKERs( true, true );
    drcEngine->RunTests( EDA_UNITS::MM, false /*aReportAllTrackErrors*/, false /*aTestFootprints*/ );
    drcEngine->ClearViolationHandler();

    // Update the exclusion status on any excluded markers that still exist.
    brd->ResolveDRCExclusions( false );

    auto markersProvider = std::make_shared<DRC_ITEMS_PROVIDER>(
            brd, MARKER_BASE::MARKER_DRC, MARKER_BASE::MARKER_DRAWING_SHEET );
    auto ratsnestProvider = std::make_shared<DRC_ITEMS_PROVIDER>( brd, MARKER_BASE::MARKER_RATSNEST );
    auto fpWarningsProvider = std::make_shared<DRC_ITEMS_PROVIDER>( brd, MARKER_BASE::MARKER_PARITY );

    markersProvider->SetSeverities( RPT_SEVERITY_ERROR | RPT_SEVERITY_WARNING );
    ratsnestProvider->SetSeverities( RPT_SEVERITY_ERROR | RPT_SEVERITY_WARNING );
    fpWarningsProvider->SetSeverities( RPT_SEVERITY_ERROR | RPT_SEVERITY_WARNING );

    const int errors = markersProvider->GetCount( RPT_SEVERITY_ERROR );
    const int warnings = markersProvider->GetCount( RPT_SEVERITY_WARNING );
    const int unconnected = ratsnestProvider->GetCount();

    wxString outPath;

    if( aOutPath )
    {
        outPath = wxString::FromUTF8( aOutPath );
    }
    else
    {
        wxFileName out( fn );
        out.SetName( out.GetName() + wxS( "-drc" ) );
        out.SetExt( aJson ? wxS( "json" ) : wxS( "rpt" ) );
        outPath = out.GetFullPath();
    }

    trace( "runDrc: writing report" );
    DRC_REPORT reportWriter( brd, EDA_UNITS::MM, markersProvider, ratsnestProvider,
                             fpWarningsProvider );

    const bool wrote = aJson ? reportWriter.WriteJsonReport( outPath )
                             : reportWriter.WriteTextReport( outPath );

    if( !wrote )
    {
        std::fprintf( stderr, "%s: error: unable to save DRC report to %s\n", aInPath,
                      (const char*) outPath.ToUTF8() );
        return 4;
    }

    // Same convention as sym_convert --erc: errors fail; --strict also fails
    // on warnings and unconnected items.
    const bool failed = errors > 0 || ( aStrict && ( warnings > 0 || unconnected > 0 ) );

    std::fprintf( stderr, "%s: %s (%d errors, %d warnings, %d unconnected) -> %s\n", aInPath,
                  failed ? "FAIL" : "OK", errors, warnings, unconnected,
                  (const char*) outPath.ToUTF8() );

    return failed ? 1 : 0;
}

// ── headless gerber export ────────────────────────────────────────────────────
// Mirrors PCBNEW_JOBS_HANDLER::JobExportGerbers with the headless deltas: no
// zone re-check (tool framework pruned; fills plot as saved), no progress
// reporter, kicad-cli CLI defaults via a default-constructed
// JOB_EXPORT_PCB_GERBERS (board's enabled layers, .gbrjob file on, no protel
// extensions unless the board plot params say so — we DON'T use board plot
// params, matching kicad-cli's default).

int runGerbers( const char* aInPath, const char* aOutDir )
{
    wxFileName fn( wxString::FromUTF8( aInPath ) );
    fn.MakeAbsolute();

    BOARD* brd = loadBoardHeadless( aInPath );

    if( !brd )
        return 4;

    wxString outPath = aOutDir ? wxString::FromUTF8( aOutDir ) : fn.GetPath();

    if( !outPath.EndsWith( wxS( "/" ) ) )
        outPath += wxS( "/" );

    REPORTER& reporter = CLI_REPORTER::GetInstance();

    // kicad-cli defaults (m_useBoardPlotParams=false, m_createJobsFile=true);
    // layer selection = the board's enabled layers, stackup plot order.
    JOB_EXPORT_PCB_GERBERS gerberJob;
    PCB_PLOT_PARAMS        plotOpts;
    PCB_PLOTTER::PlotJobToPlotOpts( plotOpts, &gerberJob, reporter );

    GERBER_JOBFILE_WRITER jobfileWriter( brd );
    LSEQ layersToPlot = brd->GetEnabledLayers().SeqStackupForPlotting();
    int  plotted = 0;
    bool failed = false;

    for( PCB_LAYER_ID layer : layersToPlot )
    {
        LSEQ plotSequence;
        plotSequence.push_back( layer );

        wxFileName gbrFn( brd->GetFileName() );
        wxString   layerName = brd->GetLayerName( layer );
        wxString   fileExt = plotOpts.GetUseGerberProtelExtensions()
                                     ? GetGerberProtelExtension( layer )
                                     : wxString( wxS( "gbr" ) );

        BuildPlotFileName( &gbrFn, outPath, layerName, fileExt );
        wxString gbrName = gbrFn.GetFullName(); // AddGbrFile wants a non-const ref
        jobfileWriter.AddGbrFile( layer, gbrName );

        trace( "runGerbers: StartPlotBoard" );
        GERBER_PLOTTER* plotter = (GERBER_PLOTTER*) StartPlotBoard(
                brd, &plotOpts, layer, layerName, gbrFn.GetFullPath(), wxEmptyString,
                wxEmptyString );

        if( plotter )
        {
            PlotBoardLayers( brd, plotter, plotSequence, plotOpts );
            plotter->EndPlot();
            plotted++;
        }
        else
        {
            std::fprintf( stderr, "%s: error: failed to plot %s\n", aInPath,
                          (const char*) gbrFn.GetFullPath().ToUTF8() );
            failed = true;
        }

        delete plotter;
    }

    wxFileName jobFn( brd->GetFileName() );
    BuildPlotFileName( &jobFn, outPath, wxS( "job" ), wxS( "gbrjob" ) );
    jobfileWriter.CreateJobFile( jobFn.GetFullPath() );

    std::fprintf( stderr, "%s: %s (%d layers + job file) -> %s\n", aInPath,
                  failed ? "FAIL" : "OK", plotted, (const char*) outPath.ToUTF8() );

    return failed ? 4 : 0;
}

} // namespace


#ifdef KICAD_TOOLS_COMBINED
// Full-parse board lint for the merged image's --lint driver (which lives on
// the eeschema side, sym_convert_main.cpp): a bare PCB_IO_MGR::Load parse —
// no project, no DRC engine, no connectivity. Returns the footprint count, or
// -1 with aError filled ("path:line:col: error: ..." on parse errors).
int pcbToolsLintBoard( const char* aInPath, std::string& aError )
{
    wxFileName fn( wxString::FromUTF8( aInPath ) );
    fn.MakeAbsolute();

    kiRuntime();

    try
    {
        std::unique_ptr<BOARD> brd( PCB_IO_MGR::Load( PCB_IO_MGR::KICAD_SEXP, fn.GetFullPath() ) );

        if( !brd )
        {
            aError = std::string( aInPath ) + ": error: failed to load board";
            return -1;
        }

        return (int) brd->Footprints().size();
    }
    catch( PARSE_ERROR& pe )
    {
        char buf[1024];
        std::snprintf( buf, sizeof( buf ), "%s:%d:%d: error: %s", aInPath, pe.lineNumber,
                       pe.byteIndex, (const char*) pe.ParseProblem().ToUTF8() );
        aError = buf;
        return -1;
    }
    catch( const IO_ERROR& ioe )
    {
        aError = std::string( aInPath ) + ": error: " + std::string( ioe.Problem().ToUTF8() );
        return -1;
    }
    catch( const std::exception& e )
    {
        aError = std::string( aInPath ) + ": error: " + e.what();
        return -1;
    }
}
#endif // KICAD_TOOLS_COMBINED


// Under KICAD_TOOLS_COMBINED (the merged kicad_tools image) this TU compiles
// as a library: the entry point keeps its name and kicad_tools_main.cpp
// dispatches to it; the standalone pcb_convert build wraps it in main() below.
int pcbConvertMain( int argc, char** argv )
{
    // Non-tty stderr is fully buffered under emscripten/musl; a CLI's stderr
    // must be unbuffered — losing the error report is worse than the syscall
    // cost.
    setvbuf( stderr, nullptr, _IONBF, 0 );

    wxInitializer initializer( argc, argv );

    if( !initializer.IsOk() )
    {
        std::fprintf( stderr, "pcb_convert: wxWidgets initialisation failed\n" );
        return 3;
    }

    if( argc >= 2 && std::strcmp( argv[1], "--drc" ) == 0 )
    {
        // The minimal headless runtime never registers app settings;
        // GetAppSettings fails SOFT to defaults but wxFAIL_MSGs on every call.
        // Report output must stay parseable — drop the asserts.
        wxDisableAsserts();

        bool json = false;
        bool strict = false;
        int  arg = 2;

        while( arg < argc && std::strncmp( argv[arg], "--", 2 ) == 0 )
        {
            if( std::strcmp( argv[arg], "--json" ) == 0 )
                json = true;
            else if( std::strcmp( argv[arg], "--strict" ) == 0 )
                strict = true;
            else
                break;

            arg++;
        }

        if( arg >= argc )
        {
            std::fprintf( stderr,
                          "usage: pcb_convert --drc [--json] [--strict] <file.kicad_pcb> [<out>]\n" );
            return 2;
        }

        const char* inPath = argv[arg++];
        const char* outPath = arg < argc ? argv[arg] : nullptr;

        int rc = 4;

        try
        {
            rc = runDrc( inPath, json, strict, outPath );
        }
        catch( const std::exception& e )
        {
            std::fprintf( stderr, "%s: error: %s\n", inPath, e.what() );
        }

        // Skip the EXIT_RUNTIME static-dtor pass: some dieted-out editor
        // teardown is still reachable through vtable slots from static dtors
        // and traps ("table index is out of bounds") AFTER the report is
        // written, clobbering the exit code. A CLI has nothing to tear down —
        // flush and leave.
        std::fflush( nullptr );
        _exit( rc );
    }

    if( argc >= 2 && std::strcmp( argv[1], "--gerbers" ) == 0 )
    {
        wxDisableAsserts();

        if( argc < 3 )
        {
            std::fprintf( stderr, "usage: kicad_tools --gerbers <file.kicad_pcb> [<outdir>]\n" );
            return 2;
        }

        int rc = 4;

        try
        {
            rc = runGerbers( argv[2], argc >= 4 ? argv[3] : nullptr );
        }
        catch( const std::exception& e )
        {
            std::fprintf( stderr, "%s: error: %s\n", argv[2], e.what() );
        }

        // Same static-dtor rationale as --drc above.
        std::fflush( nullptr );
        _exit( rc );
    }

    std::fprintf( stderr, "usage: kicad_tools --drc [--json] [--strict] <file.kicad_pcb> [<out>]\n"
                          "       kicad_tools --gerbers <file.kicad_pcb> [<outdir>]\n" );
    return 2;
}


#ifndef KICAD_TOOLS_COMBINED
int main( int argc, char** argv )
{
    return pcbConvertMain( argc, argv );
}
#endif
