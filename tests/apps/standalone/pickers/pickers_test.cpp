// wxColourPickerCtrl/wxFontPickerCtrl Test - Tests picker controls in WASM
// KiCad uses these for color preferences, layer colors, and font selection

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/clrpicker.h"
#include "wx/fontpicker.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class PickersTestApp : public wxApp
{
public:
    virtual bool OnInit() override;
};

class PickersTestFrame : public wxFrame
{
public:
    PickersTestFrame();

private:
    wxColourPickerCtrl* m_colourPicker1;
    wxColourPickerCtrl* m_colourPicker2;
    wxColourPickerCtrl* m_colourPicker3;
    wxFontPickerCtrl* m_fontPicker;
    wxPanel* m_previewPanel;
    wxStaticText* m_fontPreview;
    wxTextCtrl* m_log;

    void LogEvent(const wxString& msg);
    void UpdatePreview();

    void OnColourChanged(wxColourPickerEvent& evt);
    void OnFontChanged(wxFontPickerEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

enum {
    ID_COLOUR_PICKER_1 = wxID_HIGHEST + 1,
    ID_COLOUR_PICKER_2,
    ID_COLOUR_PICKER_3,
    ID_FONT_PICKER
};

wxBEGIN_EVENT_TABLE(PickersTestFrame, wxFrame)
    EVT_COLOURPICKER_CHANGED(ID_COLOUR_PICKER_1, PickersTestFrame::OnColourChanged)
    EVT_COLOURPICKER_CHANGED(ID_COLOUR_PICKER_2, PickersTestFrame::OnColourChanged)
    EVT_COLOURPICKER_CHANGED(ID_COLOUR_PICKER_3, PickersTestFrame::OnColourChanged)
    EVT_FONTPICKER_CHANGED(ID_FONT_PICKER, PickersTestFrame::OnFontChanged)
wxEND_EVENT_TABLE()

wxIMPLEMENT_APP(PickersTestApp);

bool PickersTestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    PickersTestFrame* frame = new PickersTestFrame();
    frame->Show(true);
    return true;
}

PickersTestFrame::PickersTestFrame()
    : wxFrame(nullptr, wxID_ANY, "wxPicker Controls WASM Test",
              wxDefaultPosition, wxSize(700, 600))
{
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    wxStaticText* desc = new wxStaticText(this, wxID_ANY,
        "Picker Controls Test\n\n"
        "KiCad uses wxColourPickerCtrl for layer colors and color preferences.\n"
        "wxFontPickerCtrl is used for text/label font settings.");
    mainSizer->Add(desc, 0, wxALL, 10);

    // Color pickers section (KiCad layer colors)
    wxStaticBoxSizer* colourBox = new wxStaticBoxSizer(wxVERTICAL, this, "Layer Colors (wxColourPickerCtrl)");

    wxFlexGridSizer* colourGrid = new wxFlexGridSizer(3, 3, 10, 20);
    colourGrid->AddGrowableCol(1);

    colourGrid->Add(new wxStaticText(this, wxID_ANY, "Front Copper (F.Cu):"), 0, wxALIGN_CENTER_VERTICAL);
    m_colourPicker1 = new wxColourPickerCtrl(this, ID_COLOUR_PICKER_1, wxColour(255, 0, 0));
    colourGrid->Add(m_colourPicker1, 0, wxEXPAND);
    colourGrid->Add(new wxStaticText(this, wxID_ANY, "#FF0000"), 0, wxALIGN_CENTER_VERTICAL);

    colourGrid->Add(new wxStaticText(this, wxID_ANY, "Back Copper (B.Cu):"), 0, wxALIGN_CENTER_VERTICAL);
    m_colourPicker2 = new wxColourPickerCtrl(this, ID_COLOUR_PICKER_2, wxColour(0, 0, 255));
    colourGrid->Add(m_colourPicker2, 0, wxEXPAND);
    colourGrid->Add(new wxStaticText(this, wxID_ANY, "#0000FF"), 0, wxALIGN_CENTER_VERTICAL);

    colourGrid->Add(new wxStaticText(this, wxID_ANY, "Silkscreen (F.SilkS):"), 0, wxALIGN_CENTER_VERTICAL);
    m_colourPicker3 = new wxColourPickerCtrl(this, ID_COLOUR_PICKER_3, wxColour(255, 255, 255));
    colourGrid->Add(m_colourPicker3, 0, wxEXPAND);
    colourGrid->Add(new wxStaticText(this, wxID_ANY, "#FFFFFF"), 0, wxALIGN_CENTER_VERTICAL);

    colourBox->Add(colourGrid, 0, wxEXPAND | wxALL, 10);
    mainSizer->Add(colourBox, 0, wxEXPAND | wxALL, 10);

    // Color preview panel
    wxStaticBoxSizer* previewBox = new wxStaticBoxSizer(wxVERTICAL, this, "Color Preview");
    m_previewPanel = new wxPanel(this, wxID_ANY, wxDefaultPosition, wxSize(-1, 60));
    m_previewPanel->SetBackgroundColour(wxColour(50, 50, 50));
    previewBox->Add(m_previewPanel, 0, wxEXPAND | wxALL, 10);
    mainSizer->Add(previewBox, 0, wxEXPAND | wxALL, 10);

    // Font picker section
    wxStaticBoxSizer* fontBox = new wxStaticBoxSizer(wxVERTICAL, this, "Text Font (wxFontPickerCtrl)");

    wxBoxSizer* fontRow = new wxBoxSizer(wxHORIZONTAL);
    fontRow->Add(new wxStaticText(this, wxID_ANY, "Schematic Text Font:"), 0, wxALIGN_CENTER_VERTICAL | wxRIGHT, 10);
    m_fontPicker = new wxFontPickerCtrl(this, ID_FONT_PICKER,
        wxFont(12, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL),
        wxDefaultPosition, wxDefaultSize, wxFNTP_DEFAULT_STYLE);
    fontRow->Add(m_fontPicker, 1, wxEXPAND);
    fontBox->Add(fontRow, 0, wxEXPAND | wxALL, 10);

    // Font preview
    m_fontPreview = new wxStaticText(this, wxID_ANY, "Sample Text: KiCad WASM Port - R1 10k VCC GND");
    m_fontPreview->SetFont(wxFont(12, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL));
    fontBox->Add(m_fontPreview, 0, wxALL, 10);

    mainSizer->Add(fontBox, 0, wxEXPAND | wxALL, 10);

    // Event log
    wxStaticBoxSizer* logBox = new wxStaticBoxSizer(wxVERTICAL, this, "Event Log");
    m_log = new wxTextCtrl(this, wxID_ANY, "",
        wxDefaultPosition, wxSize(-1, 100), wxTE_MULTILINE | wxTE_READONLY);
    logBox->Add(m_log, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(logBox, 0, wxEXPAND | wxALL, 10);

    SetSizer(mainSizer);
    CreateStatusBar();
    SetStatusText("Ready - Picker controls test");

    UpdatePreview();
    LogEvent("Picker controls test app started");

#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[PICKERS_TEST] wxPicker controls test app started successfully');
    });
#endif
}

void PickersTestFrame::LogEvent(const wxString& msg)
{
#ifdef __EMSCRIPTEN__
    EM_ASM({
        console.log('[PICKERS_EVENT] ' + UTF8ToString($0));
    }, msg.c_str().AsChar());
#endif

    if (!m_log)
        return;
    m_log->AppendText(msg + "\n");
    SetStatusText(msg);
}

void PickersTestFrame::UpdatePreview()
{
    // Update preview panel with gradient of selected colors
    // For simplicity, just use the first color as background
    if (m_previewPanel && m_colourPicker1) {
        m_previewPanel->SetBackgroundColour(m_colourPicker1->GetColour());
        m_previewPanel->Refresh();
    }
}

void PickersTestFrame::OnColourChanged(wxColourPickerEvent& evt)
{
    wxColour col = evt.GetColour();
    wxString hexColor = wxString::Format("#%02X%02X%02X", col.Red(), col.Green(), col.Blue());

    wxString pickerName;
    switch (evt.GetId()) {
        case ID_COLOUR_PICKER_1: pickerName = "Front Copper"; break;
        case ID_COLOUR_PICKER_2: pickerName = "Back Copper"; break;
        case ID_COLOUR_PICKER_3: pickerName = "Silkscreen"; break;
        default: pickerName = "Unknown"; break;
    }

    LogEvent(wxString::Format("Color changed: %s = %s", pickerName, hexColor));
    UpdatePreview();
}

void PickersTestFrame::OnFontChanged(wxFontPickerEvent& evt)
{
    wxFont font = evt.GetFont();
    m_fontPreview->SetFont(font);
    m_fontPreview->Refresh();

    LogEvent(wxString::Format("Font changed: %s, %dpt, %s",
        font.GetFaceName(),
        font.GetPointSize(),
        font.GetWeight() == wxFONTWEIGHT_BOLD ? "Bold" : "Normal"));
}
