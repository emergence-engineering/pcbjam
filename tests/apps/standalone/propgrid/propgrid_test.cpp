// wxPropertyGrid Test - Tests property grid in WASM
// KiCad uses property grids for property panels in ALL editors

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/notebook.h"
#include "wx/propgrid/propgrid.h"
#include "wx/propgrid/manager.h"
#include "wx/propgrid/advprops.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class PropGridTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class PropGridTestFrame : public wxFrame
{
public:
    PropGridTestFrame();

private:
    wxPropertyGrid* m_propGrid;
    wxPropertyGridManager* m_propGridManager;
    wxTextCtrl* m_log;
    wxNotebook* m_notebook;

    void LogEvent(const wxString& msg);
    void PopulateBasicGrid();
    void PopulateManagerGrid();

    void OnPropertyChanged(wxPropertyGridEvent& evt);
    void OnPropertyChanging(wxPropertyGridEvent& evt);
    void OnPropertySelected(wxPropertyGridEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

enum {
    ID_PROPGRID = wxID_HIGHEST + 1,
    ID_PROPGRID_MANAGER,
    ID_NOTEBOOK
};

wxBEGIN_EVENT_TABLE(PropGridTestFrame, wxFrame)
    EVT_PG_CHANGED(ID_PROPGRID, PropGridTestFrame::OnPropertyChanged)
    EVT_PG_CHANGING(ID_PROPGRID, PropGridTestFrame::OnPropertyChanging)
    EVT_PG_SELECTED(ID_PROPGRID, PropGridTestFrame::OnPropertySelected)
    EVT_PG_CHANGED(ID_PROPGRID_MANAGER, PropGridTestFrame::OnPropertyChanged)
    EVT_PG_SELECTED(ID_PROPGRID_MANAGER, PropGridTestFrame::OnPropertySelected)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(PropGridTestApp);

bool PropGridTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    PropGridTestFrame* frame = new PropGridTestFrame();
    frame->Show(true);
    return true;
}

PropGridTestFrame::PropGridTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxPropertyGrid WASM Test",
              wxDefaultPosition, wxSize(800, 700))
{
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "wxPropertyGrid Test\n\n"
        "KiCad uses wxPropertyGrid for property panels in ALL editors.\n"
        "This tests property grid rendering and editing.");
    mainSizer->Add(desc, 0, wxALL, 10);

    // Notebook with two tabs
    m_notebook = new wxNotebook(this, ID_NOTEBOOK);

    // Tab 1: Basic PropertyGrid
    wxPanel* basicPanel = new wxPanel(m_notebook);
    wxBoxSizer* basicSizer = new wxBoxSizer(wxVERTICAL);

    m_propGrid = new wxPropertyGrid(basicPanel, ID_PROPGRID,
        wxDefaultPosition, wxSize(-1, 300),
        wxPG_SPLITTER_AUTO_CENTER | wxPG_DEFAULT_STYLE);
    basicSizer->Add(m_propGrid, 1, wxEXPAND | wxALL, 5);

    basicPanel->SetSizer(basicSizer);
    m_notebook->AddPage(basicPanel, "Basic PropertyGrid");

    // Tab 2: PropertyGridManager (multi-page)
    wxPanel* managerPanel = new wxPanel(m_notebook);
    wxBoxSizer* managerSizer = new wxBoxSizer(wxVERTICAL);

    m_propGridManager = new wxPropertyGridManager(managerPanel, ID_PROPGRID_MANAGER,
        wxDefaultPosition, wxSize(-1, 300),
        wxPG_SPLITTER_AUTO_CENTER | wxPGMAN_DEFAULT_STYLE);
    managerSizer->Add(m_propGridManager, 1, wxEXPAND | wxALL, 5);

    managerPanel->SetSizer(managerSizer);
    m_notebook->AddPage(managerPanel, "PropertyGridManager");

    mainSizer->Add(m_notebook, 1, wxEXPAND | wxALL, 10);

    // Event log
    wxStaticBoxSizer* logBox = new wxStaticBoxSizer(wxVERTICAL, this, "Event Log");
    m_log = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxSize(-1, 120), wxTE_MULTILINE | wxTE_READONLY);
    logBox->Add(m_log, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(logBox, 0, wxEXPAND | wxALL, 10);

    SetSizer(mainSizer);

    // Populate grids after layout is set
    PopulateBasicGrid();
    PopulateManagerGrid();

    CreateStatusBar();
    SetStatusText("Ready - wxPropertyGrid test");

    LogEvent("PropertyGrid test app started");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[PROPGRID_TEST] wxPropertyGrid test app started successfully');
    });
#endif
}

void PropGridTestFrame::PopulateBasicGrid()
{
    // KiCad-like properties for a component
    m_propGrid->Append(new wxPropertyCategory("General"));
    m_propGrid->Append(new wxStringProperty("Reference", wxPG_LABEL, "R1"));
    m_propGrid->Append(new wxStringProperty("Value", wxPG_LABEL, "10k"));
    m_propGrid->Append(new wxStringProperty("Footprint", wxPG_LABEL, "Resistor_SMD:R_0402"));

    m_propGrid->Append(new wxPropertyCategory("Position"));
    m_propGrid->Append(new wxFloatProperty("X", wxPG_LABEL, 100.5));
    m_propGrid->Append(new wxFloatProperty("Y", wxPG_LABEL, 50.25));
    m_propGrid->Append(new wxIntProperty("Rotation", wxPG_LABEL, 90));

    m_propGrid->Append(new wxPropertyCategory("Display"));
    m_propGrid->Append(new wxBoolProperty("Show Reference", wxPG_LABEL, true));
    m_propGrid->Append(new wxBoolProperty("Show Value", wxPG_LABEL, true));

    // Color property (KiCad layer colors)
    m_propGrid->Append(new wxPropertyCategory("Colors"));
    m_propGrid->Append(new wxColourProperty("Front Copper", wxPG_LABEL, wxColour(255, 0, 0)));
    m_propGrid->Append(new wxColourProperty("Back Copper", wxPG_LABEL, wxColour(0, 0, 255)));

    // Enum property (like KiCad layer selection)
    wxPGChoices layerChoices;
    layerChoices.Add("F.Cu", 0);
    layerChoices.Add("B.Cu", 1);
    layerChoices.Add("F.SilkS", 2);
    layerChoices.Add("B.SilkS", 3);
    layerChoices.Add("Edge.Cuts", 4);
    m_propGrid->Append(new wxEnumProperty("Layer", wxPG_LABEL, layerChoices, 0));

    LogEvent("Basic PropertyGrid populated with KiCad-like properties");
}

void PropGridTestFrame::PopulateManagerGrid()
{
    // Page 1: Component properties
    wxPropertyGridPage* page1 = m_propGridManager->AddPage("Component");
    page1->Append(new wxPropertyCategory("Identity"));
    page1->Append(new wxStringProperty("Reference", wxPG_LABEL, "U1"));
    page1->Append(new wxStringProperty("Value", wxPG_LABEL, "STM32F103"));
    page1->Append(new wxStringProperty("Library", wxPG_LABEL, "MCU_ST_STM32F1"));

    page1->Append(new wxPropertyCategory("Attributes"));
    page1->Append(new wxBoolProperty("Exclude from BOM", wxPG_LABEL, false));
    page1->Append(new wxBoolProperty("Exclude from Board", wxPG_LABEL, false));

    // Page 2: Footprint properties
    wxPropertyGridPage* page2 = m_propGridManager->AddPage("Footprint");
    page2->Append(new wxPropertyCategory("Footprint"));
    page2->Append(new wxStringProperty("Name", wxPG_LABEL, "LQFP-48_7x7mm_P0.5mm"));
    page2->Append(new wxIntProperty("Pads", wxPG_LABEL, 48));

    page2->Append(new wxPropertyCategory("3D Model"));
    page2->Append(new wxStringProperty("3D Model Path", wxPG_LABEL, "${KISYS3DMOD}/Package_QFP.3dshapes/LQFP-48_7x7mm_P0.5mm.wrl"));
    page2->Append(new wxFloatProperty("Scale X", wxPG_LABEL, 1.0));
    page2->Append(new wxFloatProperty("Scale Y", wxPG_LABEL, 1.0));
    page2->Append(new wxFloatProperty("Scale Z", wxPG_LABEL, 1.0));

    // Page 3: Net properties
    wxPropertyGridPage* page3 = m_propGridManager->AddPage("Net");
    page3->Append(new wxPropertyCategory("Net Info"));
    page3->Append(new wxStringProperty("Net Name", wxPG_LABEL, "VCC"));
    page3->Append(new wxIntProperty("Net Code", wxPG_LABEL, 42));
    page3->Append(new wxIntProperty("Connected Pads", wxPG_LABEL, 12));

    LogEvent("PropertyGridManager populated with 3 pages");
}

void PropGridTestFrame::LogEvent(const wxString& msg)
{
#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[PROPGRID_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif

    if (!m_log)
        return;
    m_log->AppendText(msg + "\n");
    SetStatusText(msg);
}

void PropGridTestFrame::OnPropertyChanged(wxPropertyGridEvent& evt)
{
    wxPGProperty* prop = evt.GetProperty();
    if (prop) {
        LogEvent(wxString::Format("Property changed: '%s' = '%s'",
            prop->GetName(), prop->GetValueAsString()));
    }
}

void PropGridTestFrame::OnPropertyChanging(wxPropertyGridEvent& evt)
{
    wxPGProperty* prop = evt.GetProperty();
    if (prop) {
        LogEvent(wxString::Format("Property changing: '%s' -> '%s'",
            prop->GetName(), evt.GetValue().GetString()));
    }
}

void PropGridTestFrame::OnPropertySelected(wxPropertyGridEvent& evt)
{
    wxPGProperty* prop = evt.GetProperty();
    if (prop) {
        LogEvent(wxString::Format("Property selected: '%s'", prop->GetName()));
    }
}
