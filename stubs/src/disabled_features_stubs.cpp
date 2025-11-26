/*
 * KiCad Wasm Port - Stub implementations for disabled features
 *
 * Provides empty/stub implementations for functions from optional
 * dependencies (curl, git, ngspice, OCC) when they are disabled.
 */

#include <string>
#include <shared_mutex>
#include <wx/string.h>
#include <kicommon.h>
#include <local_history.h>
#include <kicad_curl/kicad_curl.h>
#include <git/project_git_utils.h>

// =============================================================================
// CURL stubs (when KICAD_USE_CURL=OFF)
// =============================================================================

std::string GetKicadCurlVersion()
{
    return "disabled";
}

std::string GetCurlLibVersion()
{
    return "disabled";
}

static std::shared_mutex s_curlMutex;
static bool s_shuttingDown = false;

void KICAD_CURL::Init()
{
    // No-op when curl is disabled
}

void KICAD_CURL::Cleanup()
{
    // No-op when curl is disabled
}

std::shared_mutex& KICAD_CURL::Mutex()
{
    return s_curlMutex;
}

bool KICAD_CURL::IsShuttingDown()
{
    return s_shuttingDown;
}

// =============================================================================
// Local History stubs (when KICAD_USE_GIT=OFF)
// =============================================================================

LOCAL_HISTORY::LOCAL_HISTORY() {}
LOCAL_HISTORY::~LOCAL_HISTORY() {}

bool LOCAL_HISTORY::Init( const wxString& aProjectPath ) { return false; }
bool LOCAL_HISTORY::CommitSnapshot( const std::vector<wxString>& aFiles, const wxString& aTitle ) { return false; }
bool LOCAL_HISTORY::CommitFullProjectSnapshot( const wxString& aProjectPath, const wxString& aTitle ) { return false; }
void LOCAL_HISTORY::RegisterSaver( const void* aSaverObject, const std::function<void(const wxString&, std::vector<wxString>&)>& aSaver ) {}
void LOCAL_HISTORY::UnregisterSaver( const void* aSaverObject ) {}
void LOCAL_HISTORY::ClearAllSavers() {}
bool LOCAL_HISTORY::RunRegisteredSaversAndCommit( const wxString& aProjectPath, const wxString& aTitle ) { return false; }
void LOCAL_HISTORY::NoteFileChange( const wxString& aFile ) {}
bool LOCAL_HISTORY::CommitPending() { return false; }
bool LOCAL_HISTORY::HistoryExists( const wxString& aProjectPath ) { return false; }
bool LOCAL_HISTORY::TagSave( const wxString& aProjectPath, const wxString& aFileType ) { return false; }
bool LOCAL_HISTORY::CommitDuplicateOfLastSave( const wxString& aProjectPath, const wxString& aFileType, const wxString& aMessage ) { return false; }
bool LOCAL_HISTORY::EnforceSizeLimit( const wxString& aProjectPath, size_t aMaxBytes ) { return false; }
bool LOCAL_HISTORY::HeadNewerThanLastSave( const wxString& aProjectPath ) { return false; }
wxString LOCAL_HISTORY::GetHeadHash( const wxString& aProjectPath ) { return wxEmptyString; }
bool LOCAL_HISTORY::RestoreCommit( const wxString& aProjectPath, const wxString& aHash, wxWindow* aParent ) { return false; }
void LOCAL_HISTORY::ShowRestoreDialog( const wxString& aProjectPath, wxWindow* aParent ) {}

// =============================================================================
// Git utils stubs (when KICAD_USE_GIT=OFF)
// =============================================================================

namespace KIGIT
{

git_repository* PROJECT_GIT_UTILS::GetRepositoryForFile( const char* aFilename )
{
    return nullptr;
}

int PROJECT_GIT_UTILS::CreateBranch( git_repository* aRepo, const wxString& aBranchName )
{
    return -1;  // Error: git disabled
}

wxString PROJECT_GIT_UTILS::GetCurrentHash( const wxString& aProjectFile, bool aShort )
{
    return wxEmptyString;
}

bool PROJECT_GIT_UTILS::RemoveVCS( git_repository*& aRepo, const wxString& aProjectPath,
                                    bool aRemoveGitDir, wxString* aErrors )
{
    return false;
}

} // namespace KIGIT

// =============================================================================
// KICAD_CURL_EASY stubs (when KICAD_USE_CURL=OFF)
// =============================================================================

// Need to define CURL_PROGRESS before including the header
struct CURL_PROGRESS
{
    size_t dltotal;
    size_t dlnow;
    size_t ultotal;
    size_t ulnow;
};

#include <kicad_curl/kicad_curl_easy.h>

KICAD_CURL_EASY::KICAD_CURL_EASY()
    : m_CURL( nullptr )
    , m_headers( nullptr )
    , progress( std::make_unique<CURL_PROGRESS>() )
{
}

KICAD_CURL_EASY::~KICAD_CURL_EASY() {}

int KICAD_CURL_EASY::Perform() { return -1; }

bool KICAD_CURL_EASY::SetURL( const std::string& aURL )
{
    (void)aURL;
    return false;
}

bool KICAD_CURL_EASY::SetFollowRedirects( bool aFollow )
{
    (void)aFollow;
    return false;
}

void KICAD_CURL_EASY::SetHeader( const std::string& aName, const std::string& aValue )
{
    (void)aName; (void)aValue;
}

bool KICAD_CURL_EASY::SetUserAgent( const std::string& aAgent )
{
    (void)aAgent;
    return false;
}

bool KICAD_CURL_EASY::SetPostFields( const std::vector<std::pair<std::string, std::string>>& aFields )
{
    (void)aFields;
    return false;
}

bool KICAD_CURL_EASY::SetPostFields( const std::string& aField )
{
    (void)aField;
    return false;
}

bool KICAD_CURL_EASY::SetOutputStream( const std::ostream* aOutput )
{
    (void)aOutput;
    return false;
}

bool KICAD_CURL_EASY::SetTransferCallback( const TRANSFER_CALLBACK& aCallback, size_t aInterval )
{
    (void)aCallback; (void)aInterval;
    return false;
}

int KICAD_CURL_EASY::GetTransferTotal( uint64_t& aDownloadedBytes ) const
{
    aDownloadedBytes = 0;
    return -1;
}

const std::string KICAD_CURL_EASY::GetErrorText( int aCode )
{
    (void)aCode;
    return "CURL disabled";
}

std::string KICAD_CURL_EASY::Escape( const std::string& aUrl )
{
    return aUrl;  // Return unescaped
}

int KICAD_CURL_EASY::GetResponseStatusCode()
{
    return 0;
}

// =============================================================================
// PANEL_GIT_REPOS stub is in panel_git_repos_stub.cpp (common library)
// =============================================================================
