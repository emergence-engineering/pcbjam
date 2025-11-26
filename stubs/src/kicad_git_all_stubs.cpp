/*
 * KiCad Wasm Port - Comprehensive stub implementations for git-disabled builds
 *
 * Provides stub implementations for all git-related classes when KICAD_USE_GIT=OFF.
 * These stubs allow the kicad app to link without libgit2.
 */

#include <wx/string.h>
#include <wx/window.h>
#include <wx/panel.h>
#include <wx/aui/aui.h>
#include <vector>
#include <map>
#include <set>
#include <functional>

// Include git2 stub header for types
#include <git2.h>

// Include KiCad headers for proper class declarations
#include <git/kicad_git_common.h>
#include <git/git_backend.h>
#include <git/libgit_backend.h>
#include <git/git_repo_mixin.h>
#include <git/git_status_handler.h>
#include <git/git_resolve_conflict_handler.h>
#include <git/git_remove_from_index_handler.h>
#include <git/git_add_to_index_handler.h>
#include <git/git_commit_handler.h>
#include <git/git_pull_handler.h>
#include <git/git_push_handler.h>
#include <git/git_branch_handler.h>
#include <git/git_revert_handler.h>
#include <git/git_init_handler.h>
#include <git/git_clone_handler.h>
#include <git/git_config_handler.h>
#include <git/git_sync_handler.h>

// Forward declare classes we'll stub
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

void KIGIT_COMMON::updatePublicKeys() {}
void KIGIT_COMMON::updateConnectionType() {}

// =============================================================================
// GIT_STATUS_HANDLER stub implementations (inherits from KIGIT_REPO_MIXIN)
// =============================================================================

GIT_STATUS_HANDLER::GIT_STATUS_HANDLER( KIGIT_COMMON* aCommon ) : KIGIT_REPO_MIXIN( aCommon )
{
}
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
void GIT_STATUS_HANDLER::UpdateProgress( int aCurrent, int aTotal, const wxString& aMessage )
{
    (void)aCurrent; (void)aTotal; (void)aMessage;
}

// =============================================================================
// GIT_RESOLVE_CONFLICT_HANDLER stub implementations (no base class)
// =============================================================================

GIT_RESOLVE_CONFLICT_HANDLER::GIT_RESOLVE_CONFLICT_HANDLER( git_repository* aRepo )
    : m_repository( aRepo )
{
}
GIT_RESOLVE_CONFLICT_HANDLER::~GIT_RESOLVE_CONFLICT_HANDLER() {}

bool GIT_RESOLVE_CONFLICT_HANDLER::PerformResolveConflict() { return false; }

// =============================================================================
// GIT_REMOVE_FROM_INDEX_HANDLER stub implementations (inherits from KIGIT_COMMON)
// =============================================================================

GIT_REMOVE_FROM_INDEX_HANDLER::GIT_REMOVE_FROM_INDEX_HANDLER( git_repository* aRepo )
    : KIGIT_COMMON( aRepo )
{
}
GIT_REMOVE_FROM_INDEX_HANDLER::~GIT_REMOVE_FROM_INDEX_HANDLER() {}

bool GIT_REMOVE_FROM_INDEX_HANDLER::RemoveFromIndex( const wxString& aFilePath )
{
    (void)aFilePath;
    return false;
}

void GIT_REMOVE_FROM_INDEX_HANDLER::PerformRemoveFromIndex() {}

// =============================================================================
// GIT_ADD_TO_INDEX_HANDLER stub implementations (inherits from KIGIT_COMMON)
// =============================================================================

GIT_ADD_TO_INDEX_HANDLER::GIT_ADD_TO_INDEX_HANDLER( git_repository* aRepo )
    : KIGIT_COMMON( aRepo )
{
}
GIT_ADD_TO_INDEX_HANDLER::~GIT_ADD_TO_INDEX_HANDLER() {}

bool GIT_ADD_TO_INDEX_HANDLER::AddToIndex( const wxString& aFilePath )
{
    (void)aFilePath;
    return false;
}

bool GIT_ADD_TO_INDEX_HANDLER::PerformAddToIndex() { return false; }

// =============================================================================
// GIT_COMMIT_HANDLER stub implementations (inherits from KIGIT_COMMON)
// =============================================================================

GIT_COMMIT_HANDLER::GIT_COMMIT_HANDLER( git_repository* aRepo )
    : KIGIT_COMMON( aRepo )
{
}
GIT_COMMIT_HANDLER::~GIT_COMMIT_HANDLER() {}

CommitResult GIT_COMMIT_HANDLER::PerformCommit( const std::vector<wxString>& aFiles,
                                                 const wxString& aMessage,
                                                 const wxString& aAuthorName,
                                                 const wxString& aAuthorEmail )
{
    (void)aFiles; (void)aMessage; (void)aAuthorName; (void)aAuthorEmail;
    return CommitResult::Error;
}

wxString GIT_COMMIT_HANDLER::GetErrorString() const { return wxT("Git support is disabled"); }

void GIT_COMMIT_HANDLER::AddErrorString( const wxString& aErrorString )
{
    (void)aErrorString;
}

// =============================================================================
// GIT_PULL_HANDLER stub implementations (inherits from KIGIT_REPO_MIXIN)
// =============================================================================

GIT_PULL_HANDLER::GIT_PULL_HANDLER( KIGIT_COMMON* aCommon ) : KIGIT_REPO_MIXIN( aCommon )
{
}
GIT_PULL_HANDLER::~GIT_PULL_HANDLER() {}

bool GIT_PULL_HANDLER::PerformFetch( bool aSkipLock )
{
    (void)aSkipLock;
    return false;
}

PullResult GIT_PULL_HANDLER::PerformPull() { return PullResult::Error; }

const std::vector<std::pair<std::string, std::vector<CommitDetails>>>& GIT_PULL_HANDLER::GetFetchResults() const
{
    return m_fetchResults;
}

void GIT_PULL_HANDLER::UpdateProgress( int aCurrent, int aTotal, const wxString& aMessage )
{
    (void)aCurrent; (void)aTotal; (void)aMessage;
}

// =============================================================================
// GIT_PUSH_HANDLER stub implementations (inherits from KIGIT_REPO_MIXIN)
// =============================================================================

GIT_PUSH_HANDLER::GIT_PUSH_HANDLER( KIGIT_COMMON* aCommon ) : KIGIT_REPO_MIXIN( aCommon )
{
}
GIT_PUSH_HANDLER::~GIT_PUSH_HANDLER() {}

PushResult GIT_PUSH_HANDLER::PerformPush() { return PushResult::Error; }

void GIT_PUSH_HANDLER::UpdateProgress( int aCurrent, int aTotal, const wxString& aMessage )
{
    (void)aCurrent; (void)aTotal; (void)aMessage;
}

// =============================================================================
// GIT_BRANCH_HANDLER stub implementations (inherits from KIGIT_REPO_MIXIN)
// =============================================================================

GIT_BRANCH_HANDLER::GIT_BRANCH_HANDLER( KIGIT_COMMON* aCommon ) : KIGIT_REPO_MIXIN( aCommon )
{
}
GIT_BRANCH_HANDLER::~GIT_BRANCH_HANDLER() {}

BranchResult GIT_BRANCH_HANDLER::SwitchToBranch( const wxString& aBranchName )
{
    (void)aBranchName;
    return BranchResult::Error;
}

bool GIT_BRANCH_HANDLER::BranchExists( const wxString& aBranchName )
{
    (void)aBranchName;
    return false;
}

void GIT_BRANCH_HANDLER::UpdateProgress( int aCurrent, int aTotal, const wxString& aMessage )
{
    (void)aCurrent; (void)aTotal; (void)aMessage;
}

// =============================================================================
// GIT_REVERT_HANDLER stub implementations (no base class)
// =============================================================================

GIT_REVERT_HANDLER::GIT_REVERT_HANDLER( git_repository* aRepo )
    : m_repository( aRepo )
{
}
GIT_REVERT_HANDLER::~GIT_REVERT_HANDLER() {}

bool GIT_REVERT_HANDLER::Revert( const wxString& aFilePath )
{
    (void)aFilePath;
    return false;
}

void GIT_REVERT_HANDLER::PerformRevert() {}

// =============================================================================
// GIT_INIT_HANDLER stub implementations (inherits from KIGIT_REPO_MIXIN)
// =============================================================================

GIT_INIT_HANDLER::GIT_INIT_HANDLER( KIGIT_COMMON* aCommon ) : KIGIT_REPO_MIXIN( aCommon )
{
}
GIT_INIT_HANDLER::~GIT_INIT_HANDLER() {}

bool GIT_INIT_HANDLER::IsRepository( const wxString& aPath )
{
    (void)aPath;
    return false;
}

InitResult GIT_INIT_HANDLER::InitializeRepository( const wxString& aPath )
{
    (void)aPath;
    return InitResult::Error;
}

bool GIT_INIT_HANDLER::SetupRemote( const RemoteConfig& aConfig )
{
    (void)aConfig;
    return false;
}

void GIT_INIT_HANDLER::UpdateProgress( int aCurrent, int aTotal, const wxString& aMessage )
{
    (void)aCurrent; (void)aTotal; (void)aMessage;
}

// =============================================================================
// GIT_CLONE_HANDLER stub implementations (inherits from KIGIT_REPO_MIXIN)
// =============================================================================

GIT_CLONE_HANDLER::GIT_CLONE_HANDLER( KIGIT_COMMON* aCommon ) : KIGIT_REPO_MIXIN( aCommon )
{
}
GIT_CLONE_HANDLER::~GIT_CLONE_HANDLER() {}

bool GIT_CLONE_HANDLER::PerformClone() { return false; }

void GIT_CLONE_HANDLER::UpdateProgress( int aCurrent, int aTotal, const wxString& aMessage )
{
    (void)aCurrent; (void)aTotal; (void)aMessage;
}

// =============================================================================
// GIT_CONFIG_HANDLER stub implementations (inherits from KIGIT_REPO_MIXIN)
// =============================================================================

GIT_CONFIG_HANDLER::GIT_CONFIG_HANDLER( KIGIT_COMMON* aCommon ) : KIGIT_REPO_MIXIN( aCommon )
{
}
GIT_CONFIG_HANDLER::~GIT_CONFIG_HANDLER() {}

GitUserConfig GIT_CONFIG_HANDLER::GetUserConfig()
{
    return GitUserConfig();
}

wxString GIT_CONFIG_HANDLER::GetWorkingDirectory() { return wxEmptyString; }

bool GIT_CONFIG_HANDLER::GetConfigString( const wxString& aKey, wxString& aValue )
{
    (void)aKey; (void)aValue;
    return false;
}

void GIT_CONFIG_HANDLER::UpdateProgress( int aCurrent, int aTotal, const wxString& aMessage )
{
    (void)aCurrent; (void)aTotal; (void)aMessage;
}

// =============================================================================
// GIT_SYNC_HANDLER stub implementations (no base class)
// =============================================================================

GIT_SYNC_HANDLER::GIT_SYNC_HANDLER( git_repository* aRepository )
    : m_repository( aRepository )
{
}
GIT_SYNC_HANDLER::~GIT_SYNC_HANDLER() {}

bool GIT_SYNC_HANDLER::PerformSync() { return false; }

// =============================================================================
// LIBGIT_BACKEND stub implementations
// =============================================================================

void LIBGIT_BACKEND::Init() {}
void LIBGIT_BACKEND::Shutdown() {}
bool LIBGIT_BACKEND::IsLibraryAvailable() { return false; }

bool LIBGIT_BACKEND::Clone( GIT_CLONE_HANDLER* aHandler )
{
    (void)aHandler;
    return false;
}

CommitResult LIBGIT_BACKEND::Commit( GIT_COMMIT_HANDLER* aHandler,
                                      const std::vector<wxString>& aFiles,
                                      const wxString& aMessage,
                                      const wxString& aAuthorName,
                                      const wxString& aAuthorEmail )
{
    (void)aHandler; (void)aFiles; (void)aMessage; (void)aAuthorName; (void)aAuthorEmail;
    return CommitResult::Error;
}

PushResult LIBGIT_BACKEND::Push( GIT_PUSH_HANDLER* aHandler )
{
    (void)aHandler;
    return PushResult::Error;
}

bool LIBGIT_BACKEND::HasChangedFiles( GIT_STATUS_HANDLER* aHandler )
{
    (void)aHandler;
    return false;
}

std::map<wxString, FileStatus> LIBGIT_BACKEND::GetFileStatus( GIT_STATUS_HANDLER* aHandler,
                                                               const wxString& aPathspec )
{
    (void)aHandler; (void)aPathspec;
    return {};
}

wxString LIBGIT_BACKEND::GetCurrentBranchName( GIT_STATUS_HANDLER* aHandler )
{
    (void)aHandler;
    return wxEmptyString;
}

void LIBGIT_BACKEND::UpdateRemoteStatus( GIT_STATUS_HANDLER* aHandler,
                                          const std::set<wxString>& aLocalChanges,
                                          const std::set<wxString>& aRemoteChanges,
                                          std::map<wxString, FileStatus>& aFileStatus )
{
    (void)aHandler; (void)aLocalChanges; (void)aRemoteChanges; (void)aFileStatus;
}

wxString LIBGIT_BACKEND::GetWorkingDirectory( GIT_STATUS_HANDLER* aHandler )
{
    (void)aHandler;
    return wxEmptyString;
}

wxString LIBGIT_BACKEND::GetWorkingDirectory( GIT_CONFIG_HANDLER* aHandler )
{
    (void)aHandler;
    return wxEmptyString;
}

bool LIBGIT_BACKEND::GetConfigString( GIT_CONFIG_HANDLER* aHandler, const wxString& aKey,
                                       wxString& aValue )
{
    (void)aHandler; (void)aKey; (void)aValue;
    return false;
}

bool LIBGIT_BACKEND::IsRepository( GIT_INIT_HANDLER* aHandler, const wxString& aPath )
{
    (void)aHandler; (void)aPath;
    return false;
}

InitResult LIBGIT_BACKEND::InitializeRepository( GIT_INIT_HANDLER* aHandler, const wxString& aPath )
{
    (void)aHandler; (void)aPath;
    return InitResult::Error;
}

bool LIBGIT_BACKEND::SetupRemote( GIT_INIT_HANDLER* aHandler, const RemoteConfig& aConfig )
{
    (void)aHandler; (void)aConfig;
    return false;
}

BranchResult LIBGIT_BACKEND::SwitchToBranch( GIT_BRANCH_HANDLER* aHandler, const wxString& aBranchName )
{
    (void)aHandler; (void)aBranchName;
    return BranchResult::Error;
}

bool LIBGIT_BACKEND::BranchExists( GIT_BRANCH_HANDLER* aHandler, const wxString& aBranchName )
{
    (void)aHandler; (void)aBranchName;
    return false;
}

bool LIBGIT_BACKEND::PerformFetch( GIT_PULL_HANDLER* aHandler, bool aSkipLock )
{
    (void)aHandler; (void)aSkipLock;
    return false;
}

PullResult LIBGIT_BACKEND::PerformPull( GIT_PULL_HANDLER* aHandler )
{
    (void)aHandler;
    return PullResult::Error;
}

void LIBGIT_BACKEND::PerformRevert( GIT_REVERT_HANDLER* aHandler )
{
    (void)aHandler;
}

git_repository* LIBGIT_BACKEND::GetRepositoryForFile( const char* aFilename )
{
    (void)aFilename;
    return nullptr;
}

int LIBGIT_BACKEND::CreateBranch( git_repository* aRepo, const wxString& aBranchName )
{
    (void)aRepo; (void)aBranchName;
    return -1;
}

bool LIBGIT_BACKEND::RemoveVCS( git_repository*& aRepo, const wxString& aProjectPath,
                                 bool aRemoveGitDir, wxString* aErrors )
{
    (void)aRepo; (void)aProjectPath; (void)aRemoveGitDir; (void)aErrors;
    return false;
}

bool LIBGIT_BACKEND::AddToIndex( GIT_ADD_TO_INDEX_HANDLER* aHandler, const wxString& aFilePath )
{
    (void)aHandler; (void)aFilePath;
    return false;
}

bool LIBGIT_BACKEND::PerformAddToIndex( GIT_ADD_TO_INDEX_HANDLER* aHandler )
{
    (void)aHandler;
    return false;
}

bool LIBGIT_BACKEND::RemoveFromIndex( GIT_REMOVE_FROM_INDEX_HANDLER* aHandler, const wxString& aFilePath )
{
    (void)aHandler; (void)aFilePath;
    return false;
}

void LIBGIT_BACKEND::PerformRemoveFromIndex( GIT_REMOVE_FROM_INDEX_HANDLER* aHandler )
{
    (void)aHandler;
}

// Private methods
PullResult LIBGIT_BACKEND::handleFastForward( GIT_PULL_HANDLER* aHandler )
{
    (void)aHandler;
    return PullResult::Error;
}

PullResult LIBGIT_BACKEND::handleMerge( GIT_PULL_HANDLER* aHandler,
                                         const git_annotated_commit** aMergeHeads,
                                         size_t aMergeHeadsCount )
{
    (void)aHandler; (void)aMergeHeads; (void)aMergeHeadsCount;
    return PullResult::Error;
}

PullResult LIBGIT_BACKEND::handleRebase( GIT_PULL_HANDLER* aHandler,
                                          const git_annotated_commit** aMergeHeads,
                                          size_t aMergeHeadsCount )
{
    (void)aHandler; (void)aMergeHeads; (void)aMergeHeadsCount;
    return PullResult::Error;
}

// Global backend pointer
static GIT_BACKEND* s_gitBackend = nullptr;

GIT_BACKEND* GetGitBackend()
{
    return s_gitBackend;
}

void SetGitBackend( GIT_BACKEND* aBackend )
{
    s_gitBackend = aBackend;
}

// =============================================================================
// LOCAL_HISTORY_PANE stub - for kicad main app
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
// Git dialog stubs
// =============================================================================

#include <dialogs/git/dialog_git_commit.h>
#include <dialogs/git/dialog_git_switch.h>
#include <dialogs/git/dialog_git_repository.h>

DIALOG_GIT_COMMIT::DIALOG_GIT_COMMIT( wxWindow* parent, git_repository* repo,
                                       const wxString& defaultAuthorName,
                                       const wxString& defaultAuthorEmail,
                                       const std::map<wxString, int>& filesToCommit )
    : DIALOG_SHIM( parent, wxID_ANY, wxT("Git Commit (disabled)") ),
      m_commitMessageTextCtrl( nullptr ),
      m_authorTextCtrl( nullptr ),
      m_listCtrl( nullptr ),
      m_okButton( nullptr ),
      m_repo( repo ),
      m_defaultAuthorName( defaultAuthorName ),
      m_defaultAuthorEmail( defaultAuthorEmail )
{
    (void)filesToCommit;
}

wxString DIALOG_GIT_COMMIT::GetCommitMessage() const { return wxEmptyString; }
wxString DIALOG_GIT_COMMIT::GetAuthorName() const { return wxEmptyString; }
wxString DIALOG_GIT_COMMIT::GetAuthorEmail() const { return wxEmptyString; }
std::vector<wxString> DIALOG_GIT_COMMIT::GetSelectedFiles() const { return {}; }
void DIALOG_GIT_COMMIT::OnTextChanged( wxCommandEvent& event ) { (void)event; }

DIALOG_GIT_SWITCH::DIALOG_GIT_SWITCH( wxWindow* aParent, git_repository* aRepository )
    : DIALOG_SHIM( aParent, wxID_ANY, wxT("Git Switch Branch (disabled)") ),
      m_branchList( nullptr ),
      m_branchNameText( nullptr ),
      m_switchButton( nullptr ),
      m_repository( aRepository ),
      m_existingBranch( false )
{
}

DIALOG_GIT_SWITCH::~DIALOG_GIT_SWITCH() {}

wxString DIALOG_GIT_SWITCH::GetBranchName() const { return wxEmptyString; }
void DIALOG_GIT_SWITCH::PopulateBranchList() {}
void DIALOG_GIT_SWITCH::OnBranchListSelection( wxListEvent& event ) { (void)event; }
void DIALOG_GIT_SWITCH::OnBranchListDClick( wxListEvent& event ) { (void)event; }
void DIALOG_GIT_SWITCH::OnSwitchButton( wxCommandEvent& event ) { (void)event; }
void DIALOG_GIT_SWITCH::OnCancelButton( wxCommandEvent& event ) { (void)event; }
void DIALOG_GIT_SWITCH::OnTextChanged( wxCommandEvent& event ) { (void)event; }
void DIALOG_GIT_SWITCH::OnTimer( wxTimerEvent& event ) { (void)event; }
void DIALOG_GIT_SWITCH::GetBranches() {}
void DIALOG_GIT_SWITCH::StartTimer() {}
void DIALOG_GIT_SWITCH::StopTimer() {}

// DIALOG_GIT_REPOSITORY inherits from DIALOG_GIT_REPOSITORY_BASE
// We need the base class first
#include <dialogs/git/dialog_git_repository_base.h>

// Base class constructor stub
DIALOG_GIT_REPOSITORY_BASE::DIALOG_GIT_REPOSITORY_BASE( wxWindow* parent, wxWindowID id,
                                                          const wxString& title,
                                                          const wxPoint& pos,
                                                          const wxSize& size,
                                                          long style )
    : DIALOG_SHIM( parent, id, title, pos, size, style )
{
    m_ConnType = nullptr;
    m_txtName = nullptr;
    m_txtURL = nullptr;
    m_txtUsername = nullptr;
    m_txtPassword = nullptr;
    m_fpSSHKey = nullptr;
    m_sdbSizerCancel = nullptr;
}

DIALOG_GIT_REPOSITORY_BASE::~DIALOG_GIT_REPOSITORY_BASE() {}

// Now the derived class
DIALOG_GIT_REPOSITORY::DIALOG_GIT_REPOSITORY( wxWindow* aParent, git_repository* aRepository,
                                               wxString aURL )
    : DIALOG_GIT_REPOSITORY_BASE( aParent ),
      m_repository( aRepository ),
      m_fullURL( aURL ),
      m_tempRepo( false )
{
}

DIALOG_GIT_REPOSITORY::~DIALOG_GIT_REPOSITORY() {}

void DIALOG_GIT_REPOSITORY::SetEncrypted( bool aEncrypted ) { (void)aEncrypted; }
void DIALOG_GIT_REPOSITORY::OnUpdateUI( wxUpdateUIEvent& event ) { (void)event; }
void DIALOG_GIT_REPOSITORY::OnLocationExit( wxFocusEvent& event ) { (void)event; }
void DIALOG_GIT_REPOSITORY::OnOKClick( wxCommandEvent& event ) { (void)event; }
void DIALOG_GIT_REPOSITORY::OnSelectConnType( wxCommandEvent& event ) { (void)event; }
void DIALOG_GIT_REPOSITORY::OnTestClick( wxCommandEvent& event ) { (void)event; }
void DIALOG_GIT_REPOSITORY::OnFileUpdated( wxFileDirPickerEvent& event ) { (void)event; }
void DIALOG_GIT_REPOSITORY::onCbCustom( wxCommandEvent& event ) { (void)event; }
void DIALOG_GIT_REPOSITORY::setDefaultSSHKey() {}
void DIALOG_GIT_REPOSITORY::updateAuthControls() {}
void DIALOG_GIT_REPOSITORY::updateURLData() {}
bool DIALOG_GIT_REPOSITORY::extractClipboardData() { return false; }

std::tuple<bool,wxString,wxString,wxString> DIALOG_GIT_REPOSITORY::isValidHTTPS( const wxString& url )
{
    (void)url;
    return std::make_tuple( false, wxEmptyString, wxEmptyString, wxEmptyString );
}

std::tuple<bool,wxString,wxString> DIALOG_GIT_REPOSITORY::isValidSSH( const wxString& url )
{
    (void)url;
    return std::make_tuple( false, wxEmptyString, wxEmptyString );
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
