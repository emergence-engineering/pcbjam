#!/usr/bin/env python3
"""Audit KiCad catch blocks for wasm-EH safety (suspension inside catch handlers)."""
import os, re, sys, json
from collections import defaultdict

ROOT = "/Users/V/IdeaProjects/kicad-wasm/kicad"
SKIP_DIRS = {"thirdparty", ".git", "qa", "build"}

# Calls that suspend (Asyncify) directly or are dialog wrappers in KiCad/wx
DIRECT_SUSPEND = [
    "DisplayErrorMessage", "DisplayError", "DisplayInfoMessage", "DisplayHtmlInfoMessage",
    "wxMessageBox", "ShowModal", "ShowQuasiModal", "KIDIALOG", "OKOrCancelDialog",
    "wxMessageDialog", "IsOK(", "DisplayLoadError", "ShowAboutDialog",
    "wxGetSingleChoice", "wxTextEntryDialog", "wxFileDialog", "wxDirDialog",
    "GetDataFromClipboard", "SaveToClipboard", "wxClipboard", "EnumerateFacenames",
]
INFOBAR = ["ShowInfoBarError", "ShowInfoBarMsg", "ShowInfoBarWarning"]
# Benign callees: logging (wxLog* is deferred to idle-time flush -> not inside catch),
# string formatting, rethrow, reporters writing text
BENIGN = {
    "wxLogError", "wxLogWarning", "wxLogMessage", "wxLogTrace", "wxLogDebug", "wxLogVerbose",
    "Format", "Printf", "printf", "fprintf", "snprintf", "What", "Problem", "Where",
    "GetErrorMessage", "wxString", "FROM_UTF8", "TO_UTF8", "UTF8", "c_str", "mb_str",
    "GetChars", "IsEmpty", "empty", "clear", "size", "length", "Report", "ReportTail",
    "ReportHead", "Add", "push_back", "emplace_back", "insert", "append", "Append",
    "SetError", "assert", "wxASSERT", "wxFAIL", "wxCHECK", "abort", "exit",
    "GetMessages", "GetErrors", "reset", "get", "release", "find", "count", "at",
    "begin", "end", "str", "Mid", "Left", "Right", "Trim", "Lower", "Upper",
    "StartsWith", "EndsWith", "Contains", "Replace", "Remove", "make_unique",
    "make_shared", "static_cast", "dynamic_cast", "const_cast", "reinterpret_cast",
    "Clear", "Close", "swap", "resize", "erase", "Set", "SetBitmap", "Destroy",
    "wxT", "_", "_HKI", "traceSchPlugin", "TRACE", "what", "THROW_IO_ERROR", "wxS", "wxFAIL_MSG", "IDF_ERROR", "LIBRARY_ERROR", "FUTURE_FORMAT_ERROR", "PARSE_ERROR", "KI_PARAM_ERROR", "fmt::format", "format", "GetFullPath", "HandleException", "Pgm", "current_exception", "rethrow_exception", "Nickname", "GetName", "GetLibNickname", "GetLibItemName", "wx_str", "GetMessageString", "UnescapeString", "exceptions", "CLOSE_STREAM", "AddError", "GetRequiredVersion", "Disconnect", "From_UTF8", "typeid", "LogException", "Instance", "GetFullName", "GetUniStringLibId", "ShowText", "SetStatusText", "GetItemDescription", "GetClass", "GetFriendlyName", "IsValid", "GetPath", "GetFileName", "GetExtension", "Length", "GetData", "data", "front", "back", "pop_back", "emplace", "GetSettingsManager",
}
CALL_RE = re.compile(r"\b([A-Za-z_][A-Za-z0-9_:]*)\s*\(")
CATCH_RE = re.compile(r"\bcatch\s*\(")

def find_block(text, start):
    """Return (block_text, end_idx) for brace-block starting at first '{' at/after start."""
    i = text.find("{", start)
    if i < 0: return None, start
    depth, j, n = 0, i, len(text)
    in_str = in_chr = in_lc = in_bc = False
    while j < n:
        c = text[j]; p = text[j-1] if j else ""
        if in_lc:
            if c == "\n": in_lc = False
        elif in_bc:
            if p == "*" and c == "/": in_bc = False
        elif in_str:
            if c == '"' and p != "\\": in_str = False
        elif in_chr:
            if c == "'" and p != "\\": in_chr = False
        elif c == "/" and j+1 < n and text[j+1] == "/": in_lc = True
        elif c == "/" and j+1 < n and text[j+1] == "*": in_bc = True
        elif c == '"': in_str = True
        elif c == "'": in_chr = True
        elif c == "{": depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0: return text[i:j+1], j+1
        j += 1
    return None, start

stats = defaultdict(int)
direct_sites, review_sites = [], []
review_callees = defaultdict(int)
per_dir = defaultdict(lambda: defaultdict(int))

for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
    for fn in filenames:
        if not fn.endswith(".cpp"): continue
        path = os.path.join(dirpath, fn)
        rel = os.path.relpath(path, ROOT)
        top = rel.split(os.sep)[0]
        try: text = open(path, encoding="utf-8", errors="replace").read()
        except OSError: continue
        for m in CATCH_RE.finditer(text):
            block, _ = find_block(text, m.end())
            if block is None: continue
            stats["total"] += 1
            line = text[:m.start()].count("\n") + 1
            loc = f"{rel}:{line}"
            if any(s in block for s in DIRECT_SUSPEND):
                stats["direct_suspend"] += 1; per_dir[top]["direct"] += 1
                direct_sites.append(loc)
                continue
            if any(s in block for s in INFOBAR):
                stats["infobar"] += 1; per_dir[top]["infobar"] += 1
                continue
            calls = set(CALL_RE.findall(block)) - {"catch", "if", "for", "while", "switch", "return", "sizeof", "throw"}
            unknown = {c for c in calls if c.split("::")[-1] not in BENIGN and c not in BENIGN}
            if not unknown:
                stats["trivial"] += 1; per_dir[top]["trivial"] += 1
            else:
                stats["needs_review"] += 1; per_dir[top]["review"] += 1
                review_sites.append((loc, sorted(unknown)[:6]))
                for c in unknown: review_callees[c] += 1

print(json.dumps(stats, indent=1))
print("\n== per top-level dir (direct/review/trivial/infobar):")
for d in sorted(per_dir, key=lambda d: -per_dir[d]["direct"]):
    p = per_dir[d]
    print(f"  {d:24s} direct={p['direct']:3d} review={p['review']:3d} trivial={p['trivial']:3d} infobar={p['infobar']:2d}")
print("\n== top 25 unknown callees inside needs_review catches (freq):")
for c, n in sorted(review_callees.items(), key=lambda kv: -kv[1])[:25]:
    print(f"  {n:3d}  {c}")
print(f"\n== direct-suspend sites ({len(direct_sites)}):")
for s in direct_sites: print("  " + s)
