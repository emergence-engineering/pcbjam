// wxConfig must round-trip non-ASCII strings without truncation (DOM port).
//
// Bug (src/wasm/config.cpp + build/wasm/wx.js):
//   DoReadString() sizes its C++ buffer from getConfigEntryLength(), and the
//   enumeration paths (GetNextEntry/GetNextGroup) from getConfigKeyLength().
//   Both JS helpers return the JavaScript string's `.length` — the number of
//   UTF-16 code units — but the C++ side feeds that to stringToUTF8() as a max
//   BYTE budget. For any non-ASCII text the UTF-8 byte length exceeds the
//   UTF-16 unit count, so the buffer is undersized and the value/name is
//   truncated at the first multi-byte character (writes are fine; only the
//   read-back is corrupted). A "café" written and read back returns "caf".
//
//   This silently corrupts recent-file paths and any wxConfig-backed string for
//   i18n users (e.g. /home/José/board.kicad_pcb).
//
// This app writes a non-ASCII VALUE and a non-ASCII entry NAME, reads them back
// in the same session, and self-reports:
//   RED  (bug present): the read-back is truncated -> [REPRO] ...: FAIL
//   GREEN (fixed):      the read-back equals what was written -> PASS

#include "wx/wxprec.h"
#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/config.h"
#include "wx/wasm/config.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

static void Repro(const wxString& line)
{
#ifdef __EMSCRIPTEN__
    EM_ASM({ console.log('[REPRO] ' + UTF8ToString($0)); },
           (const char *)line.utf8_str());
#endif
}

static void RunConfigTest()
{
    wxLocalStorageConfig cfg("wxUtf8ReproTest");

    // start from a clean group so a previous run can't pollute enumeration
    cfg.DeleteGroup("/reprotest");

    // ---- 1) non-ASCII VALUE round-trip -------------------------------------
    const wxString value =
        wxString::FromUTF8("café-résumé-naïve-Žluťoučký-日本語-Ω");

    cfg.Write("/reprotest/path", value);
    cfg.Flush();

    wxString readValue;
    const bool readOk = cfg.Read("/reprotest/path", &readValue);
    if (readOk && readValue == value)
        Repro("config_value: PASS");
    else
        Repro("config_value: FAIL (read back '" + readValue + "')");

    // ---- 2) non-ASCII entry NAME round-trip (enumeration) ------------------
    // Write with an ABSOLUTE key so the stored localStorage key is well-formed
    // (a relative write under a non-root path is a separate, unrelated bug), and
    // the only thing under test is getConfigKeyLength's byte budget.
    const wxString keyName = wxString::FromUTF8("náme_日_key");

    cfg.Write("/reprotest/" + keyName, "x");
    cfg.Flush();

    bool found = false;
    cfg.SetPath("/reprotest");
    wxString entry;
    long idx = 0;
    if (cfg.GetFirstEntry(entry, idx))
    {
        do
        {
            if (entry == keyName)
                found = true;
        } while (cfg.GetNextEntry(entry, idx));
    }
    Repro(found ? "config_keyname: PASS"
                : "config_keyname: FAIL (non-ASCII entry name truncated)");

    cfg.DeleteGroup("/reprotest");
}

class ReproFrame : public wxFrame
{
public:
    ReproFrame()
        : wxFrame(nullptr, wxID_ANY, "wxConfig UTF-8 repro",
                  wxDefaultPosition, wxSize(320, 120))
    {
        new wxStaticText(this, wxID_ANY, "wxConfig UTF-8 round-trip test",
                         wxPoint(10, 10));

#ifdef __EMSCRIPTEN__
        CallAfter([] {
            RunConfigTest();
            EM_ASM({ console.log('[REPRO] config ready'); });
        });
#endif
    }
};

class ReproApp : public wxApp
{
public:
    bool OnInit() override
    {
        if (!wxApp::OnInit())
            return false;
        (new ReproFrame())->Show(true);
        return true;
    }
};

wxIMPLEMENT_APP(ReproApp);
