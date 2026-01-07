/**
 * KiCad stubs implementation for native GAL test build
 *
 * Provides implementations for symbols declared in KiCad headers
 * but not included in the GAL source files we compile.
 */

#include <GL/glew.h>
#include <wx/wx.h>
#include <wx/glcanvas.h>
#include <wx/snglinst.h>

// Forward-declared types in pgm_base.h need complete definitions
// before we can implement PGM_BASE constructor/destructor
class SETTINGS_MANAGER {};
class LIBRARY_MANAGER {};
class BACKGROUND_JOBS_MONITOR {};
class NOTIFICATIONS_MANAGER {};

// Include KiCad headers
#include <pgm_base.h>
#include <advanced_config.h>
#include <gal/opengl/gl_context_mgr.h>  // For GL_CONTEXT_MANAGER definition

//=============================================================================
// PGM_BASE minimal implementation
// Note: We can't inherit from PGM_BASE as GetGLContextManager isn't virtual.
// Instead we define our own simple singleton that returns a GL_CONTEXT_MANAGER.
//=============================================================================

// The real Pgm() needs to return a PGM_BASE reference.
// PGM_BASE has GetGLContextManager() which GAL uses.

// Create a minimal subclass with the functionality we need
class PGM_BASE_TEST : public PGM_BASE {
public:
    PGM_BASE_TEST() : PGM_BASE() {}

    // Implement required pure virtual
    void MacOpenFile(const wxString& aFileName) override {}
};

static PGM_BASE_TEST* s_pgmInstance = nullptr;

PGM_BASE& Pgm() {
    if (!s_pgmInstance) {
        s_pgmInstance = new PGM_BASE_TEST();
    }
    return *s_pgmInstance;
}

//=============================================================================
// ADVANCED_CFG singleton
//=============================================================================

const ADVANCED_CFG& ADVANCED_CFG::GetCfg() {
    static ADVANCED_CFG instance;
    return instance;
}

//=============================================================================
// Build version
//=============================================================================

const char* GetBuildVersion() {
    return "8.0.0-test";
}

//=============================================================================
// Additional stub symbols needed for linking
//=============================================================================

#include <gal/gal_display_options.h>
#include <core/observable.h>

namespace UTIL {
namespace DETAIL {

OBSERVABLE_BASE::OBSERVABLE_BASE() {}
OBSERVABLE_BASE::~OBSERVABLE_BASE() {}
void OBSERVABLE_BASE::on_observers_empty() {}
void OBSERVABLE_BASE::enter_iteration() {}
void OBSERVABLE_BASE::leave_iteration() {}
void OBSERVABLE_BASE::add_observer(void*) {}
void OBSERVABLE_BASE::remove_observer(void*) {}

} // namespace DETAIL
} // namespace UTIL

// KIFONT stubs - only define symbols not already inline in headers
#include <font/font.h>

namespace KIFONT {

FONT* FONT::GetFont(const wxString&, bool, bool, const std::vector<wxString>*, bool) {
    return nullptr;
}

// Note: FONT::Draw methods are inline in the header, don't redefine them

const METRICS& METRICS::Default() {
    static METRICS m;
    return m;
}

void OUTLINE_GLYPH::Triangulate(std::function<void(const VECTOR2I&, const VECTOR2I&, const VECTOR2I&)>) const {}

} // namespace KIFONT

// SHAPE_POLY_SET stub
#include <geometry/shape_poly_set.h>

bool SHAPE_POLY_SET::IsTriangulationUpToDate() const {
    return false;
}

// KIID niluuid
#include <kiid.h>

KIID niluuid;

// Include environment.h for ENV_VAR_MAP typedef
#include <settings/environment.h>

// PGM_BASE virtual methods that need implementations
wxApp& PGM_BASE::App() {
    return *wxTheApp;
}

COMMON_SETTINGS* PGM_BASE::GetCommonSettings() const {
    return nullptr;
}

const wxString& PGM_BASE::GetExecutablePath() const {
    static wxString empty;
    return empty;
}

ENV_VAR_MAP& PGM_BASE::GetLocalEnvVariables() const {
    static ENV_VAR_MAP empty;
    return empty;
}

bool PGM_BASE::SetLanguage(wxString&, bool) { return false; }
const wxString& PGM_BASE::GetTextEditor(bool) { static wxString s; return s; }
void PGM_BASE::SetTextEditor(const wxString&) {}
wxString PGM_BASE::GetLanguageTag() { return wxString(); }
void PGM_BASE::SetLanguagePath() {}
void PGM_BASE::ReadPdfBrowserInfos() {}
bool PGM_BASE::SetLocalEnvVariable(const wxString&, const wxString&) { return false; }
void PGM_BASE::SetLocalEnvVariables() {}
void PGM_BASE::WritePdfBrowserInfos() {}
void PGM_BASE::SetLanguageIdentifier(int) {}
const wxString PGM_BASE::AskUserForPreferredEditor(const wxString&) { return wxString(); }

PGM_BASE::PGM_BASE() {
    m_singleton.Init();  // Initialize GL_CONTEXT_MANAGER
}
PGM_BASE::~PGM_BASE() {}

//=============================================================================
// Additional linker stubs
//=============================================================================

// UI dialog stubs
void DisplayError(wxWindow*, const wxString&) {}
void DisplayErrorMessage(wxWindow*, const wxString&, const wxString&) {}

// OpenGL info stub
void SetOpenGLInfo(const char*, const char*, const char*) {}

// Math logging stub
void kimathLogOverflow(double, const char*) {}

// Arc geometry stub
#include <geometry/eda_angle.h>
int GetArcToSegmentCount(int aRadius, int aArcError, const EDA_ANGLE& aArcAngle) {
    // Simple approximation: 1 segment per 10 degrees
    double degrees = std::abs(aArcAngle.AsDegrees());
    return std::max(1, (int)(degrees / 10.0));
}

// Bezier curve stub
#include <bezier_curves.h>
void BEZIER_POLY::GetPoly(std::vector<VECTOR2D>& aOutput, double aMinSegLen) {
    // Return just start and end points
    if (!m_ctrlPts.empty()) {
        aOutput.push_back(m_ctrlPts.front());
        aOutput.push_back(m_ctrlPts.back());
    }
}

// DPI scaling stub
#include <dpi_scaling.h>
double DPI_SCALING::GetDefaultScaleFactor() { return 1.0; }

// Advanced config constructor
ADVANCED_CFG::ADVANCED_CFG() {
    // Initialize m_ScreenDPI - KiCad default is 91
    m_ScreenDPI = 91;
}

// Cursor store stub
#include <gal/cursors.h>
const WX_CURSOR_TYPE CURSOR_STORE::GetCursor(KICURSOR aCursor, bool aHiDPI) {
    return wxCursor(wxCURSOR_ARROW);
}

// Singleton init/destructor
#include <singleton.h>
void KICAD_SINGLETON::Init() {
    m_GLContextManager = new GL_CONTEXT_MANAGER();
    // Skip thread pool for now
}
KICAD_SINGLETON::~KICAD_SINGLETON() {
    delete m_GLContextManager;
    m_GLContextManager = nullptr;
}

// TEXT_ATTRIBUTES constructor
#include <font/text_attributes.h>
TEXT_ATTRIBUTES::TEXT_ATTRIBUTES(KIFONT::FONT* aFont) {}

// KIID constructors
KIID::KIID() {}
KIID::KIID(int aValue) {}

// UTF8 stubs
#include <core/utf8.h>
UTF8::UTF8(const wxString& s) : m_s(s.ToUTF8().data()) {}
int UTF8::uni_forward(const unsigned char* aSequence, unsigned* aResult) {
    if (aSequence && *aSequence) {
        if (aResult) *aResult = (unsigned)*aSequence;
        return 1;
    }
    if (aResult) *aResult = 0;
    return 0;
}

// UTIL::LINK stubs
namespace UTIL {
LINK::LINK() : token_(nullptr), observer_(nullptr) {}
LINK::LINK(std::shared_ptr<DETAIL::OBSERVABLE_BASE::IMPL> token, void* observer)
    : token_(token), observer_(observer) {}
LINK::LINK(LINK&& other) : token_(std::move(other.token_)), observer_(other.observer_) {
    other.observer_ = nullptr;
}
LINK::~LINK() {}
LINK& LINK::operator=(LINK&& other) {
    token_ = std::move(other.token_);
    observer_ = other.observer_;
    other.observer_ = nullptr;
    return *this;
}
void LINK::reset() { token_.reset(); observer_ = nullptr; }
LINK::operator bool() const { return token_ != nullptr; }
}

// VC_SETTINGS::Reset stub
#include <view/view_controls.h>
namespace KIGFX {
void VC_SETTINGS::Reset() {}
}

// KIFONT::FONT::Draw stub (the version with cursor position)
namespace KIFONT {
void FONT::Draw(KIGFX::GAL*, const wxString&, const VECTOR2I&, const VECTOR2I&,
                const TEXT_ATTRIBUTES&, const METRICS&) const {}
} // namespace KIFONT
