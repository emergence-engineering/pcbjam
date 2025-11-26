/*
 * KiCad Wasm Port - Stub implementation for PANEL_GIT_REPOS
 *
 * Provides empty/stub implementation for PANEL_GIT_REPOS when KICAD_USE_GIT=OFF.
 * This file is added to the common library sources.
 */

#include <wx/stattext.h>
#include <wx/sizer.h>
#include <dialogs/git/panel_git_repos.h>

PANEL_GIT_REPOS::PANEL_GIT_REPOS( wxWindow* aParent )
    : PANEL_GIT_REPOS_BASE( aParent )
{
    // Hide all the git-related controls since git is disabled
    m_gitSizer->Show( false );

    // Add a message saying git is disabled
    wxBoxSizer* msgSizer = new wxBoxSizer( wxVERTICAL );
    wxStaticText* text = new wxStaticText( this, wxID_ANY,
        wxT("Git support is disabled in this build.") );
    msgSizer->Add( text, 0, wxALL | wxALIGN_CENTER_HORIZONTAL, 20 );
    GetSizer()->Add( msgSizer, 1, wxEXPAND | wxALL, 5 );
}

PANEL_GIT_REPOS::~PANEL_GIT_REPOS() {}

void PANEL_GIT_REPOS::ResetPanel() {}

bool PANEL_GIT_REPOS::TransferDataFromWindow() { return true; }

bool PANEL_GIT_REPOS::TransferDataToWindow() { return true; }

void PANEL_GIT_REPOS::onDefaultClick( wxCommandEvent& event ) { (void)event; }

void PANEL_GIT_REPOS::onEnableGitClick( wxCommandEvent& event ) { (void)event; }
