// Comprehensive wxWidgets WASM Test Application
// Purpose: Verify wxWidgets WASM port with full widget coverage and interaction testing

#include "wx/wxprec.h"

#ifndef WX_PRECOMP
    #include "wx/wx.h"
#endif

#include "wx/notebook.h"
#include "wx/tglbtn.h"
#include "wx/listbox.h"
#include "wx/choice.h"
#include "wx/combobox.h"
#include "wx/slider.h"
#include "wx/gauge.h"
#include "wx/dcbuffer.h"
#include "wx/datetime.h"
#include "wx/glcanvas.h"
#include "wx/grid.h"
#include "wx/spinctrl.h"
#include "wx/srchctrl.h"

// OpenGL headers - using legacy GL with Emscripten's emulation
#ifdef __EMSCRIPTEN__
#include <GL/gl.h>
#include <GL/glu.h>
#include <emscripten/emscripten.h>
#else
#include <OpenGL/gl.h>
#include <OpenGL/glu.h>
#endif

// Console logging macro for WASM debugging
#ifdef __EMSCRIPTEN__
#define CONSOLE_LOG(msg) EM_ASM({ console.log('[GL-CPP] ' + UTF8ToString($0)); }, msg)
#else
#define CONSOLE_LOG(msg) printf("[GL-CPP] %s\n", msg)
#endif

#include <vector>

// Control IDs
enum {
    ID_BTN_TEST = wxID_HIGHEST + 1,
    ID_BTN_TOGGLE,
    ID_CHK_FEATURE,
    ID_RADIO_OPTIONS,
    ID_SLIDER,
    ID_GAUGE,
    ID_TEXT_SINGLE,
    ID_TEXT_MULTI,
    ID_TEXT_PASSWORD,
    ID_COMBO,
    ID_LISTBOX,
    ID_CHOICE,
    ID_BTN_ADD_ITEM,
    ID_BTN_REMOVE_ITEM,
    ID_BTN_CLEAR,
    ID_EVENT_LOG,
    ID_DRAWING_PANEL,
    ID_GL_CANVAS,
    ID_BTN_GL_TEST_IMMEDIATE,
    ID_BTN_GL_TEST_MATRIX,
    ID_BTN_GL_TEST_VERTEX_ARRAY,
    ID_BTN_GL_RUN_ALL,
    ID_GL_TEST_SELECT,
    // Grid tab IDs
    ID_GRID,
    ID_SPIN_CTRL,
    ID_SEARCH_CTRL,
    // Dialogs tab IDs
    ID_BTN_MSGBOX_INFO,
    ID_BTN_MSGBOX_YESNO,
    ID_BTN_MSGBOX_ERROR,
    ID_BTN_CUSTOM_DIALOG,
    ID_BTN_TIMER_START,
    ID_BTN_TIMER_STOP,
    ID_TIMER
};

// Forward declarations
class TestFrame;

// Global pointer for logging from child panels
TestFrame* g_frame = nullptr;

//-----------------------------------------------------------------------------
// DrawingPanel - Custom drawing canvas for mouse interaction testing
//-----------------------------------------------------------------------------
class DrawingPanel : public wxPanel
{
public:
    DrawingPanel(wxWindow* parent);
    void Clear();

private:
    std::vector<std::vector<wxPoint>> m_strokes;  // Collection of strokes
    std::vector<wxPoint> m_currentStroke;         // Current stroke being drawn
    bool m_drawing;

    void OnPaint(wxPaintEvent& evt);
    void OnMouseDown(wxMouseEvent& evt);
    void OnMouseMove(wxMouseEvent& evt);
    void OnMouseUp(wxMouseEvent& evt);
    void OnMouseEnter(wxMouseEvent& evt);
    void OnMouseLeave(wxMouseEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

wxBEGIN_EVENT_TABLE(DrawingPanel, wxPanel)
    EVT_PAINT(DrawingPanel::OnPaint)
    EVT_LEFT_DOWN(DrawingPanel::OnMouseDown)
    EVT_LEFT_UP(DrawingPanel::OnMouseUp)
    EVT_MOTION(DrawingPanel::OnMouseMove)
    EVT_ENTER_WINDOW(DrawingPanel::OnMouseEnter)
    EVT_LEAVE_WINDOW(DrawingPanel::OnMouseLeave)
wxEND_EVENT_TABLE()

DrawingPanel::DrawingPanel(wxWindow* parent)
    : wxPanel(parent, ID_DRAWING_PANEL, wxDefaultPosition, wxSize(400, 300),
              wxBORDER_SIMPLE | wxFULL_REPAINT_ON_RESIZE)
    , m_drawing(false)
{
    SetBackgroundColour(*wxWHITE);
    SetBackgroundStyle(wxBG_STYLE_PAINT);
}

void DrawingPanel::Clear()
{
    m_strokes.clear();
    m_currentStroke.clear();
    m_drawing = false;
    Refresh();
}

void DrawingPanel::OnPaint(wxPaintEvent& WXUNUSED(evt))
{
    wxBufferedPaintDC dc(this);
    dc.SetBackground(*wxWHITE_BRUSH);
    dc.Clear();

    // Draw instructions
    dc.SetTextForeground(wxColour(150, 150, 150));
    dc.DrawText("Draw here with mouse", 10, 10);

    // Draw all completed strokes
    dc.SetPen(wxPen(*wxBLACK, 2));
    for (const auto& stroke : m_strokes) {
        if (stroke.size() > 1) {
            for (size_t i = 1; i < stroke.size(); ++i) {
                dc.DrawLine(stroke[i-1], stroke[i]);
            }
        }
    }

    // Draw current stroke
    if (m_currentStroke.size() > 1) {
        dc.SetPen(wxPen(*wxBLUE, 2));
        for (size_t i = 1; i < m_currentStroke.size(); ++i) {
            dc.DrawLine(m_currentStroke[i-1], m_currentStroke[i]);
        }
    }
}

//-----------------------------------------------------------------------------
// GLTestCanvas - OpenGL canvas for testing legacy GL functions (KiCad uses these)
//-----------------------------------------------------------------------------
class GLTestCanvas : public wxGLCanvas
{
public:
    GLTestCanvas(wxWindow* parent);
    virtual ~GLTestCanvas();

    // Test functions matching KiCad's GL usage
    void TestImmediateMode();      // glBegin/glEnd, glVertex, glColor
    void TestMatrixOperations();   // glMatrixMode, glPushMatrix, glTranslate, etc.
    void TestVertexArrays();       // glEnableClientState, glVertexPointer, etc.
    void TestStateManagement();    // glEnable/glDisable, glBlendFunc
    void TestTexCoords();          // glTexCoord2f
    void TestNormals();            // glNormal3f
    void RunAllTests();
    void SetCurrentTest(int test);

    bool IsGLInitialized() const { return m_glInitialized; }

private:
    wxGLContext* m_context;
    bool m_glInitialized;
    int m_currentTest;  // Which test pattern to display

    void OnPaint(wxPaintEvent& evt);
    void OnSize(wxSizeEvent& evt);
    void InitGL();
    void SetupViewport();
    void Render();

    wxDECLARE_EVENT_TABLE();
};

wxBEGIN_EVENT_TABLE(GLTestCanvas, wxGLCanvas)
    EVT_PAINT(GLTestCanvas::OnPaint)
    EVT_SIZE(GLTestCanvas::OnSize)
wxEND_EVENT_TABLE()

// Helper to get GL attributes
static wxGLAttributes GetGLAttributes()
{
    wxGLAttributes attrs;
    attrs.PlatformDefaults().Defaults().EndList();
    return attrs;
}

GLTestCanvas::GLTestCanvas(wxWindow* parent)
    : wxGLCanvas(parent, GetGLAttributes(), ID_GL_CANVAS,
                 wxDefaultPosition, wxSize(400, 300))
    , m_context(nullptr)
    , m_glInitialized(false)
    , m_currentTest(0)
{
    CONSOLE_LOG("GLTestCanvas constructor called");
    SetBackgroundStyle(wxBG_STYLE_PAINT);

    // Check if wxGLCanvas was created successfully
    EMSCRIPTEN_WEBGL_CONTEXT_HANDLE ctx = GetWebGLContext();
    if (ctx > 0) {
        EM_ASM({ console.log('[GL-CPP] WebGL context ID: ' + $0); }, ctx);
    } else {
        CONSOLE_LOG("ERROR: No WebGL context from wxGLCanvas!");
    }
}

GLTestCanvas::~GLTestCanvas()
{
    delete m_context;
}

void GLTestCanvas::InitGL()
{
    CONSOLE_LOG("InitGL called");

    if (m_glInitialized) {
        CONSOLE_LOG("Already initialized, skipping");
        return;
    }

    CONSOLE_LOG("Creating wxGLContext...");
    if (!m_context) {
        m_context = new wxGLContext(this);
        if (m_context && m_context->IsOK()) {
            CONSOLE_LOG("wxGLContext created successfully");
        } else {
            CONSOLE_LOG("ERROR: wxGLContext creation failed!");
            return;
        }
    }

    CONSOLE_LOG("Calling SetCurrent...");
    if (!SetCurrent(*m_context)) {
        CONSOLE_LOG("ERROR: SetCurrent failed!");
        return;
    }
    CONSOLE_LOG("SetCurrent succeeded");

    // Basic GL setup
    CONSOLE_LOG("Setting up GL state...");
    glClearColor(0.2f, 0.2f, 0.3f, 1.0f);
    glEnable(GL_DEPTH_TEST);

    m_glInitialized = true;

    CONSOLE_LOG("OpenGL initialized successfully");
    wxPrintf("[GL] Vendor: %s\n", glGetString(GL_VENDOR));
    wxPrintf("[GL] Renderer: %s\n", glGetString(GL_RENDERER));
    wxPrintf("[GL] Version: %s\n", glGetString(GL_VERSION));
    fflush(stdout);
}

void GLTestCanvas::SetupViewport()
{
    wxSize size = GetClientSize();
    glViewport(0, 0, size.x, size.y);

    // Setup orthographic projection (legacy style)
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    glOrtho(-2.0, 2.0, -2.0, 2.0, -10.0, 10.0);

    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();
}

void GLTestCanvas::OnSize(wxSizeEvent& evt)
{
    if (m_glInitialized && m_context) {
        SetCurrent(*m_context);
        SetupViewport();
    }
    evt.Skip();
}

void GLTestCanvas::OnPaint(wxPaintEvent& WXUNUSED(evt))
{
    CONSOLE_LOG("OnPaint called");
    wxPaintDC dc(this);  // Required even for GL

    // Initialize GL if not done yet (this creates m_context)
    if (!m_glInitialized) {
        CONSOLE_LOG("GL not initialized, calling InitGL...");
        InitGL();
        if (!m_glInitialized) {
            CONSOLE_LOG("InitGL failed, returning");
            return;
        }
        SetupViewport();
    }

    if (!m_context) {
        CONSOLE_LOG("No context after InitGL, returning");
        return;
    }

    CONSOLE_LOG("Setting context current in OnPaint...");
    SetCurrent(*m_context);

    CONSOLE_LOG("Calling Render...");
    Render();
    CONSOLE_LOG("Calling SwapBuffers...");
    SwapBuffers();
    CONSOLE_LOG("OnPaint complete");
}

void GLTestCanvas::Render()
{
    // Set a bright visible color to prove GL is working
    glClearColor(0.2f, 0.4f, 0.8f, 1.0f);  // Bright blue
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

    CONSOLE_LOG("glClear done with blue color");

    // Debug GLImmediate state before drawing
    EM_ASM({
        if (typeof GLImmediate !== 'undefined') {
            console.log('[GL-DEBUG] GLImmediate state:');
            console.log('  initted:', GLImmediate.initted);
            console.log('  enabledClientAttributes:', GLImmediate.enabledClientAttributes);
            console.log('  totalEnabledClientAttributes:', GLImmediate.totalEnabledClientAttributes);
            if (GLImmediate.TexEnvJIT) {
                console.log('  TexEnvJIT.enabled:', GLImmediate.TexEnvJIT.enabled);
            }
        } else {
            console.log('[GL-DEBUG] GLImmediate not defined!');
        }
    });

    // Draw based on current test
    switch (m_currentTest) {
        case 0: TestImmediateMode(); break;
        case 1: TestMatrixOperations(); break;
        case 2: TestVertexArrays(); break;
        case 3: TestStateManagement(); break;
        default: TestImmediateMode(); break;
    }

    glFlush();
}

// Test 1: Immediate Mode Drawing (glBegin/glEnd) - KiCad uses this heavily
// Using STANDARD OpenGL patterns (color once, multiple vertices)
// This tests the GL shim that handles Emscripten's color-per-vertex requirement
void GLTestCanvas::TestImmediateMode()
{
    wxPrintf("[GL TEST] Testing immediate mode (glBegin/glEnd)...\n");
    wxPrintf("[GL TEST] Using STANDARD OpenGL patterns (color set once per primitive)\n");
    fflush(stdout);

    // Test GL_TRIANGLES with glVertex3f and glColor3f
    // RGB triangle - each vertex has a different color (smooth shading)
    glBegin(GL_TRIANGLES);
        glColor3f(1.0f, 0.0f, 0.0f);  // Red
        glVertex3f(-1.0f, -0.5f, 0.0f);
        glColor3f(0.0f, 1.0f, 0.0f);  // Green
        glVertex3f(0.0f, 1.0f, 0.0f);
        glColor3f(0.0f, 0.0f, 1.0f);  // Blue
        glVertex3f(1.0f, -0.5f, 0.0f);
    glEnd();

    // Test GL_QUADS with glVertex2f and glColor4f
    // STANDARD OPENGL: Set color ONCE, then multiple vertices
    // The GL shim should inject color before each vertex automatically
    glColor4f(1.0f, 1.0f, 0.0f, 0.8f);  // Yellow, semi-transparent - SET ONCE
    glBegin(GL_QUADS);
        glVertex2f(-1.8f, -1.8f);  // All 4 vertices use the same yellow color
        glVertex2f(-1.2f, -1.8f);
        glVertex2f(-1.2f, -1.2f);
        glVertex2f(-1.8f, -1.2f);
    glEnd();

    // Test GL_LINES with standard pattern
    // STANDARD OPENGL: Set color ONCE, then multiple vertices
    glColor3f(1.0f, 1.0f, 1.0f);  // White - SET ONCE
    glBegin(GL_LINES);
        glVertex3f(-1.5f, 1.5f, 0.0f);
        glVertex3f(1.5f, 1.5f, 0.0f);
    glEnd();

    // Test GL_LINE_STRIP with standard pattern
    glColor3f(0.0f, 1.0f, 1.0f);  // Cyan - SET ONCE
    glBegin(GL_LINE_STRIP);
        glVertex3f(1.2f, -1.8f, 0.0f);
        glVertex3f(1.4f, -1.4f, 0.0f);
        glVertex3f(1.6f, -1.6f, 0.0f);
        glVertex3f(1.8f, -1.2f, 0.0f);
    glEnd();

    // Test GL_LINE_LOOP with standard pattern
    glColor3f(1.0f, 0.0f, 1.0f);  // Magenta - SET ONCE
    glBegin(GL_LINE_LOOP);
        glVertex3f(1.2f, 1.2f, 0.0f);
        glVertex3f(1.8f, 1.2f, 0.0f);
        glVertex3f(1.8f, 1.8f, 0.0f);
        glVertex3f(1.2f, 1.8f, 0.0f);
    glEnd();

    wxPrintf("[GL TEST] Immediate mode test complete\n");
    fflush(stdout);
}

// Test 2: Matrix Operations - KiCad uses glPushMatrix/glPopMatrix extensively
// Using STANDARD OpenGL patterns (color once, multiple vertices)
void GLTestCanvas::TestMatrixOperations()
{
    wxPrintf("[GL TEST] Testing matrix operations...\n");
    fflush(stdout);

    // Draw centered triangle with standard GL pattern
    glPushMatrix();
        glTranslatef(0.0f, 0.0f, 0.0f);
        glColor3f(0.5f, 0.5f, 0.5f);  // Gray - SET ONCE
        glBegin(GL_TRIANGLES);
            glVertex3f(-0.3f, -0.3f, 0.0f);
            glVertex3f(0.3f, -0.3f, 0.0f);
            glVertex3f(0.0f, 0.3f, 0.0f);
        glEnd();
    glPopMatrix();

    // Draw 4 rotated/translated copies with standard GL pattern
    for (int i = 0; i < 4; i++) {
        glPushMatrix();
            float angle = i * 90.0f;
            float tx = 1.2f * ((i % 2) * 2 - 1);  // -1.2 or 1.2
            float ty = 1.2f * ((i / 2) * 2 - 1);  // -1.2 or 1.2

            glTranslatef(tx, ty, 0.0f);
            glRotatef(angle, 0.0f, 0.0f, 1.0f);
            glScalef(0.5f, 0.5f, 1.0f);

            // Draw colored square with standard GL pattern
            float r = (i == 0 || i == 3) ? 1.0f : 0.3f;
            float g = (i == 1 || i == 3) ? 1.0f : 0.3f;
            float b = (i == 2 || i == 3) ? 1.0f : 0.3f;

            glColor3f(r, g, b);  // SET ONCE before glBegin
            glBegin(GL_QUADS);
                glVertex3f(-0.5f, -0.5f, 0.0f);
                glVertex3f(0.5f, -0.5f, 0.0f);
                glVertex3f(0.5f, 0.5f, 0.0f);
                glVertex3f(-0.5f, 0.5f, 0.0f);
            glEnd();
        glPopMatrix();
    }

    wxPrintf("[GL TEST] Matrix operations test complete\n");
    fflush(stdout);
}

// Test 3: Legacy Vertex Arrays - KiCad uses glVertexPointer, glColorPointer
void GLTestCanvas::TestVertexArrays()
{
    wxPrintf("[GL TEST] Testing legacy vertex arrays...\n");
    fflush(stdout);

    // Vertex data for a hexagon
    static GLfloat vertices[] = {
        0.0f, 0.0f, 0.0f,    // Center
        1.0f, 0.0f, 0.0f,    // Right
        0.5f, 0.866f, 0.0f,  // Upper right
        -0.5f, 0.866f, 0.0f, // Upper left
        -1.0f, 0.0f, 0.0f,   // Left
        -0.5f, -0.866f, 0.0f,// Lower left
        0.5f, -0.866f, 0.0f  // Lower right
    };

    static GLfloat colors[] = {
        1.0f, 1.0f, 1.0f,  // White center
        1.0f, 0.0f, 0.0f,  // Red
        1.0f, 0.5f, 0.0f,  // Orange
        1.0f, 1.0f, 0.0f,  // Yellow
        0.0f, 1.0f, 0.0f,  // Green
        0.0f, 0.0f, 1.0f,  // Blue
        0.5f, 0.0f, 1.0f   // Purple
    };

    // KiCad uses GL_UNSIGNED_SHORT or GL_UNSIGNED_INT for indices, never GL_UNSIGNED_BYTE
    // Emscripten's legacy GL emulation only supports GL_UNSIGNED_SHORT for client-side arrays
    static GLushort indices[] = {
        0, 1, 2,
        0, 2, 3,
        0, 3, 4,
        0, 4, 5,
        0, 5, 6,
        0, 6, 1
    };

    // Enable client state (legacy)
    glEnableClientState(GL_VERTEX_ARRAY);
    glEnableClientState(GL_COLOR_ARRAY);

    // Set up pointers
    glVertexPointer(3, GL_FLOAT, 0, vertices);
    glColorPointer(3, GL_FLOAT, 0, colors);

    // Draw using vertex arrays (GL_UNSIGNED_SHORT matches KiCad's usage)
    glDrawElements(GL_TRIANGLES, 18, GL_UNSIGNED_SHORT, indices);

    // Disable client state
    glDisableClientState(GL_COLOR_ARRAY);
    glDisableClientState(GL_VERTEX_ARRAY);

    wxPrintf("[GL TEST] Legacy vertex arrays test complete\n");
    fflush(stdout);
}

// Test 4: State Management - glEnable/glDisable, blending
// Using STANDARD OpenGL patterns with separate glBegin/glEnd for each color
void GLTestCanvas::TestStateManagement()
{
    wxPrintf("[GL TEST] Testing state management...\n");
    fflush(stdout);

    // Enable blending
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);

    // Draw overlapping semi-transparent squares using standard GL pattern
    // Each quad has its own color set before glBegin

    // Red square
    glColor4f(1.0f, 0.0f, 0.0f, 0.5f);  // SET ONCE
    glBegin(GL_QUADS);
        glVertex2f(-1.0f, -1.0f);
        glVertex2f(0.5f, -1.0f);
        glVertex2f(0.5f, 0.5f);
        glVertex2f(-1.0f, 0.5f);
    glEnd();

    // Green square
    glColor4f(0.0f, 1.0f, 0.0f, 0.5f);  // SET ONCE
    glBegin(GL_QUADS);
        glVertex2f(-0.5f, -0.5f);
        glVertex2f(1.0f, -0.5f);
        glVertex2f(1.0f, 1.0f);
        glVertex2f(-0.5f, 1.0f);
    glEnd();

    // Blue square
    glColor4f(0.0f, 0.0f, 1.0f, 0.5f);  // SET ONCE
    glBegin(GL_QUADS);
        glVertex2f(0.0f, 0.0f);
        glVertex2f(1.5f, 0.0f);
        glVertex2f(1.5f, 1.5f);
        glVertex2f(0.0f, 1.5f);
    glEnd();

    glDisable(GL_BLEND);

    wxPrintf("[GL TEST] State management test complete\n");
    fflush(stdout);
}

// Test 5: Texture coordinates (no actual texture, just testing the calls)
// Note: glTexCoord is per-vertex anyway, and color is set once before glBegin
void GLTestCanvas::TestTexCoords()
{
    wxPrintf("[GL TEST] Testing texture coordinates...\n");
    fflush(stdout);

    glColor3f(0.8f, 0.8f, 0.8f);  // SET ONCE
    glBegin(GL_QUADS);
        glTexCoord2f(0.0f, 0.0f); glVertex2f(-1.0f, -1.0f);
        glTexCoord2f(1.0f, 0.0f); glVertex2f(1.0f, -1.0f);
        glTexCoord2f(1.0f, 1.0f); glVertex2f(1.0f, 1.0f);
        glTexCoord2f(0.0f, 1.0f); glVertex2f(-1.0f, 1.0f);
    glEnd();

    wxPrintf("[GL TEST] Texture coordinates test complete\n");
    fflush(stdout);
}

// Test 6: Normal vectors (for lighting, which we're not testing but calls should work)
// Note: glNormal is per-vertex, and color is set once before glBegin
void GLTestCanvas::TestNormals()
{
    wxPrintf("[GL TEST] Testing normal vectors...\n");
    fflush(stdout);

    glColor3f(0.7f, 0.7f, 0.9f);  // SET ONCE
    glBegin(GL_TRIANGLES);
        glNormal3f(0.0f, 0.0f, 1.0f);
        glVertex3f(-1.0f, -1.0f, 0.0f);
        glNormal3f(0.0f, 0.0f, 1.0f);
        glVertex3f(1.0f, -1.0f, 0.0f);
        glNormal3f(0.0f, 0.0f, 1.0f);
        glVertex3f(0.0f, 1.0f, 0.0f);
    glEnd();

    wxPrintf("[GL TEST] Normal vectors test complete\n");
    fflush(stdout);
}

void GLTestCanvas::RunAllTests()
{
    wxPrintf("[GL TEST] Running all legacy GL tests...\n");
    fflush(stdout);

    m_currentTest = 0;
    Refresh();
}

void GLTestCanvas::SetCurrentTest(int test)
{
    m_currentTest = test;
    Refresh();
}

//-----------------------------------------------------------------------------
// TestFrame - Main application frame
//-----------------------------------------------------------------------------
class TestFrame : public wxFrame
{
public:
    TestFrame(const wxString& title);
    void LogEvent(const wxString& msg);

private:
    wxNotebook* m_notebook;
    wxListBox* m_eventLog;
    wxGauge* m_gauge;
    wxTextCtrl* m_textSingle;
    wxTextCtrl* m_textMulti;
    DrawingPanel* m_drawingPanel;
    wxListBox* m_listBox;
    GLTestCanvas* m_glCanvas;
    wxChoice* m_glTestChoice;
    // Grid tab controls
    wxGrid* m_grid;
    wxSpinCtrl* m_spinCtrl;
    wxSearchCtrl* m_searchCtrl;
    // Dialogs tab controls
    wxTimer* m_timer;
    wxStaticText* m_timerLabel;
    int m_timerCount;

    // Create tab pages
    wxPanel* CreateControlsPage(wxNotebook* parent);
    wxPanel* CreateTextPage(wxNotebook* parent);
    wxPanel* CreateDrawingPage(wxNotebook* parent);
    wxPanel* CreateListsPage(wxNotebook* parent);
    wxPanel* CreateOpenGLPage(wxNotebook* parent);
    wxPanel* CreateGridPage(wxNotebook* parent);
    wxPanel* CreateDialogsPage(wxNotebook* parent);

    // Event handlers
    void OnQuit(wxCommandEvent& evt);
    void OnAbout(wxCommandEvent& evt);
    void OnButtonClick(wxCommandEvent& evt);
    void OnToggleButton(wxCommandEvent& evt);
    void OnCheckBox(wxCommandEvent& evt);
    void OnRadioBox(wxCommandEvent& evt);
    void OnSlider(wxCommandEvent& evt);
    void OnTextChange(wxCommandEvent& evt);
    void OnTextEnter(wxCommandEvent& evt);
    void OnComboSelect(wxCommandEvent& evt);
    void OnListBoxSelect(wxCommandEvent& evt);
    void OnChoiceSelect(wxCommandEvent& evt);
    void OnAddItem(wxCommandEvent& evt);
    void OnRemoveItem(wxCommandEvent& evt);
    void OnClearDrawing(wxCommandEvent& evt);
    void OnNotebookPageChanged(wxBookCtrlEvent& evt);
    void OnGLTestSelect(wxCommandEvent& evt);
    void OnGLRunAll(wxCommandEvent& evt);
    // Grid tab event handlers
    void OnGridCellChange(wxGridEvent& evt);
    void OnGridCellSelect(wxGridEvent& evt);
    void OnSpinCtrl(wxSpinEvent& evt);
    void OnSearchCtrl(wxCommandEvent& evt);
    void OnSearchCtrlEnter(wxCommandEvent& evt);
    // Dialogs tab event handlers
    void OnMsgBoxInfo(wxCommandEvent& evt);
    void OnMsgBoxYesNo(wxCommandEvent& evt);
    void OnMsgBoxError(wxCommandEvent& evt);
    void OnCustomDialog(wxCommandEvent& evt);
    void OnTimerStart(wxCommandEvent& evt);
    void OnTimerStop(wxCommandEvent& evt);
    void OnTimer(wxTimerEvent& evt);

    wxDECLARE_EVENT_TABLE();
};

wxBEGIN_EVENT_TABLE(TestFrame, wxFrame)
    EVT_MENU(wxID_EXIT, TestFrame::OnQuit)
    EVT_MENU(wxID_ABOUT, TestFrame::OnAbout)
    EVT_BUTTON(ID_BTN_TEST, TestFrame::OnButtonClick)
    EVT_TOGGLEBUTTON(ID_BTN_TOGGLE, TestFrame::OnToggleButton)
    EVT_CHECKBOX(ID_CHK_FEATURE, TestFrame::OnCheckBox)
    EVT_RADIOBOX(ID_RADIO_OPTIONS, TestFrame::OnRadioBox)
    EVT_SLIDER(ID_SLIDER, TestFrame::OnSlider)
    EVT_TEXT(ID_TEXT_SINGLE, TestFrame::OnTextChange)
    EVT_TEXT_ENTER(ID_TEXT_SINGLE, TestFrame::OnTextEnter)
    EVT_COMBOBOX(ID_COMBO, TestFrame::OnComboSelect)
    EVT_LISTBOX(ID_LISTBOX, TestFrame::OnListBoxSelect)
    EVT_CHOICE(ID_CHOICE, TestFrame::OnChoiceSelect)
    EVT_BUTTON(ID_BTN_ADD_ITEM, TestFrame::OnAddItem)
    EVT_BUTTON(ID_BTN_REMOVE_ITEM, TestFrame::OnRemoveItem)
    EVT_BUTTON(ID_BTN_CLEAR, TestFrame::OnClearDrawing)
    EVT_NOTEBOOK_PAGE_CHANGED(wxID_ANY, TestFrame::OnNotebookPageChanged)
    EVT_CHOICE(ID_GL_TEST_SELECT, TestFrame::OnGLTestSelect)
    EVT_BUTTON(ID_BTN_GL_RUN_ALL, TestFrame::OnGLRunAll)
    // Grid tab events
    EVT_GRID_CELL_CHANGED(TestFrame::OnGridCellChange)
    EVT_GRID_SELECT_CELL(TestFrame::OnGridCellSelect)
    EVT_SPINCTRL(ID_SPIN_CTRL, TestFrame::OnSpinCtrl)
    EVT_SEARCHCTRL_SEARCH_BTN(ID_SEARCH_CTRL, TestFrame::OnSearchCtrl)
    EVT_TEXT_ENTER(ID_SEARCH_CTRL, TestFrame::OnSearchCtrlEnter)
    // Dialogs tab events
    EVT_BUTTON(ID_BTN_MSGBOX_INFO, TestFrame::OnMsgBoxInfo)
    EVT_BUTTON(ID_BTN_MSGBOX_YESNO, TestFrame::OnMsgBoxYesNo)
    EVT_BUTTON(ID_BTN_MSGBOX_ERROR, TestFrame::OnMsgBoxError)
    EVT_BUTTON(ID_BTN_CUSTOM_DIALOG, TestFrame::OnCustomDialog)
    EVT_BUTTON(ID_BTN_TIMER_START, TestFrame::OnTimerStart)
    EVT_BUTTON(ID_BTN_TIMER_STOP, TestFrame::OnTimerStop)
    EVT_TIMER(ID_TIMER, TestFrame::OnTimer)
wxEND_EVENT_TABLE()

TestFrame::TestFrame(const wxString& title)
    : wxFrame(nullptr, wxID_ANY, title, wxDefaultPosition, wxSize(640, 480))
{
    g_frame = this;

    // Menu bar
    wxMenu* menuFile = new wxMenu;
    menuFile->Append(wxID_EXIT, "E&xit\tAlt-X", "Quit the application");

    wxMenu* menuHelp = new wxMenu;
    menuHelp->Append(wxID_ABOUT, "&About\tF1", "Show about dialog");

    wxMenuBar* menuBar = new wxMenuBar;
    menuBar->Append(menuFile, "&File");
    menuBar->Append(menuHelp, "&Help");
    SetMenuBar(menuBar);

    // Status bar
    CreateStatusBar(2);
    SetStatusText("Ready");

    // Main layout: notebook on top, event log on bottom
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    // Notebook with tabs
    m_notebook = new wxNotebook(this, wxID_ANY);
    m_notebook->AddPage(CreateControlsPage(m_notebook), "Controls");
    m_notebook->AddPage(CreateTextPage(m_notebook), "Text Input");
    m_notebook->AddPage(CreateDrawingPage(m_notebook), "Drawing");
    m_notebook->AddPage(CreateListsPage(m_notebook), "Lists");
    m_notebook->AddPage(CreateOpenGLPage(m_notebook), "OpenGL");
    m_notebook->AddPage(CreateGridPage(m_notebook), "Grid");
    m_notebook->AddPage(CreateDialogsPage(m_notebook), "Dialogs");

    mainSizer->Add(m_notebook, 1, wxEXPAND | wxALL, 5);

    // Event log panel
    wxStaticBox* logBox = new wxStaticBox(this, wxID_ANY, "Event Log");
    wxStaticBoxSizer* logSizer = new wxStaticBoxSizer(logBox, wxVERTICAL);

    m_eventLog = new wxListBox(this, ID_EVENT_LOG, wxDefaultPosition, wxSize(-1, 100));
    logSizer->Add(m_eventLog, 1, wxEXPAND);

    mainSizer->Add(logSizer, 0, wxEXPAND | wxLEFT | wxRIGHT | wxBOTTOM, 5);

    SetSizer(mainSizer);

    LogEvent("Application started");
}

void TestFrame::LogEvent(const wxString& msg)
{
    // Get timestamp
    wxDateTime now = wxDateTime::Now();
    wxString timestamp = now.Format("[%H:%M:%S] ");
    wxString fullMsg = timestamp + msg;

    // Add to listbox
    m_eventLog->Append(fullMsg);

    // Keep max 100 entries
    while (m_eventLog->GetCount() > 100) {
        m_eventLog->Delete(0);
    }

    // Scroll to bottom
    m_eventLog->SetSelection(m_eventLog->GetCount() - 1);
    m_eventLog->SetSelection(wxNOT_FOUND);

    // Also log to console for Playwright testing
    wxPrintf("[EVENT] %s\n", msg);
    fflush(stdout);

    // Update status bar
    SetStatusText(msg, 1);
}

wxPanel* TestFrame::CreateControlsPage(wxNotebook* parent)
{
    wxPanel* panel = new wxPanel(parent);
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    // Row 1: Buttons
    wxStaticBox* btnBox = new wxStaticBox(panel, wxID_ANY, "Buttons");
    wxStaticBoxSizer* btnSizer = new wxStaticBoxSizer(btnBox, wxHORIZONTAL);

    wxButton* btnTest = new wxButton(panel, ID_BTN_TEST, "Click Me");
    btnSizer->Add(btnTest, 0, wxALL, 5);

    wxToggleButton* btnToggle = new wxToggleButton(panel, ID_BTN_TOGGLE, "Toggle");
    btnSizer->Add(btnToggle, 0, wxALL, 5);

    mainSizer->Add(btnSizer, 0, wxEXPAND | wxALL, 5);

    // Row 2: Checkbox and Radio
    wxBoxSizer* row2Sizer = new wxBoxSizer(wxHORIZONTAL);

    wxCheckBox* chkFeature = new wxCheckBox(panel, ID_CHK_FEATURE, "Enable feature");
    row2Sizer->Add(chkFeature, 0, wxALL | wxALIGN_CENTER_VERTICAL, 5);

    wxString radioChoices[] = { "Option A", "Option B", "Option C" };
    wxRadioBox* radioBox = new wxRadioBox(panel, ID_RADIO_OPTIONS, "Options",
        wxDefaultPosition, wxDefaultSize, 3, radioChoices, 1, wxRA_SPECIFY_ROWS);
    row2Sizer->Add(radioBox, 0, wxALL, 5);

    mainSizer->Add(row2Sizer, 0, wxEXPAND);

    // Row 3: Slider and Gauge
    wxStaticBox* rangeBox = new wxStaticBox(panel, wxID_ANY, "Range Controls");
    wxStaticBoxSizer* rangeSizer = new wxStaticBoxSizer(rangeBox, wxVERTICAL);

    wxBoxSizer* sliderRow = new wxBoxSizer(wxHORIZONTAL);
    sliderRow->Add(new wxStaticText(panel, wxID_ANY, "Slider:"), 0, wxALL | wxALIGN_CENTER_VERTICAL, 5);
    wxSlider* slider = new wxSlider(panel, ID_SLIDER, 50, 0, 100,
        wxDefaultPosition, wxSize(200, -1));
    sliderRow->Add(slider, 1, wxALL, 5);
    rangeSizer->Add(sliderRow, 0, wxEXPAND);

    wxBoxSizer* gaugeRow = new wxBoxSizer(wxHORIZONTAL);
    gaugeRow->Add(new wxStaticText(panel, wxID_ANY, "Gauge:"), 0, wxALL | wxALIGN_CENTER_VERTICAL, 5);
    m_gauge = new wxGauge(panel, ID_GAUGE, 100, wxDefaultPosition, wxSize(200, -1));
    m_gauge->SetValue(50);
    gaugeRow->Add(m_gauge, 1, wxALL, 5);
    rangeSizer->Add(gaugeRow, 0, wxEXPAND);

    mainSizer->Add(rangeSizer, 0, wxEXPAND | wxALL, 5);

    panel->SetSizer(mainSizer);
    return panel;
}

wxPanel* TestFrame::CreateTextPage(wxNotebook* parent)
{
    wxPanel* panel = new wxPanel(parent);
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    // Single-line text
    wxBoxSizer* singleRow = new wxBoxSizer(wxHORIZONTAL);
    singleRow->Add(new wxStaticText(panel, wxID_ANY, "Single-line:"), 0,
        wxALL | wxALIGN_CENTER_VERTICAL, 5);
    m_textSingle = new wxTextCtrl(panel, ID_TEXT_SINGLE, "",
        wxDefaultPosition, wxSize(200, -1), wxTE_PROCESS_ENTER);
    singleRow->Add(m_textSingle, 1, wxALL, 5);
    mainSizer->Add(singleRow, 0, wxEXPAND);

    // Multi-line text
    wxStaticBox* multiBox = new wxStaticBox(panel, wxID_ANY, "Multi-line:");
    wxStaticBoxSizer* multiSizer = new wxStaticBoxSizer(multiBox, wxVERTICAL);
    m_textMulti = new wxTextCtrl(panel, ID_TEXT_MULTI, "",
        wxDefaultPosition, wxSize(-1, 100), wxTE_MULTILINE);
    multiSizer->Add(m_textMulti, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(multiSizer, 1, wxEXPAND | wxALL, 5);

    // Password field
    wxBoxSizer* passRow = new wxBoxSizer(wxHORIZONTAL);
    passRow->Add(new wxStaticText(panel, wxID_ANY, "Password:"), 0,
        wxALL | wxALIGN_CENTER_VERTICAL, 5);
    wxTextCtrl* textPass = new wxTextCtrl(panel, ID_TEXT_PASSWORD, "",
        wxDefaultPosition, wxSize(200, -1), wxTE_PASSWORD);
    passRow->Add(textPass, 0, wxALL, 5);
    mainSizer->Add(passRow, 0, wxEXPAND);

    // ComboBox
    wxBoxSizer* comboRow = new wxBoxSizer(wxHORIZONTAL);
    comboRow->Add(new wxStaticText(panel, wxID_ANY, "ComboBox:"), 0,
        wxALL | wxALIGN_CENTER_VERTICAL, 5);
    wxString comboChoices[] = { "Choice 1", "Choice 2", "Choice 3" };
    wxComboBox* combo = new wxComboBox(panel, ID_COMBO, "",
        wxDefaultPosition, wxSize(150, -1), 3, comboChoices);
    comboRow->Add(combo, 0, wxALL, 5);
    mainSizer->Add(comboRow, 0, wxEXPAND);

    panel->SetSizer(mainSizer);
    return panel;
}

wxPanel* TestFrame::CreateDrawingPage(wxNotebook* parent)
{
    wxPanel* panel = new wxPanel(parent);
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    // Instructions
    mainSizer->Add(new wxStaticText(panel, wxID_ANY,
        "Click and drag to draw. Mouse events are logged."),
        0, wxALL, 10);

    // Drawing canvas
    m_drawingPanel = new DrawingPanel(panel);
    mainSizer->Add(m_drawingPanel, 1, wxEXPAND | wxALL, 10);

    // Clear button
    wxButton* btnClear = new wxButton(panel, ID_BTN_CLEAR, "Clear Canvas");
    mainSizer->Add(btnClear, 0, wxALL | wxALIGN_CENTER_HORIZONTAL, 10);

    panel->SetSizer(mainSizer);
    return panel;
}

wxPanel* TestFrame::CreateListsPage(wxNotebook* parent)
{
    wxPanel* panel = new wxPanel(parent);
    wxBoxSizer* mainSizer = new wxBoxSizer(wxHORIZONTAL);

    // ListBox section
    wxStaticBox* listBoxGroup = new wxStaticBox(panel, wxID_ANY, "ListBox");
    wxStaticBoxSizer* listBoxSizer = new wxStaticBoxSizer(listBoxGroup, wxVERTICAL);

    wxString listItems[] = { "Item 1", "Item 2", "Item 3", "Item 4", "Item 5" };
    m_listBox = new wxListBox(panel, ID_LISTBOX, wxDefaultPosition,
        wxSize(150, 150), 5, listItems);
    listBoxSizer->Add(m_listBox, 1, wxEXPAND | wxALL, 5);

    wxBoxSizer* listBtnSizer = new wxBoxSizer(wxHORIZONTAL);
    listBtnSizer->Add(new wxButton(panel, ID_BTN_ADD_ITEM, "Add"), 0, wxALL, 2);
    listBtnSizer->Add(new wxButton(panel, ID_BTN_REMOVE_ITEM, "Remove"), 0, wxALL, 2);
    listBoxSizer->Add(listBtnSizer, 0, wxALIGN_CENTER);

    mainSizer->Add(listBoxSizer, 1, wxEXPAND | wxALL, 10);

    // Choice section
    wxStaticBox* choiceGroup = new wxStaticBox(panel, wxID_ANY, "Choice");
    wxStaticBoxSizer* choiceSizer = new wxStaticBoxSizer(choiceGroup, wxVERTICAL);

    wxString choiceItems[] = { "Red", "Green", "Blue", "Yellow", "Purple" };
    wxChoice* choice = new wxChoice(panel, ID_CHOICE, wxDefaultPosition,
        wxSize(150, -1), 5, choiceItems);
    choiceSizer->Add(choice, 0, wxALL, 5);

    choiceSizer->Add(new wxStaticText(panel, wxID_ANY,
        "Select a color from\nthe dropdown above."), 0, wxALL, 5);

    mainSizer->Add(choiceSizer, 1, wxEXPAND | wxALL, 10);

    panel->SetSizer(mainSizer);
    return panel;
}

wxPanel* TestFrame::CreateOpenGLPage(wxNotebook* parent)
{
    wxPanel* panel = new wxPanel(parent);
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    // Description
    wxStaticText* desc = new wxStaticText(panel, wxID_ANY,
        "OpenGL Legacy Function Tests\n"
        "Tests the GL functions KiCad uses (immediate mode, matrix ops, vertex arrays).\n"
        "Using Emscripten's -sLEGACY_GL_EMULATION for WebGL compatibility.");
    mainSizer->Add(desc, 0, wxALL, 10);

    // Test selection row
    wxBoxSizer* controlSizer = new wxBoxSizer(wxHORIZONTAL);

    controlSizer->Add(new wxStaticText(panel, wxID_ANY, "Test:"), 0,
        wxALL | wxALIGN_CENTER_VERTICAL, 5);

    wxString testChoices[] = {
        "Immediate Mode (glBegin/glEnd)",
        "Matrix Operations (glPush/Pop)",
        "Vertex Arrays (glVertexPointer)",
        "State Management (glEnable/Blend)"
    };
    m_glTestChoice = new wxChoice(panel, ID_GL_TEST_SELECT, wxDefaultPosition,
        wxSize(250, -1), 4, testChoices);
    m_glTestChoice->SetSelection(0);
    controlSizer->Add(m_glTestChoice, 0, wxALL, 5);

    wxButton* btnRunAll = new wxButton(panel, ID_BTN_GL_RUN_ALL, "Run All Tests");
    controlSizer->Add(btnRunAll, 0, wxALL, 5);

    mainSizer->Add(controlSizer, 0, wxEXPAND);

    // GL Canvas
    m_glCanvas = new GLTestCanvas(panel);
    mainSizer->Add(m_glCanvas, 1, wxEXPAND | wxALL, 10);

    // Legend/info
    wxStaticBox* legendBox = new wxStaticBox(panel, wxID_ANY, "Test Details");
    wxStaticBoxSizer* legendSizer = new wxStaticBoxSizer(legendBox, wxVERTICAL);

    wxStaticText* legend = new wxStaticText(panel, wxID_ANY,
        "Immediate Mode: glBegin, glEnd, glVertex2f/3f, glColor3f/4f, GL_TRIANGLES/QUADS/LINES\n"
        "Matrix Ops: glMatrixMode, glPushMatrix, glPopMatrix, glTranslatef, glRotatef, glScalef\n"
        "Vertex Arrays: glEnableClientState, glVertexPointer, glColorPointer, glDrawElements\n"
        "State Mgmt: glEnable, glDisable, glBlendFunc, GL_BLEND, GL_DEPTH_TEST");
    legendSizer->Add(legend, 0, wxALL, 5);
    mainSizer->Add(legendSizer, 0, wxEXPAND | wxLEFT | wxRIGHT | wxBOTTOM, 10);

    panel->SetSizer(mainSizer);
    return panel;
}

wxPanel* TestFrame::CreateGridPage(wxNotebook* parent)
{
    wxPanel* panel = new wxPanel(parent);
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    // Description
    wxStaticText* desc = new wxStaticText(panel, wxID_ANY,
        "Advanced Controls Test\n"
        "Tests wxSpinCtrl and wxSearchCtrl which KiCad uses extensively.\n"
        "NOTE: wxGrid is NOT YET SUPPORTED in WASM (causes function signature mismatch crash).");
    mainSizer->Add(desc, 0, wxALL, 10);

    // wxGrid - DISABLED: causes "function signature mismatch" crash in WASM
    // This needs to be fixed in wxWidgets WASM port before we can test it
    /*
    wxStaticBox* gridBox = new wxStaticBox(panel, wxID_ANY, "wxGrid (editable cells)");
    wxStaticBoxSizer* gridSizer = new wxStaticBoxSizer(gridBox, wxVERTICAL);
    m_grid = new wxGrid(panel, ID_GRID, wxDefaultPosition, wxSize(400, 150));
    m_grid->CreateGrid(5, 4);
    // ... grid setup ...
    gridSizer->Add(m_grid, 1, wxEXPAND | wxALL, 5);
    mainSizer->Add(gridSizer, 1, wxEXPAND | wxALL, 5);
    */
    m_grid = nullptr;  // wxGrid not supported in WASM yet

    // Row with wxSpinCtrl and wxSearchCtrl
    wxBoxSizer* controlRow = new wxBoxSizer(wxHORIZONTAL);

    // wxSpinCtrl
    wxStaticBox* spinBox = new wxStaticBox(panel, wxID_ANY, "wxSpinCtrl");
    wxStaticBoxSizer* spinSizer = new wxStaticBoxSizer(spinBox, wxHORIZONTAL);

    spinSizer->Add(new wxStaticText(panel, wxID_ANY, "Value (0-100):"), 0,
        wxALL | wxALIGN_CENTER_VERTICAL, 5);
    m_spinCtrl = new wxSpinCtrl(panel, ID_SPIN_CTRL, "50",
        wxDefaultPosition, wxSize(80, -1), wxSP_ARROW_KEYS, 0, 100, 50);
    spinSizer->Add(m_spinCtrl, 0, wxALL, 5);

    controlRow->Add(spinSizer, 0, wxALL, 5);

    // wxSearchCtrl
    wxStaticBox* searchBox = new wxStaticBox(panel, wxID_ANY, "wxSearchCtrl");
    wxStaticBoxSizer* searchSizer = new wxStaticBoxSizer(searchBox, wxHORIZONTAL);

    m_searchCtrl = new wxSearchCtrl(panel, ID_SEARCH_CTRL, "",
        wxDefaultPosition, wxSize(200, -1), wxTE_PROCESS_ENTER);
    m_searchCtrl->ShowSearchButton(true);
    m_searchCtrl->ShowCancelButton(true);
    m_searchCtrl->SetDescriptiveText("Search...");
    searchSizer->Add(m_searchCtrl, 1, wxALL | wxEXPAND, 5);

    controlRow->Add(searchSizer, 1, wxALL | wxEXPAND, 5);

    mainSizer->Add(controlRow, 0, wxEXPAND);

    panel->SetSizer(mainSizer);
    return panel;
}

// Event handlers
void TestFrame::OnQuit(wxCommandEvent& WXUNUSED(evt))
{
    Close(true);
}

void TestFrame::OnAbout(wxCommandEvent& WXUNUSED(evt))
{
    wxMessageBox("wxWidgets WASM Comprehensive Test\n\n"
                 "This application tests various wxWidgets controls\n"
                 "running in WebAssembly via wxUniversal.",
                 "About", wxOK | wxICON_INFORMATION, this);
}

void TestFrame::OnButtonClick(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Button 'Click Me' clicked");
}

void TestFrame::OnToggleButton(wxCommandEvent& evt)
{
    bool pressed = evt.IsChecked();
    LogEvent(wxString::Format("Toggle button %s", pressed ? "pressed" : "released"));
}

void TestFrame::OnCheckBox(wxCommandEvent& evt)
{
    bool checked = evt.IsChecked();
    LogEvent(wxString::Format("Checkbox toggled: %s", checked ? "checked" : "unchecked"));
}

void TestFrame::OnRadioBox(wxCommandEvent& evt)
{
    int sel = evt.GetSelection();
    wxString option = wxString::Format("Option %c", 'A' + sel);
    LogEvent(wxString::Format("Radio selection: %s", option));
}

void TestFrame::OnSlider(wxCommandEvent& evt)
{
    int value = evt.GetInt();
    m_gauge->SetValue(value);
    LogEvent(wxString::Format("Slider value: %d", value));
}

void TestFrame::OnTextChange(wxCommandEvent& evt)
{
    wxString text = evt.GetString();
    LogEvent(wxString::Format("Text changed: \"%s\"", text));
}

void TestFrame::OnTextEnter(wxCommandEvent& evt)
{
    wxString text = evt.GetString();
    LogEvent(wxString::Format("Text entered (Enter pressed): \"%s\"", text));
}

void TestFrame::OnComboSelect(wxCommandEvent& evt)
{
    wxString selection = evt.GetString();
    LogEvent(wxString::Format("ComboBox selected: %s", selection));
}

void TestFrame::OnListBoxSelect(wxCommandEvent& evt)
{
    wxString selection = evt.GetString();
    LogEvent(wxString::Format("ListBox selected: %s", selection));
}

void TestFrame::OnChoiceSelect(wxCommandEvent& evt)
{
    wxString selection = evt.GetString();
    LogEvent(wxString::Format("Choice selected: %s", selection));
}

void TestFrame::OnAddItem(wxCommandEvent& WXUNUSED(evt))
{
    static int itemCount = 5;
    wxString newItem = wxString::Format("Item %d", ++itemCount);
    m_listBox->Append(newItem);
    LogEvent(wxString::Format("Added item: %s", newItem));
}

void TestFrame::OnRemoveItem(wxCommandEvent& WXUNUSED(evt))
{
    int sel = m_listBox->GetSelection();
    if (sel != wxNOT_FOUND) {
        wxString item = m_listBox->GetString(sel);
        m_listBox->Delete(sel);
        LogEvent(wxString::Format("Removed item: %s", item));
    } else {
        LogEvent("Remove: No item selected");
    }
}

void TestFrame::OnClearDrawing(wxCommandEvent& WXUNUSED(evt))
{
    m_drawingPanel->Clear();
    LogEvent("Drawing canvas cleared");
}

void TestFrame::OnNotebookPageChanged(wxBookCtrlEvent& evt)
{
    int page = evt.GetSelection();
    wxString pageName = m_notebook->GetPageText(page);
    LogEvent(wxString::Format("Tab changed to: %s", pageName));
    evt.Skip();
}

void TestFrame::OnGLTestSelect(wxCommandEvent& evt)
{
    int sel = evt.GetSelection();
    wxString testNames[] = {
        "Immediate Mode",
        "Matrix Operations",
        "Vertex Arrays",
        "State Management"
    };

    if (sel >= 0 && sel < 4) {
        LogEvent(wxString::Format("GL Test selected: %s", testNames[sel]));
        m_glCanvas->SetCurrentTest(sel);
    }
}

void TestFrame::OnGLRunAll(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Running all GL tests...");
    m_glCanvas->RunAllTests();
    LogEvent("All GL tests completed - check console for detailed results");
}

// Grid tab event handlers
void TestFrame::OnGridCellChange(wxGridEvent& evt)
{
    if (!m_grid) { evt.Skip(); return; }  // wxGrid not supported in WASM
    int row = evt.GetRow();
    int col = evt.GetCol();
    wxString value = m_grid->GetCellValue(row, col);
    LogEvent(wxString::Format("Grid cell changed: [%d,%d] = \"%s\"", row, col, value));
    evt.Skip();
}

void TestFrame::OnGridCellSelect(wxGridEvent& evt)
{
    if (!m_grid) { evt.Skip(); return; }  // wxGrid not supported in WASM
    int row = evt.GetRow();
    int col = evt.GetCol();
    wxString value = m_grid->GetCellValue(row, col);
    LogEvent(wxString::Format("Grid cell selected: [%d,%d] \"%s\"", row, col, value));
    evt.Skip();
}

void TestFrame::OnSpinCtrl(wxSpinEvent& evt)
{
    int value = evt.GetValue();
    LogEvent(wxString::Format("SpinCtrl value: %d", value));
}

void TestFrame::OnSearchCtrl(wxCommandEvent& evt)
{
    wxString text = m_searchCtrl->GetValue();
    LogEvent(wxString::Format("Search button clicked: \"%s\"", text));
}

void TestFrame::OnSearchCtrlEnter(wxCommandEvent& evt)
{
    wxString text = evt.GetString();
    LogEvent(wxString::Format("Search Enter pressed: \"%s\"", text));
}

// DrawingPanel event handlers (defined after TestFrame for g_frame access)
void DrawingPanel::OnMouseDown(wxMouseEvent& evt)
{
    m_drawing = true;
    m_currentStroke.clear();
    m_currentStroke.push_back(evt.GetPosition());
    CaptureMouse();

    if (g_frame) {
        g_frame->LogEvent(wxString::Format("Mouse down at (%d, %d)",
            evt.GetX(), evt.GetY()));
    }
}

void DrawingPanel::OnMouseMove(wxMouseEvent& evt)
{
    if (m_drawing) {
        m_currentStroke.push_back(evt.GetPosition());
        Refresh();
    }
}

void DrawingPanel::OnMouseUp(wxMouseEvent& evt)
{
    if (m_drawing) {
        m_drawing = false;
        if (HasCapture()) {
            ReleaseMouse();
        }

        // Save the completed stroke
        if (m_currentStroke.size() > 1) {
            m_strokes.push_back(m_currentStroke);
        }
        m_currentStroke.clear();
        Refresh();

        if (g_frame) {
            g_frame->LogEvent(wxString::Format("Mouse up at (%d, %d) - stroke completed",
                evt.GetX(), evt.GetY()));
        }
    }
}

void DrawingPanel::OnMouseEnter(wxMouseEvent& WXUNUSED(evt))
{
    if (g_frame) {
        g_frame->LogEvent("Mouse entered drawing canvas");
    }
}

void DrawingPanel::OnMouseLeave(wxMouseEvent& WXUNUSED(evt))
{
    if (g_frame) {
        g_frame->LogEvent("Mouse left drawing canvas");
    }
}

//-----------------------------------------------------------------------------
// CreateDialogsPage - Dialogs tab with message boxes and timer
//-----------------------------------------------------------------------------
wxPanel* TestFrame::CreateDialogsPage(wxNotebook* parent)
{
    wxPanel* panel = new wxPanel(parent);
    wxBoxSizer* mainSizer = new wxBoxSizer(wxVERTICAL);

    // Description
    wxStaticText* desc = new wxStaticText(panel, wxID_ANY,
        "Dialog and Timer Tests\n"
        "Tests wxMessageBox, wxDialog, and wxTimer which KiCad uses for alerts and animations.");
    mainSizer->Add(desc, 0, wxALL, 10);

    // Message Box section
    wxStaticBox* msgBox = new wxStaticBox(panel, wxID_ANY, "wxMessageBox");
    wxStaticBoxSizer* msgSizer = new wxStaticBoxSizer(msgBox, wxHORIZONTAL);

    wxButton* btnInfo = new wxButton(panel, ID_BTN_MSGBOX_INFO, "Info Dialog");
    wxButton* btnYesNo = new wxButton(panel, ID_BTN_MSGBOX_YESNO, "Yes/No Dialog");
    wxButton* btnError = new wxButton(panel, ID_BTN_MSGBOX_ERROR, "Error Dialog");

    msgSizer->Add(btnInfo, 0, wxALL, 5);
    msgSizer->Add(btnYesNo, 0, wxALL, 5);
    msgSizer->Add(btnError, 0, wxALL, 5);

    mainSizer->Add(msgSizer, 0, wxEXPAND | wxALL, 10);

    // Custom Dialog section
    wxStaticBox* dlgBox = new wxStaticBox(panel, wxID_ANY, "wxDialog");
    wxStaticBoxSizer* dlgSizer = new wxStaticBoxSizer(dlgBox, wxHORIZONTAL);

    wxButton* btnCustom = new wxButton(panel, ID_BTN_CUSTOM_DIALOG, "Open Custom Dialog");
    dlgSizer->Add(btnCustom, 0, wxALL, 5);
    dlgSizer->Add(new wxStaticText(panel, wxID_ANY,
        "Opens a modal dialog with OK/Cancel buttons"), 0, wxALL | wxALIGN_CENTER_VERTICAL, 5);

    mainSizer->Add(dlgSizer, 0, wxEXPAND | wxALL, 10);

    // Timer section
    wxStaticBox* timerBox = new wxStaticBox(panel, wxID_ANY, "wxTimer");
    wxStaticBoxSizer* timerSizer = new wxStaticBoxSizer(timerBox, wxVERTICAL);

    wxBoxSizer* timerBtnSizer = new wxBoxSizer(wxHORIZONTAL);
    wxButton* btnStart = new wxButton(panel, ID_BTN_TIMER_START, "Start Timer");
    wxButton* btnStop = new wxButton(panel, ID_BTN_TIMER_STOP, "Stop Timer");
    timerBtnSizer->Add(btnStart, 0, wxALL, 5);
    timerBtnSizer->Add(btnStop, 0, wxALL, 5);
    timerSizer->Add(timerBtnSizer, 0, wxALIGN_CENTER);

    m_timerLabel = new wxStaticText(panel, wxID_ANY, "Timer: 0");
    wxFont font = m_timerLabel->GetFont();
    font.SetPointSize(16);
    m_timerLabel->SetFont(font);
    timerSizer->Add(m_timerLabel, 0, wxALL | wxALIGN_CENTER, 10);

    mainSizer->Add(timerSizer, 0, wxEXPAND | wxALL, 10);

    // Initialize timer
    m_timer = new wxTimer(this, ID_TIMER);
    m_timerCount = 0;

    panel->SetSizer(mainSizer);
    return panel;
}

// Dialogs tab event handlers
void TestFrame::OnMsgBoxInfo(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Showing Info message box");
    wxMessageBox("This is an information message.\n\nwxMessageBox is used throughout KiCad for notifications.",
                 "Information",
                 wxOK | wxICON_INFORMATION, this);
    LogEvent("Info message box closed");
}

void TestFrame::OnMsgBoxYesNo(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Showing Yes/No message box");
    int result = wxMessageBox("Do you want to proceed?\n\nThis tests wxYES_NO style dialogs.",
                              "Confirm Action",
                              wxYES_NO | wxICON_QUESTION, this);
    LogEvent(wxString::Format("User clicked: %s", result == wxYES ? "Yes" : "No"));
}

void TestFrame::OnMsgBoxError(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Showing Error message box");
    wxMessageBox("An error has occurred!\n\nThis tests wxICON_ERROR style dialogs.",
                 "Error",
                 wxOK | wxICON_ERROR, this);
    LogEvent("Error message box closed");
}

void TestFrame::OnCustomDialog(wxCommandEvent& WXUNUSED(evt))
{
    LogEvent("Opening custom dialog");

    // Create a simple custom dialog
    wxDialog dlg(this, wxID_ANY, "Custom Dialog",
                 wxDefaultPosition, wxSize(300, 200));

    wxBoxSizer* sizer = new wxBoxSizer(wxVERTICAL);

    sizer->Add(new wxStaticText(&dlg, wxID_ANY,
        "This is a custom wxDialog.\n\n"
        "KiCad uses wxDialog extensively for\n"
        "property editors, settings panels, etc."),
        1, wxALL | wxEXPAND, 20);

    wxBoxSizer* btnSizer = new wxBoxSizer(wxHORIZONTAL);
    btnSizer->Add(new wxButton(&dlg, wxID_OK, "OK"), 0, wxALL, 5);
    btnSizer->Add(new wxButton(&dlg, wxID_CANCEL, "Cancel"), 0, wxALL, 5);
    sizer->Add(btnSizer, 0, wxALIGN_CENTER | wxBOTTOM, 10);

    dlg.SetSizer(sizer);

    int result = dlg.ShowModal();
    LogEvent(wxString::Format("Custom dialog closed with: %s",
        result == wxID_OK ? "OK" : "Cancel"));
}

void TestFrame::OnTimerStart(wxCommandEvent& WXUNUSED(evt))
{
    if (!m_timer->IsRunning()) {
        m_timer->Start(1000);  // 1 second interval
        LogEvent("Timer started (1 second interval)");
    }
}

void TestFrame::OnTimerStop(wxCommandEvent& WXUNUSED(evt))
{
    if (m_timer->IsRunning()) {
        m_timer->Stop();
        LogEvent("Timer stopped");
    }
}

void TestFrame::OnTimer(wxTimerEvent& WXUNUSED(evt))
{
    m_timerCount++;
    m_timerLabel->SetLabel(wxString::Format("Timer: %d", m_timerCount));
    LogEvent(wxString::Format("Timer tick: %d", m_timerCount));
}

//-----------------------------------------------------------------------------
// TestApp - Application class
//-----------------------------------------------------------------------------
class TestApp : public wxApp
{
public:
    virtual bool OnInit() wxOVERRIDE;
};

wxIMPLEMENT_APP(TestApp);

bool TestApp::OnInit()
{
    if (!wxApp::OnInit())
        return false;

    TestFrame* frame = new TestFrame("wxWidgets WASM Comprehensive Test");
    frame->Show(true);

    return true;
}
