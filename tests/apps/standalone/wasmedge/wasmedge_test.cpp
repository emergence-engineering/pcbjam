// WASM Edge Cases Test - Test WASM-specific behaviors and limitations
// Tests: Threading stubs, file system, memory, asyncify, clipboard permissions

#include "wx/wx.h"
#include "wx/file.h"
#include "wx/filename.h"
#include "wx/dir.h"
#include "wx/clipbrd.h"
#include "wx/thread.h"
#include "wx/utils.h"
#include "wx/fontenum.h"

// Test if threading is stubbed or functional
class TestThread : public wxThread
{
public:
    TestThread(wxTextCtrl* log) : wxThread(wxTHREAD_DETACHED), m_log(log) {}

    virtual void* Entry() override
    {
        // In WASM, this may not actually run in a separate thread
        m_ran = true;
        return nullptr;
    }

    bool DidRun() const { return m_ran; }

private:
    wxTextCtrl* m_log;
    bool m_ran = false;
};

class WasmEdgeFrame : public wxFrame
{
public:
    WasmEdgeFrame() : wxFrame(nullptr, wxID_ANY, "WASM Edge Cases Test",
                               wxDefaultPosition, wxSize(800, 700))
    {
        wxPanel* mainPanel = new wxPanel(this);
        wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

        // Description
        wxStaticText* desc = new wxStaticText(mainPanel, wxID_ANY,
            "Tests WASM-specific behaviors: threading stubs, file limits, memory, asyncify.\n"
            "These tests verify WASM port handles browser limitations correctly.");
        mainSizer->Add(desc, 0, wxALL, 5);

        // Test buttons
        wxFlexGridSizer* gridSizer = new wxFlexGridSizer(2, 10, 10);
        gridSizer->AddGrowableCol(1, 1);

        // File System Tests
        wxButton* btnFileWrite = new wxButton(mainPanel, wxID_ANY, "Test File Write (/tmp/)");
        btnFileWrite->Bind(wxEVT_BUTTON, &WasmEdgeFrame::OnTestFileWrite, this);
        gridSizer->Add(btnFileWrite, 0, wxEXPAND);
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Write to WASM virtual file system"), 0, wxALIGN_CENTER_VERTICAL);

        wxButton* btnFileRead = new wxButton(mainPanel, wxID_ANY, "Test File Read");
        btnFileRead->Bind(wxEVT_BUTTON, &WasmEdgeFrame::OnTestFileRead, this);
        gridSizer->Add(btnFileRead, 0, wxEXPAND);
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Read from virtual file system"), 0, wxALIGN_CENTER_VERTICAL);

        wxButton* btnDirList = new wxButton(mainPanel, wxID_ANY, "Test Dir Listing");
        btnDirList->Bind(wxEVT_BUTTON, &WasmEdgeFrame::OnTestDirListing, this);
        gridSizer->Add(btnDirList, 0, wxEXPAND);
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "List /tmp/ directory contents"), 0, wxALIGN_CENTER_VERTICAL);

        // Threading Tests
        wxButton* btnThread = new wxButton(mainPanel, wxID_ANY, "Test Threading");
        btnThread->Bind(wxEVT_BUTTON, &WasmEdgeFrame::OnTestThreading, this);
        gridSizer->Add(btnThread, 0, wxEXPAND);
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Check if wxThread is stubbed"), 0, wxALIGN_CENTER_VERTICAL);

        // Font Enumeration Tests
        wxButton* btnFonts = new wxButton(mainPanel, wxID_ANY, "Test Font Enumeration");
        btnFonts->Bind(wxEVT_BUTTON, &WasmEdgeFrame::OnTestFontEnum, this);
        gridSizer->Add(btnFonts, 0, wxEXPAND);
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Enumerate available fonts (may fail in WASM)"), 0, wxALIGN_CENTER_VERTICAL);

        // Clipboard Tests
        wxButton* btnClipboard = new wxButton(mainPanel, wxID_ANY, "Test Clipboard");
        btnClipboard->Bind(wxEVT_BUTTON, &WasmEdgeFrame::OnTestClipboard, this);
        gridSizer->Add(btnClipboard, 0, wxEXPAND);
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Test clipboard with asyncify"), 0, wxALIGN_CENTER_VERTICAL);

        // Memory Tests
        wxButton* btnMemory = new wxButton(mainPanel, wxID_ANY, "Test Memory Allocation");
        btnMemory->Bind(wxEVT_BUTTON, &WasmEdgeFrame::OnTestMemory, this);
        gridSizer->Add(btnMemory, 0, wxEXPAND);
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Test WASM memory growth"), 0, wxALIGN_CENTER_VERTICAL);

        // OS Info Tests
        wxButton* btnOsInfo = new wxButton(mainPanel, wxID_ANY, "Test OS Info");
        btnOsInfo->Bind(wxEVT_BUTTON, &WasmEdgeFrame::OnTestOsInfo, this);
        gridSizer->Add(btnOsInfo, 0, wxEXPAND);
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Check wxGetOsVersion (may be stubbed)"), 0, wxALIGN_CENTER_VERTICAL);

        // wxLaunchDefaultBrowser Test
        wxButton* btnBrowser = new wxButton(mainPanel, wxID_ANY, "Test URL Launch");
        btnBrowser->Bind(wxEVT_BUTTON, &WasmEdgeFrame::OnTestBrowserLaunch, this);
        gridSizer->Add(btnBrowser, 0, wxEXPAND);
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Test wxLaunchDefaultBrowser"), 0, wxALIGN_CENTER_VERTICAL);

        // wxFileName Tests
        wxButton* btnFileName = new wxButton(mainPanel, wxID_ANY, "Test wxFileName");
        btnFileName->Bind(wxEVT_BUTTON, &WasmEdgeFrame::OnTestFileName, this);
        gridSizer->Add(btnFileName, 0, wxEXPAND);
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Path manipulation functions"), 0, wxALIGN_CENTER_VERTICAL);

        // Run All Tests
        wxButton* btnAll = new wxButton(mainPanel, wxID_ANY, "Run All Tests");
        btnAll->Bind(wxEVT_BUTTON, &WasmEdgeFrame::OnRunAllTests, this);
        gridSizer->Add(btnAll, 0, wxEXPAND);
        gridSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Execute all edge case tests"), 0, wxALIGN_CENTER_VERTICAL);

        mainSizer->Add(gridSizer, 0, wxEXPAND | wxALL, 10);

        // Event log
        mainSizer->Add(new wxStaticText(mainPanel, wxID_ANY, "Test Results"), 0, wxLEFT | wxTOP, 5);
        m_log = new wxTextCtrl(mainPanel, wxID_ANY, "", wxDefaultPosition, wxSize(-1, 300),
                               wxTE_MULTILINE | wxTE_READONLY);
        m_log->SetFont(wxFont(10, wxFONTFAMILY_MODERN, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL));
        mainSizer->Add(m_log, 1, wxEXPAND | wxALL, 5);

        mainPanel->SetSizer(mainSizer);

        CreateStatusBar();
        SetStatusText("WASM edge cases test app started");
        Log("WASM Edge Cases Test App Started");
        Log("====================================\n");
    }

private:
    void OnTestFileWrite(wxCommandEvent& event)
    {
        Log("=== File Write Test ===");

        wxString testFile = "/tmp/wasm_test_file.txt";
        wxString content = "Hello from WASM!\nLine 2\nLine 3";

        wxFile file;
        if (file.Create(testFile, true))  // true = overwrite
        {
            if (file.Write(content))
            {
                Log("SUCCESS: Wrote " + wxString::Format("%zu", content.Length()) + " bytes to " + testFile);
                m_testFilePath = testFile;
            }
            else
            {
                Log("FAILED: Could not write to file");
            }
            file.Close();
        }
        else
        {
            Log("FAILED: Could not create file " + testFile);
        }
        Log("");
    }

    void OnTestFileRead(wxCommandEvent& event)
    {
        Log("=== File Read Test ===");

        if (m_testFilePath.IsEmpty())
        {
            Log("No test file - run File Write test first");
            Log("");
            return;
        }

        wxFile file;
        if (file.Open(m_testFilePath))
        {
            wxString content;
            if (file.ReadAll(&content))
            {
                Log("SUCCESS: Read " + wxString::Format("%zu", content.Length()) + " bytes");
                Log("Content:\n" + content);
            }
            else
            {
                Log("FAILED: Could not read file content");
            }
            file.Close();
        }
        else
        {
            Log("FAILED: Could not open " + m_testFilePath);
        }
        Log("");
    }

    void OnTestDirListing(wxCommandEvent& event)
    {
        Log("=== Directory Listing Test ===");

        wxDir dir("/tmp");
        if (dir.IsOpened())
        {
            Log("Contents of /tmp/:");

            wxString filename;
            int count = 0;
            bool cont = dir.GetFirst(&filename);
            while (cont)
            {
                Log("  " + filename);
                count++;
                cont = dir.GetNext(&filename);
            }

            if (count == 0)
                Log("  (empty directory)");
            else
                Log(wxString::Format("  Total: %d files", count));
        }
        else
        {
            Log("FAILED: Could not open /tmp/ directory");
        }
        Log("");
    }

    void OnTestThreading(wxCommandEvent& event)
    {
        Log("=== Threading Test ===");

        // In WASM, threading may be stubbed
        Log("Creating wxThread...");

        // Check if we can create a thread (may be no-op in WASM)
        #if wxUSE_THREADS
        Log("wxUSE_THREADS is defined");

        // Note: Actually running threads in WASM is complex
        // This test just checks if the API is available
        Log("Thread API is available (may be stubbed in WASM)");
        Log("WASM typically runs single-threaded");
        Log("For async operations, use wxTimer or emscripten_async_*");
        #else
        Log("wxUSE_THREADS is NOT defined");
        #endif

        Log("");
    }

    void OnTestFontEnum(wxCommandEvent& event)
    {
        Log("=== Font Enumeration Test ===");

        class FontEnumerator : public wxFontEnumerator
        {
        public:
            wxArrayString fonts;

            virtual bool OnFacename(const wxString& facename) override
            {
                fonts.Add(facename);
                return true;  // Continue enumeration
            }
        };

        FontEnumerator enumerator;
        bool result = enumerator.EnumerateFacenames();

        if (result && enumerator.fonts.GetCount() > 0)
        {
            Log("SUCCESS: Found " + wxString::Format("%zu", enumerator.fonts.GetCount()) + " fonts:");
            for (size_t i = 0; i < wxMin(enumerator.fonts.GetCount(), (size_t)10); i++)
            {
                Log("  " + enumerator.fonts[i]);
            }
            if (enumerator.fonts.GetCount() > 10)
                Log("  ... and " + wxString::Format("%zu", enumerator.fonts.GetCount() - 10) + " more");
        }
        else
        {
            Log("NOTICE: Font enumeration returned false or empty");
            Log("This is expected in WASM - fontenum.cpp returns false");
            Log("Font pickers should use a predefined font list instead");
        }
        Log("");
    }

    void OnTestClipboard(wxCommandEvent& event)
    {
        Log("=== Clipboard Test ===");

        wxString testText = "WASM Clipboard Test " + wxDateTime::Now().FormatISOCombined();

        if (wxTheClipboard->Open())
        {
            // Write
            wxTheClipboard->SetData(new wxTextDataObject(testText));
            Log("Wrote to clipboard: " + testText);

            // Read back
            if (wxTheClipboard->IsSupported(wxDF_TEXT))
            {
                wxTextDataObject data;
                if (wxTheClipboard->GetData(data))
                {
                    Log("Read from clipboard: " + data.GetText());
                    if (data.GetText() == testText)
                        Log("SUCCESS: Clipboard round-trip works");
                    else
                        Log("WARNING: Read text differs from written text");
                }
                else
                {
                    Log("NOTICE: Could not read clipboard (may need user interaction)");
                }
            }

            wxTheClipboard->Close();
        }
        else
        {
            Log("FAILED: Could not open clipboard");
        }
        Log("");
    }

    void OnTestMemory(wxCommandEvent& event)
    {
        Log("=== Memory Allocation Test ===");

        // Test small allocation
        std::vector<char> small(1024 * 10);  // 10 KB
        Log("Allocated 10 KB: SUCCESS");

        // Test medium allocation
        std::vector<char> medium(1024 * 1024);  // 1 MB
        Log("Allocated 1 MB: SUCCESS");

        // Test larger allocation (WASM memory growth)
        try
        {
            std::vector<char> large(1024 * 1024 * 10);  // 10 MB
            Log("Allocated 10 MB: SUCCESS (WASM memory growth works)");
        }
        catch (const std::bad_alloc& e)
        {
            Log("FAILED: Could not allocate 10 MB");
            Log("  Error: " + wxString(e.what()));
        }

        Log("");
    }

    void OnTestOsInfo(wxCommandEvent& event)
    {
        Log("=== OS Info Test ===");

        int major, minor, micro;
        wxOperatingSystemId os = wxGetOsVersion(&major, &minor, &micro);

        Log("wxGetOsVersion returned:");
        Log("  OS ID: " + wxString::Format("%d", (int)os));
        Log("  Version: " + wxString::Format("%d.%d.%d", major, minor, micro));

        wxString osDesc = wxGetOsDescription();
        Log("  Description: " + osDesc);

        // In WASM, these may be stubbed
        if (osDesc.IsEmpty() || osDesc == "Unknown")
        {
            Log("NOTICE: OS info may be stubbed in WASM");
        }

        Log("");
    }

    void OnTestBrowserLaunch(wxCommandEvent& event)
    {
        Log("=== URL Launch Test ===");

        // In WASM, this should open in new tab via window.open()
        wxString url = "https://www.kicad.org";

        Log("Attempting to open: " + url);
        bool result = wxLaunchDefaultBrowser(url);

        if (result)
            Log("SUCCESS: Browser launch returned true");
        else
            Log("NOTICE: Browser launch returned false (may still work via popup)");

        Log("");
    }

    void OnTestFileName(wxCommandEvent& event)
    {
        Log("=== wxFileName Test ===");

        // Test path manipulation
        wxFileName fn("/tmp/test/file.kicad_pcb");

        Log("Full path: " + fn.GetFullPath());
        Log("Name: " + fn.GetName());
        Log("Extension: " + fn.GetExt());
        Log("Path: " + fn.GetPath());
        Log("Volume: " + fn.GetVolume());

        // Test path building
        wxFileName fn2;
        fn2.AssignDir("/home/user/projects");
        fn2.AppendDir("kicad");
        fn2.SetFullName("board.kicad_pcb");

        Log("Built path: " + fn2.GetFullPath());

        // Test relative path
        wxFileName relative;
        relative.Assign("../designs/board.kicad_pcb");
        Log("Is relative: " + wxString(relative.IsRelative() ? "yes" : "no"));

        Log("");
    }

    void OnRunAllTests(wxCommandEvent& event)
    {
        m_log->Clear();
        Log("Running all WASM edge case tests...\n");

        OnTestFileWrite(event);
        OnTestFileRead(event);
        OnTestDirListing(event);
        OnTestThreading(event);
        OnTestFontEnum(event);
        OnTestClipboard(event);
        OnTestMemory(event);
        OnTestOsInfo(event);
        OnTestFileName(event);

        Log("=== All Tests Complete ===");
    }

    void Log(const wxString& msg)
    {
        m_log->AppendText(msg + "\n");
    }

    wxTextCtrl* m_log;
    wxString m_testFilePath;
};

class WasmEdgeApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        WasmEdgeFrame* frame = new WasmEdgeFrame();
        frame->Show();
        return true;
    }
};

wxIMPLEMENT_APP(WasmEdgeApp);
