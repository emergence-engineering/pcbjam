/**
 * Thread Pool Deadlock Test
 *
 * This test replicates KiCad's pattern of creating hardware_concurrency() threads.
 * When PTHREAD_POOL_SIZE < hardware_concurrency(), this should deadlock because:
 * 1. Threads 1-N use pre-warmed Web Workers
 * 2. Thread N+1 needs new Web Worker (posts to event loop)
 * 3. Main thread busy-waits for thread to start
 * 4. Busy-wait blocks event loop -> Worker message never processed
 * 5. DEADLOCK
 */

#include "wx/wx.h"
#include <thread>
#include <vector>
#include <atomic>
#include <chrono>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

class ThreadPoolFrame : public wxFrame
{
public:
    ThreadPoolFrame()
        : wxFrame(nullptr, wxID_ANY, "Thread Pool Deadlock Test",
                  wxDefaultPosition, wxSize(800, 600))
    {
        // Log hardware_concurrency - this is what KiCad uses to determine thread count
        int num_threads = std::thread::hardware_concurrency();

#ifdef __EMSCRIPTEN__
        EM_ASM({
            console.log('[THREADPOOL] hardware_concurrency: ' + $0);
        }, num_threads);
#endif
        printf("[THREADPOOL] hardware_concurrency: %d\n", num_threads);

        // Replicate KiCad's exact pattern: create hardware_concurrency() threads
        // in the constructor (like BS::priority_thread_pool does)
        printf("[THREADPOOL] Creating %d threads (like KiCad's BS::priority_thread_pool)...\n", num_threads);

#ifdef __EMSCRIPTEN__
        EM_ASM({
            console.log('[THREADPOOL] Creating ' + $0 + ' threads...');
        }, num_threads);
#endif

        std::vector<std::thread> threads;
        std::vector<std::atomic<bool>> started(num_threads);

        for (int i = 0; i < num_threads; i++) {
            started[i] = false;

            printf("[THREADPOOL] Creating thread %d\n", i);
#ifdef __EMSCRIPTEN__
            EM_ASM({
                console.log('[THREADPOOL] Creating thread ' + $0);
            }, i);
#endif

            threads.emplace_back([i, &started]() {
                started[i] = true;
#ifdef __EMSCRIPTEN__
                EM_ASM({
                    console.log('[THREADPOOL] Thread ' + $0 + ' started');
                }, i);
#endif
                // Simulate some work
                std::this_thread::sleep_for(std::chrono::milliseconds(10));
            });
        }

        printf("[THREADPOOL] All threads created, waiting for completion...\n");
#ifdef __EMSCRIPTEN__
        EM_ASM({
            console.log('[THREADPOOL] All threads created, waiting for completion...');
        });
#endif

        // Join all threads (this is what thread pool destructor does)
        for (auto& t : threads) {
            t.join();
        }

        printf("[THREADPOOL] SUCCESS - All %d threads completed!\n", num_threads);
#ifdef __EMSCRIPTEN__
        EM_ASM({
            console.log('[THREADPOOL] SUCCESS - All threads completed!');
        });
#endif

        // Create simple UI to show success
        wxPanel* panel = new wxPanel(this);
        wxBoxSizer* sizer = new wxBoxSizer(wxVERTICAL);

        wxString msg = wxString::Format(
            "Thread Pool Test PASSED!\n\n"
            "Created and joined %d threads successfully.\n\n"
            "This test replicates KiCad's BS::priority_thread_pool pattern.\n"
            "If you see this message, the deadlock did NOT occur.",
            num_threads
        );

        wxStaticText* label = new wxStaticText(panel, wxID_ANY, msg,
            wxDefaultPosition, wxDefaultSize, wxALIGN_CENTER);
        label->SetFont(wxFont(14, wxFONTFAMILY_DEFAULT, wxFONTSTYLE_NORMAL, wxFONTWEIGHT_NORMAL));

        sizer->AddStretchSpacer();
        sizer->Add(label, 0, wxALIGN_CENTER | wxALL, 20);
        sizer->AddStretchSpacer();

        panel->SetSizer(sizer);
        CreateStatusBar();
        SetStatusText(wxString::Format("SUCCESS: %d threads created and joined", num_threads));
    }
};

class ThreadPoolApp : public wxApp
{
public:
    virtual bool OnInit() override
    {
        printf("[THREADPOOL] App OnInit starting\n");
#ifdef __EMSCRIPTEN__
        EM_ASM({
            console.log('[THREADPOOL] App OnInit starting');
        });
#endif

        ThreadPoolFrame* frame = new ThreadPoolFrame();
        frame->Show();

        printf("[THREADPOOL] App OnInit complete\n");
#ifdef __EMSCRIPTEN__
        EM_ASM({
            console.log('[THREADPOOL] App OnInit complete');
        });
#endif

        return true;
    }
};

wxIMPLEMENT_APP(ThreadPoolApp);
