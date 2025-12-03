// wxCalendarCtrl Test - Date selection
// Tests wxCalendarCtrl for date picking functionality

#include "wx/wx.h"
#include "wx/calctrl.h"
#include "wx/datectrl.h"
#include "wx/dateevt.h"

class CalendarFrame : public wxFrame
{
public:
    CalendarFrame() : wxFrame(nullptr, wxID_ANY, "wxCalendarCtrl Test",
                               wxDefaultPosition, wxSize(700, 550))
    {
        wxPanel* mainPanel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        // Description
        wxStaticText* desc = new wxStaticText(mainPanel, wxID_ANY,
            "KiCad may use wxCalendarCtrl for date-related features.\n"
            "This tests calendar widget rendering and date selection.");
        mainSizer->Add(desc, 0, wxALL, 5);

        // Horizontal layout for calendar and controls
        wxBoxSizer* hSizer = new wxBoxSizer(wxHORIZONTAL);

        // Calendar control
        wxStaticBoxSizer* calBox = new wxStaticBoxSizer(wxVERTICAL, mainPanel, "Calendar");
        m_calendar = new wxCalendarCtrl(mainPanel, wxID_ANY, wxDefaultDateTime,
                                         wxDefaultPosition, wxDefaultSize,
                                         wxCAL_SHOW_HOLIDAYS | wxCAL_SHOW_SURROUNDING_WEEKS);
        calBox->Add(m_calendar, 1, wxEXPAND | wxALL, 5);
        hSizer->Add(calBox, 1, wxEXPAND | wxRIGHT, 10);

        // Controls panel
        wxBoxSizer* controlSizer = new wxBoxSizer(wxVERTICAL);

        // Date picker
        wxStaticBoxSizer* pickerBox = new wxStaticBoxSizer(wxVERTICAL, mainPanel, "Date Picker");
        m_datePicker = new wxDatePickerCtrl(mainPanel, wxID_ANY);
        pickerBox->Add(m_datePicker, 0, wxEXPAND | wxALL, 5);
        controlSizer->Add(pickerBox, 0, wxEXPAND | wxBOTTOM, 10);

        // Navigation buttons
        wxStaticBoxSizer* navBox = new wxStaticBoxSizer(wxVERTICAL, mainPanel, "Navigation");

        wxButton* btnToday = new wxButton(mainPanel, wxID_ANY, "Today");
        wxButton* btnPrevMonth = new wxButton(mainPanel, wxID_ANY, "Previous Month");
        wxButton* btnNextMonth = new wxButton(mainPanel, wxID_ANY, "Next Month");
        wxButton* btnPrevYear = new wxButton(mainPanel, wxID_ANY, "Previous Year");
        wxButton* btnNextYear = new wxButton(mainPanel, wxID_ANY, "Next Year");

        btnToday->Bind(wxEVT_BUTTON, &CalendarFrame::OnToday, this);
        btnPrevMonth->Bind(wxEVT_BUTTON, &CalendarFrame::OnPrevMonth, this);
        btnNextMonth->Bind(wxEVT_BUTTON, &CalendarFrame::OnNextMonth, this);
        btnPrevYear->Bind(wxEVT_BUTTON, &CalendarFrame::OnPrevYear, this);
        btnNextYear->Bind(wxEVT_BUTTON, &CalendarFrame::OnNextYear, this);

        navBox->Add(btnToday, 0, wxEXPAND | wxALL, 2);
        navBox->Add(btnPrevMonth, 0, wxEXPAND | wxALL, 2);
        navBox->Add(btnNextMonth, 0, wxEXPAND | wxALL, 2);
        navBox->Add(btnPrevYear, 0, wxEXPAND | wxALL, 2);
        navBox->Add(btnNextYear, 0, wxEXPAND | wxALL, 2);

        controlSizer->Add(navBox, 0, wxEXPAND | wxBOTTOM, 10);

        // Selected date display
        wxStaticBoxSizer* selBox = new wxStaticBoxSizer(wxVERTICAL, mainPanel, "Selected Date");
        m_selectedLabel = new wxStaticText(mainPanel, wxID_ANY, "No date selected");
        selBox->Add(m_selectedLabel, 0, wxALL, 5);
        controlSizer->Add(selBox, 0, wxEXPAND);

        hSizer->Add(controlSizer, 0, wxEXPAND);
        mainSizer->Add(hSizer, 0, wxEXPAND | wxALL, 5);

        // Event log
        mainSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Event Log"), 0, wxLEFT | wxTOP, 5);
        m_log = new wxTextCtrl(mainPanel, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 120),
                               wxTE_MULTILINE | wxTE_READONLY);
        mainSizer->Add(m_log, 1, wxEXPAND | wxALL, 5);

        mainPanel->SetSizer(mainSizer);

        // Bind calendar events
        m_calendar->Bind(wxEVT_CALENDAR_SEL_CHANGED, &CalendarFrame::OnDateChanged, this);
        m_calendar->Bind(wxEVT_CALENDAR_DAY_CHANGED, &CalendarFrame::OnDayChanged, this);
        m_calendar->Bind(wxEVT_CALENDAR_MONTH_CHANGED, &CalendarFrame::OnMonthChanged, this);
        m_calendar->Bind(wxEVT_CALENDAR_YEAR_CHANGED, &CalendarFrame::OnYearChanged, this);
        m_calendar->Bind(wxEVT_CALENDAR_DOUBLECLICKED, &CalendarFrame::OnDoubleClicked, this);

        m_datePicker->Bind(wxEVT_DATE_CHANGED, &CalendarFrame::OnPickerChanged, this);

        // Status bar
        CreateStatusBar();
        SetStatusText("Calendar test app started");

        Log("Calendar test app started");
        UpdateSelectedLabel();
    }

private:
    void Log(const wxString& msg)
    {
        m_log->AppendText(msg + "\n");
    }

    void UpdateSelectedLabel()
    {
        wxDateTime date = m_calendar->GetDate();
        m_selectedLabel->SetLabel(date.FormatDate());
    }

    void OnDateChanged(wxCalendarEvent& event)
    {
        wxDateTime date = event.GetDate();
        Log(wxString::Format("Date selected: %s", date.FormatDate()));
        UpdateSelectedLabel();
        m_datePicker->SetValue(date);
    }

    void OnDayChanged(wxCalendarEvent& event)
    {
        Log(wxString::Format("Day changed: %d", event.GetDate().GetDay()));
    }

    void OnMonthChanged(wxCalendarEvent& event)
    {
        wxDateTime date = event.GetDate();
        Log(wxString::Format("Month changed: %s %d",
            wxDateTime::GetMonthName(date.GetMonth()), date.GetYear()));
    }

    void OnYearChanged(wxCalendarEvent& event)
    {
        Log(wxString::Format("Year changed: %d", event.GetDate().GetYear()));
    }

    void OnDoubleClicked(wxCalendarEvent& event)
    {
        wxDateTime date = event.GetDate();
        Log(wxString::Format("Double-clicked: %s", date.FormatDate()));
    }

    void OnPickerChanged(wxDateEvent& event)
    {
        wxDateTime date = event.GetDate();
        m_calendar->SetDate(date);
        Log(wxString::Format("Date picker changed: %s", date.FormatDate()));
        UpdateSelectedLabel();
    }

    void OnToday(wxCommandEvent& event)
    {
        m_calendar->SetDate(wxDateTime::Today());
        m_datePicker->SetValue(wxDateTime::Today());
        Log("Navigated to today");
        UpdateSelectedLabel();
    }

    void OnPrevMonth(wxCommandEvent& event)
    {
        wxDateTime date = m_calendar->GetDate();
        date -= wxDateSpan::Month();
        m_calendar->SetDate(date);
        Log(wxString::Format("Previous month: %s", date.FormatDate()));
        UpdateSelectedLabel();
    }

    void OnNextMonth(wxCommandEvent& event)
    {
        wxDateTime date = m_calendar->GetDate();
        date += wxDateSpan::Month();
        m_calendar->SetDate(date);
        Log(wxString::Format("Next month: %s", date.FormatDate()));
        UpdateSelectedLabel();
    }

    void OnPrevYear(wxCommandEvent& event)
    {
        wxDateTime date = m_calendar->GetDate();
        date -= wxDateSpan::Year();
        m_calendar->SetDate(date);
        Log(wxString::Format("Previous year: %d", date.GetYear()));
        UpdateSelectedLabel();
    }

    void OnNextYear(wxCommandEvent& event)
    {
        wxDateTime date = m_calendar->GetDate();
        date += wxDateSpan::Year();
        m_calendar->SetDate(date);
        Log(wxString::Format("Next year: %d", date.GetYear()));
        UpdateSelectedLabel();
    }

    wxCalendarCtrl* m_calendar;
    wxDatePickerCtrl* m_datePicker;
    wxStaticText* m_selectedLabel;
    wxTextCtrl* m_log;
};

class CalendarApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        CalendarFrame* frame = new CalendarFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(CalendarApp);
