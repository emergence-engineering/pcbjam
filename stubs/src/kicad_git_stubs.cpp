/*
 * KiCad Wasm Port - Stub implementations for KiCad git classes
 *
 * Provides empty/stub implementations for KiCad git-related classes
 * when KICAD_USE_GIT=OFF.
 */

#include <wx/string.h>
#include <wx/window.h>
#include <wx/aui/aui.h>
#include <vector>
#include <map>
#include <set>
#include <functional>
#include <git2.h>

// Include KiCad headers to get proper class declarations
#include <git/kicad_git_common.h>
#include <git/git_status_handler.h>
#include <git/git_resolve_conflict_handler.h>
#include <git/git_remove_from_index_handler.h>
#include <git/git_add_to_index_handler.h>
#include <git/git_commit_handler.h>
#include <git/git_pull_handler.h>
#include <git/git_push_handler.h>
#include <git/git_sync_handler.h>
#include <git/git_switch_branch_handler.h>
#include <git/git_revert_handler.h>
#include <git/libgit_backend.h>

// Forward declare KICAD_MANAGER_FRAME for LOCAL_HISTORY_PANE
class KICAD_MANAGER_FRAME;

// =============================================================================
// KIGIT_COMMON stub implementations
// =============================================================================

KIGIT_COMMON::KIGIT_COMMON( git_repository* aRepo ) :
    m_repo( aRepo ),
    m_connType( GIT_CONN_TYPE::GIT_CONN_LOCAL ),
    m_testedTypes( 0 ),
    m_nextPublicKey( 0 ),
    m_secretFetched( false ),
    m_cancel( false )
{}

KIGIT_COMMON::KIGIT_COMMON( const KIGIT_COMMON& aOther ) :
    m_repo( aOther.m_repo ),
    m_connType( aOther.m_connType ),
    m_remote( aOther.m_remote ),
    m_hostname( aOther.m_hostname ),
    m_username( aOther.m_username ),
    m_password( aOther.m_password ),
    m_testedTypes( aOther.m_testedTypes ),
    m_publicKeys( aOther.m_publicKeys ),
    m_nextPublicKey( aOther.m_nextPublicKey ),
    m_secretFetched( aOther.m_secretFetched ),
    m_cancel( aOther.m_cancel.load() )
{}

KIGIT_COMMON::~KIGIT_COMMON() {}

git_repository* KIGIT_COMMON::GetRepo() const { return m_repo; }
wxString KIGIT_COMMON::GetGitRootDirectory() const { return wxEmptyString; }
std::vector<wxString> KIGIT_COMMON::GetBranchNames() const { return {}; }
std::vector<wxString> KIGIT_COMMON::GetProjectDirs() { return {}; }
bool KIGIT_COMMON::HasLocalCommits() const { return false; }
bool KIGIT_COMMON::HasPushAndPullRemote() const { return false; }

std::pair<std::set<wxString>, std::set<wxString>> KIGIT_COMMON::GetDifferentFiles() const
{
    return std::make_pair( std::set<wxString>(), std::set<wxString>() );
}

wxString KIGIT_COMMON::GetCurrentBranchName() const { return wxEmptyString; }
wxString KIGIT_COMMON::GetRemotename() const { return wxEmptyString; }
wxString KIGIT_COMMON::GetPassword() { return wxEmptyString; }
KIGIT_COMMON::GIT_CONN_TYPE KIGIT_COMMON::GetConnType() const { return m_connType; }
void KIGIT_COMMON::SetSSHKey( const wxString& aSSHKey ) { (void)aSSHKey; }
void KIGIT_COMMON::UpdateCurrentBranchInfo() {}

int KIGIT_COMMON::HandleSSHKeyAuthentication( git_cred** aOut, const wxString& aUsername )
{
    (void)aOut; (void)aUsername;
    return -1;
}

int KIGIT_COMMON::HandlePlaintextAuthentication( git_cred** aOut, const wxString& aUsername )
{
    (void)aOut; (void)aUsername;
    return -1;
}

int KIGIT_COMMON::HandleSSHAgentAuthentication( git_cred** aOut, const wxString& aUsername )
{
    (void)aOut; (void)aUsername;
    return -1;
}

// Private methods
void KIGIT_COMMON::updatePublicKeys() {}
void KIGIT_COMMON::updateConnectionType() {}

// =============================================================================
// KIGIT_REPO_MIXIN - all methods are inline in the header, no stubs needed
// =============================================================================

// =============================================================================
// GIT_STATUS_HANDLER stub implementations
// =============================================================================

GIT_STATUS_HANDLER::GIT_STATUS_HANDLER( KIGIT_COMMON* aCommon ) : KIGIT_REPO_MIXIN( aCommon ) {}
GIT_STATUS_HANDLER::~GIT_STATUS_HANDLER() {}

bool GIT_STATUS_HANDLER::HasChangedFiles() { return false; }
std::map<wxString, FileStatus> GIT_STATUS_HANDLER::GetFileStatus( const wxString& aPathspec )
{
    (void)aPathspec;
    return {};
}
wxString GIT_STATUS_HANDLER::GetCurrentBranchName() { return wxEmptyString; }
void GIT_STATUS_HANDLER::UpdateRemoteStatus( const std::set<wxString>& aLocalChanges,
                                              const std::set<wxString>& aRemoteChanges,
                                              std::map<wxString, FileStatus>& aFileStatus )
{
    (void)aLocalChanges; (void)aRemoteChanges; (void)aFileStatus;
}
wxString GIT_STATUS_HANDLER::GetWorkingDirectory() { return wxEmptyString; }
KIGIT_COMMON::GIT_STATUS GIT_STATUS_HANDLER::ConvertStatus( unsigned int aGitStatus )
{
    (void)aGitStatus;
    return KIGIT_COMMON::GIT_STATUS::GIT_STATUS_CURRENT;
}

// =============================================================================
// GIT_RESOLVE_CONFLICT_HANDLER stub implementations
// =============================================================================

GIT_RESOLVE_CONFLICT_HANDLER::GIT_RESOLVE_CONFLICT_HANDLER( git_repository* aRepo )
    : KIGIT_REPO_MIXIN( nullptr )
{
    (void)aRepo;
}
GIT_RESOLVE_CONFLICT_HANDLER::~GIT_RESOLVE_CONFLICT_HANDLER() {}

bool GIT_RESOLVE_CONFLICT_HANDLER::PerformResolveConflict() { return false; }

// =============================================================================
// GIT_REMOVE_FROM_INDEX_HANDLER stub implementations
// =============================================================================

GIT_REMOVE_FROM_INDEX_HANDLER::GIT_REMOVE_FROM_INDEX_HANDLER( git_repository* aRepo )
    : KIGIT_REPO_MIXIN( nullptr )
{
    (void)aRepo;
}
GIT_REMOVE_FROM_INDEX_HANDLER::~GIT_REMOVE_FROM_INDEX_HANDLER() {}

bool GIT_REMOVE_FROM_INDEX_HANDLER::PerformRemoveFromIndex() { return false; }
void GIT_REMOVE_FROM_INDEX_HANDLER::SetFilePaths( const std::vector<wxString>& aPaths )
{
    (void)aPaths;
}

// =============================================================================
// GIT_ADD_TO_INDEX_HANDLER stub implementations
// =============================================================================

GIT_ADD_TO_INDEX_HANDLER::GIT_ADD_TO_INDEX_HANDLER( git_repository* aRepo )
    : KIGIT_REPO_MIXIN( nullptr )
{
    (void)aRepo;
}
GIT_ADD_TO_INDEX_HANDLER::~GIT_ADD_TO_INDEX_HANDLER() {}

bool GIT_ADD_TO_INDEX_HANDLER::PerformAddToIndex() { return false; }
void GIT_ADD_TO_INDEX_HANDLER::SetFilePaths( const std::vector<wxString>& aPaths )
{
    (void)aPaths;
}

// =============================================================================
// GIT_COMMIT_HANDLER stub implementations
// =============================================================================

GIT_COMMIT_HANDLER::GIT_COMMIT_HANDLER( git_repository* aRepo )
    : KIGIT_REPO_MIXIN( nullptr )
{
    (void)aRepo;
}
GIT_COMMIT_HANDLER::~GIT_COMMIT_HANDLER() {}

bool GIT_COMMIT_HANDLER::PerformCommit() { return false; }
void GIT_COMMIT_HANDLER::SetAuthorName( const wxString& aName ) { (void)aName; }
void GIT_COMMIT_HANDLER::SetAuthorEmail( const wxString& aEmail ) { (void)aEmail; }
void GIT_COMMIT_HANDLER::SetCommitMessage( const wxString& aMessage ) { (void)aMessage; }
void GIT_COMMIT_HANDLER::SetFilePaths( const std::vector<wxString>& aPaths ) { (void)aPaths; }

// =============================================================================
// GIT_PULL_HANDLER stub implementations
// =============================================================================

GIT_PULL_HANDLER::GIT_PULL_HANDLER( KIGIT_COMMON* aCommon ) : KIGIT_REPO_MIXIN( aCommon ) {}
GIT_PULL_HANDLER::~GIT_PULL_HANDLER() {}

bool GIT_PULL_HANDLER::PerformPull() { return false; }

// =============================================================================
// GIT_PUSH_HANDLER stub implementations
// =============================================================================

GIT_PUSH_HANDLER::GIT_PUSH_HANDLER( KIGIT_COMMON* aCommon ) : KIGIT_REPO_MIXIN( aCommon ) {}
GIT_PUSH_HANDLER::~GIT_PUSH_HANDLER() {}

bool GIT_PUSH_HANDLER::PerformPush() { return false; }

// =============================================================================
// GIT_SYNC_HANDLER stub implementations
// =============================================================================

GIT_SYNC_HANDLER::GIT_SYNC_HANDLER( KIGIT_COMMON* aCommon ) : KIGIT_REPO_MIXIN( aCommon ) {}
GIT_SYNC_HANDLER::~GIT_SYNC_HANDLER() {}

bool GIT_SYNC_HANDLER::PerformSync() { return false; }

// =============================================================================
// GIT_SWITCH_BRANCH_HANDLER stub implementations
// =============================================================================

GIT_SWITCH_BRANCH_HANDLER::GIT_SWITCH_BRANCH_HANDLER( KIGIT_COMMON* aCommon )
    : KIGIT_REPO_MIXIN( aCommon )
{
}
GIT_SWITCH_BRANCH_HANDLER::~GIT_SWITCH_BRANCH_HANDLER() {}

bool GIT_SWITCH_BRANCH_HANDLER::PerformSwitchBranch() { return false; }
void GIT_SWITCH_BRANCH_HANDLER::SetBranchName( const wxString& aName ) { (void)aName; }

// =============================================================================
// GIT_REVERT_HANDLER stub implementations
// =============================================================================

GIT_REVERT_HANDLER::GIT_REVERT_HANDLER( KIGIT_COMMON* aCommon ) : KIGIT_REPO_MIXIN( aCommon ) {}
GIT_REVERT_HANDLER::~GIT_REVERT_HANDLER() {}

bool GIT_REVERT_HANDLER::PerformRevert() { return false; }
void GIT_REVERT_HANDLER::SetFilePaths( const std::vector<wxString>& aPaths ) { (void)aPaths; }

// =============================================================================
// LIBGIT_BACKEND stub implementations
// =============================================================================

LIBGIT_BACKEND::LIBGIT_BACKEND() {}
LIBGIT_BACKEND::~LIBGIT_BACKEND() {}

void LIBGIT_BACKEND::Init() {}
void LIBGIT_BACKEND::Cleanup() {}

// =============================================================================
// LOCAL_HISTORY_PANE stub - declared here since we excluded the cpp file
// =============================================================================

class LOCAL_HISTORY_PANE : public wxPanel
{
public:
    LOCAL_HISTORY_PANE( KICAD_MANAGER_FRAME* aParent );
    ~LOCAL_HISTORY_PANE();
    void RefreshHistory( const wxString& aProjectPath );
};

LOCAL_HISTORY_PANE::LOCAL_HISTORY_PANE( KICAD_MANAGER_FRAME* aParent )
    : wxPanel( reinterpret_cast<wxWindow*>(aParent), wxID_ANY )
{
}

LOCAL_HISTORY_PANE::~LOCAL_HISTORY_PANE() {}

void LOCAL_HISTORY_PANE::RefreshHistory( const wxString& aProjectPath )
{
    (void)aProjectPath;
}

// =============================================================================
// Extern "C" callbacks (declared in kicad_git_common.h)
// =============================================================================

extern "C" {
    int progress_cb( const char* str, int len, void* data )
    {
        (void)str; (void)len; (void)data;
        return 0;
    }

    void clone_progress_cb( const char* str, size_t len, size_t total, void* data )
    {
        (void)str; (void)len; (void)total; (void)data;
    }

    int transfer_progress_cb( const git_transfer_progress* aStats, void* aPayload )
    {
        (void)aStats; (void)aPayload;
        return 0;
    }

    int update_cb( const char* aRefname, const git_oid* aFirst, const git_oid* aSecond,
                   void* aPayload )
    {
        (void)aRefname; (void)aFirst; (void)aSecond; (void)aPayload;
        return 0;
    }

    int push_transfer_progress_cb( unsigned int aCurrent, unsigned int aTotal,
                                   size_t aBytes, void* aPayload )
    {
        (void)aCurrent; (void)aTotal; (void)aBytes; (void)aPayload;
        return 0;
    }

    int push_update_reference_cb( const char* aRefname, const char* aStatus,
                                  void* aPayload )
    {
        (void)aRefname; (void)aStatus; (void)aPayload;
        return 0;
    }

    int fetchhead_foreach_cb( const char* aRefname, const char* aRemoteUrl,
                              const git_oid* aOID, unsigned int aIsMerge, void* aPayload )
    {
        (void)aRefname; (void)aRemoteUrl; (void)aOID; (void)aIsMerge; (void)aPayload;
        return 0;
    }

    int credentials_cb( git_cred** aOut, const char* aUrl, const char* aUsername,
                        unsigned int aAllowedTypes, void* aPayload )
    {
        (void)aOut; (void)aUrl; (void)aUsername; (void)aAllowedTypes; (void)aPayload;
        return -1;
    }
}
