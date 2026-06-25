#pragma once
#include <thread_pool.h> // for the `thread_pool` type returned by GetThreadPool()
// Minimal stub of kicad/include/pgm_base.h. thread_pool.cpp only needs PgmOrNull()
// (stubbed to nullptr so GetKiCadThreadPool() constructs its own real pool) and
// PGM_BASE::GetThreadPool() (referenced in the now-dead branch; never called).
class PGM_BASE
{
public:
    thread_pool& GetThreadPool();
};

PGM_BASE* PgmOrNull();
