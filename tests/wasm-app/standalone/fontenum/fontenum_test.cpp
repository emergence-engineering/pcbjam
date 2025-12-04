// wxFontEnumerator Test - Tests Local Font Access API integration
// Tests: wxFontEnumerator::EnumerateFacenames(), font listing, sample rendering

#include "wx/wx.h"
#include "wx/fontenum.h"
#include "wx/listbox.h"

// Custom font enumerator that collects font names
class FontCollector : public wxFontEnumerator
{
public:
    wxArrayString& GetFonts() { return m_fonts; }

protected:
    virtual bool OnFacename(const wxString& facename) override
    {
        m_fonts.Add(facename);
        return true;  // Continue enumeration
    }

private:
    wxArrayString m_fonts;
};

class FontEnumFrame : public wxFrame
{
public:
    FontEnumFrame() : wxFrame(nullptr, wxID_ANY, "wxFontEnumerator Test",
                               wxDefaultPosition, wxSize(800, 600))
    {
        wxPanel* mainPanel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxHORIZONTAL);

        // Left panel - font list
        wxBoxSizer* leftSizer = new wxBoxSizer(wxVERTICAL);

        wxStaticText* listLabel = new wxStaticText(mainPanel, wxID_ANY,
            "System Fonts (via Local Font Access API):");
        leftSizer->Add(listLabel, 0, wxALL, 5);

        m_fontList = new wxListBox(mainPanel, wxID_ANY, wxDefaultPosition,
                                    wxSize(300, -1));
        m_fontList->Bind(wxEVT_LISTBOX, &FontEnumFrame::OnFontSelected, this);
        leftSizer->Add(m_fontList, 1, wxEXPAND | wxALL, 5);

        m_enumButton = new wxButton(mainPanel, wxID_ANY, "Enumerate Fonts");
        m_enumButton->Bind(wxEVT_BUTTON, &FontEnumFrame::OnEnumerateFonts, this);
        leftSizer->Add(m_enumButton, 0, wxALL, 5);

        m_statusText = new wxStaticText(mainPanel, wxID_ANY, "Click 'Enumerate Fonts' to start");
        leftSizer->Add(m_statusText, 0, wxALL, 5);

        mainSizer->Add(leftSizer, 0, wxEXPAND | wxALL, 5);

        // Right panel - font preview
        wxBoxSizer* rightSizer = new wxBoxSizer(wxVERTICAL);

        wxStaticText* previewLabel = new wxStaticText(mainPanel, wxID_ANY, "Font Preview:");
        rightSizer->Add(previewLabel, 0, wxALL, 5);

        m_previewPanel = new wxPanel(mainPanel, wxID_ANY, wxDefaultPosition,
                                      wxSize(-1, 200));
        m_previewPanel->SetBackgroundColour(*wxWHITE);
        m_previewPanel->Bind(wxEVT_PAINT, &FontEnumFrame::OnPaintPreview, this);
        rightSizer->Add(m_previewPanel, 0, wxEXPAND | wxALL, 5);

        // Sample text sizes
        wxStaticText* sizesLabel = new wxStaticText(mainPanel, wxID_ANY, "Sample Text at Different Sizes:");
        rightSizer->Add(sizesLabel, 0, wxALL, 5);

        m_samplesPanel = new wxPanel(mainPanel, wxID_ANY, wxDefaultPosition,
                                      wxSize(-1, 250));
        m_samplesPanel->SetBackgroundColour(*wxWHITE);
        m_samplesPanel->Bind(wxEVT_PAINT, &FontEnumFrame::OnPaintSamples, this);
        rightSizer->Add(m_samplesPanel, 1, wxEXPAND | wxALL, 5);

        mainSizer->Add(rightSizer, 1, wxEXPAND | wxALL, 5);

        mainPanel->SetSizer(mainSizer);

        // Event log
        m_log = new wxTextCtrl(this, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 100),
                               wxTE_MULTILINE | wxTE_READONLY);

        wxBoxSizer* frameSizer = new wxBoxSizer(wxVERTICAL);
        frameSizer->Add(mainPanel, 1, wxEXPAND);
        frameSizer->Add(m_log, 0, wxEXPAND | wxALL, 5);
        SetSizer(frameSizer);

        CreateStatusBar();
        SetStatusText("Font Enumeration Test - Uses Local Font Access API");
        Log("Font enumeration test app started");
        Log("Note: Requires Chrome/Edge 103+ and user permission");

        // Auto-enumerate fonts on startup for testing
        CallAfter([this]() {
            wxCommandEvent evt;
            OnEnumerateFonts(evt);
        });
    }

private:
    void OnEnumerateFonts(wxCommandEvent& event)
    {
        m_fontList->Clear();
        m_selectedFont.Clear();
        m_previewPanel->Refresh();
        m_samplesPanel->Refresh();

        Log("Starting font enumeration...");
        m_statusText->SetLabel("Enumerating fonts...");

        FontCollector collector;
        bool success = collector.EnumerateFacenames();

        if (success)
        {
            wxArrayString& fonts = collector.GetFonts();
            int count = fonts.GetCount();

            Log(wxString::Format("Found %d font families", count));
            m_statusText->SetLabel(wxString::Format("Found %d fonts", count));

            for (size_t i = 0; i < fonts.GetCount(); i++)
            {
                m_fontList->Append(fonts[i]);
            }

            if (count > 0)
            {
                m_fontList->SetSelection(0);
                m_selectedFont = fonts[0];
                m_previewPanel->Refresh();
                m_samplesPanel->Refresh();
            }
        }
        else
        {
            Log("Font enumeration failed or permission denied");
            m_statusText->SetLabel("Enumeration failed - check console");

            // Add a note about the API requirement
            m_fontList->Append("(Font enumeration unavailable)");
            m_fontList->Append("Requires:");
            m_fontList->Append("- Chrome/Edge 103+");
            m_fontList->Append("- User permission");
        }
    }

    void OnFontSelected(wxCommandEvent& event)
    {
        int sel = m_fontList->GetSelection();
        if (sel != wxNOT_FOUND)
        {
            m_selectedFont = m_fontList->GetString(sel);
            Log(wxString::Format("Selected font: %s", m_selectedFont));
            m_previewPanel->Refresh();
            m_samplesPanel->Refresh();
        }
    }

    void OnPaintPreview(wxPaintEvent& event)
    {
        wxPaintDC dc(m_previewPanel);
        dc.SetBackground(*wxWHITE_BRUSH);
        dc.Clear();

        if (m_selectedFont.IsEmpty())
        {
            dc.SetFont(wxFont(12, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_ITALIC, wxFONTWEIGHT_NORMAL));
            dc.SetTextForeground(wxColour(128, 128, 128));
            dc.DrawText("Select a font to preview", 10, 10);
            return;
        }

        // Draw font name and sample text
        wxFont font(24, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL,
                    false, m_selectedFont);
        dc.SetFont(font);
        dc.SetTextForeground(*wxBLACK);

        int y = 10;
        dc.DrawText(m_selectedFont, 10, y);
        y += 40;

        dc.DrawText("The quick brown fox jumps over the lazy dog", 10, y);
        y += 40;

        dc.DrawText("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 10, y);
        y += 40;

        dc.DrawText("abcdefghijklmnopqrstuvwxyz", 10, y);
        y += 40;

        dc.DrawText("0123456789 !@#$%^&*()", 10, y);
    }

    void OnPaintSamples(wxPaintEvent& event)
    {
        wxPaintDC dc(m_samplesPanel);
        dc.SetBackground(*wxWHITE_BRUSH);
        dc.Clear();

        if (m_selectedFont.IsEmpty())
        {
            return;
        }

        int sizes[] = {8, 10, 12, 14, 16, 18, 24, 32};
        int y = 10;

        for (int size : sizes)
        {
            wxFont font(size, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL,
                        false, m_selectedFont);
            dc.SetFont(font);
            dc.SetTextForeground(*wxBLACK);

            wxString sample = wxString::Format("%dpt: Sample Text AaBbCc 123", size);
            dc.DrawText(sample, 10, y);
            y += size + 8;
        }
    }

    void Log(const wxString& msg)
    {
        m_log->AppendText(msg + "\n");
    }

    wxListBox* m_fontList;
    wxButton* m_enumButton;
    wxStaticText* m_statusText;
    wxPanel* m_previewPanel;
    wxPanel* m_samplesPanel;
    wxTextCtrl* m_log;
    wxString m_selectedFont;
};

class FontEnumApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        FontEnumFrame* frame = new FontEnumFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(FontEnumApp);
