/*
 * KiCad Wasm Port - OCC stub implementations
 *
 * Provides stub implementations for OpenCASCADE-related classes when KICAD_USE_OCC=OFF.
 * Uses the clean pcbnew_utils_3d.h header which has no OCC dependencies.
 * EXPORTER_STEP is implemented separately without including its header to avoid OCC deps.
 */

#include <wx/string.h>
#include <math/vector3.h>
#include <reporter.h>
#include <jobs/job_export_pcb_3d.h>  // For EXPORTER_STEP_PARAMS

// Include the actual header for UTILS classes (no OCC dependency)
#include <python/scripting/pcbnew_utils_3d.h>

// =============================================================================
// UTILS_BOX3D stub implementations
// =============================================================================

VECTOR3D& UTILS_BOX3D::Min()
{
    return m_min;
}

VECTOR3D& UTILS_BOX3D::Max()
{
    return m_max;
}

VECTOR3D UTILS_BOX3D::GetCenter()
{
    return VECTOR3D( 0, 0, 0 );
}

VECTOR3D UTILS_BOX3D::GetSize()
{
    return VECTOR3D( 0, 0, 0 );
}

// =============================================================================
// UTILS_STEP_MODEL stub implementations
// =============================================================================

struct UTILS_STEP_MODEL::DATA
{
    // Empty stub data
};

UTILS_STEP_MODEL::~UTILS_STEP_MODEL()
{
    delete m_data;
}

UTILS_BOX3D UTILS_STEP_MODEL::GetBoundingBox()
{
    return UTILS_BOX3D();
}

void UTILS_STEP_MODEL::Translate( double aX, double aY, double aZ )
{
    (void)aX; (void)aY; (void)aZ;
}

void UTILS_STEP_MODEL::Scale( double aScale )
{
    (void)aScale;
}

bool UTILS_STEP_MODEL::SaveSTEP( const wxString& aFileName )
{
    (void)aFileName;
    return false;
}

UTILS_STEP_MODEL* UTILS_STEP_MODEL::LoadSTEP( const wxString& aFileName )
{
    (void)aFileName;
    return nullptr;
}

// =============================================================================
// EXPORTER_STEP stub implementations
// We can't include exporter_step.h because it has OCC-dependent members.
// Instead, we declare the class matching the header's interface and implement stubs.
// =============================================================================

// Forward declarations
class BOARD;
class BOARD_ITEM;
class FOOTPRINT;
class PCB_TRACK;
class SHAPE_POLY_SET;

// EXPORTER_STEP class definition matching the header
// Must match the declaration in exporters/step/exporter_step.h exactly
class EXPORTER_STEP
{
public:
    EXPORTER_STEP( BOARD* aBoard, const EXPORTER_STEP_PARAMS& aParams, REPORTER* aReporter );
    ~EXPORTER_STEP();

    bool Export();

    wxString m_outputFile;

private:
    bool buildBoard3DShapes();
    bool buildFootprint3DShapes( FOOTPRINT* aFootprint, const VECTOR2D& aOrigin, SHAPE_POLY_SET* aClipPolygon );
    bool buildTrack3DShape( PCB_TRACK* aTrack, const VECTOR2D& aOrigin );
    void buildZones3DShape( VECTOR2D aOrigin );
    bool buildGraphic3DShape( BOARD_ITEM* aItem, const VECTOR2D& aOrigin );
    void initOutputVariant();

    // Member variables - simplified stubs without the actual OCC-dependent types
    EXPORTER_STEP_PARAMS m_params;
    REPORTER* m_reporter;
    BOARD* m_board;
};

EXPORTER_STEP::EXPORTER_STEP( BOARD* aBoard, const EXPORTER_STEP_PARAMS& aParams, REPORTER* aReporter )
    : m_params( aParams ),
      m_reporter( aReporter ),
      m_board( aBoard )
{
}

EXPORTER_STEP::~EXPORTER_STEP()
{
}

bool EXPORTER_STEP::Export()
{
    if( m_reporter )
    {
        m_reporter->Report( wxT( "STEP export is not available (OCC support disabled)" ),
                           RPT_SEVERITY_ERROR );
    }
    return false;
}

bool EXPORTER_STEP::buildBoard3DShapes()
{
    return false;
}

bool EXPORTER_STEP::buildFootprint3DShapes( FOOTPRINT* aFootprint, const VECTOR2D& aOrigin, SHAPE_POLY_SET* aClipPolygon )
{
    (void)aFootprint; (void)aOrigin; (void)aClipPolygon;
    return false;
}

bool EXPORTER_STEP::buildTrack3DShape( PCB_TRACK* aTrack, const VECTOR2D& aOrigin )
{
    (void)aTrack; (void)aOrigin;
    return false;
}

void EXPORTER_STEP::buildZones3DShape( VECTOR2D aOrigin )
{
    (void)aOrigin;
}

bool EXPORTER_STEP::buildGraphic3DShape( BOARD_ITEM* aItem, const VECTOR2D& aOrigin )
{
    (void)aItem; (void)aOrigin;
    return false;
}

void EXPORTER_STEP::initOutputVariant()
{
}
