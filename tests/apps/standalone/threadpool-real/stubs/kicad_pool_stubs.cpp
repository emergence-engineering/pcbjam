// Definitions for the minimal pgm_base / advanced_config stubs (see ./pgm_base.h,
// ./advanced_config.h). They let kicad/common/thread_pool.cpp compile and link
// standalone while still constructing the REAL BS::priority_thread_pool.
#include <advanced_config.h>
#include <pgm_base.h>

#include <cstdlib>

// No PGM_BASE in this standalone test -> GetKiCadThreadPool() takes the
// `new thread_pool( num_threads )` branch (num_threads=0 -> hardware_concurrency()).
PGM_BASE* PgmOrNull()
{
    return nullptr;
}

// Referenced by thread_pool.cpp inside `if( PgmOrNull() )`, which is never taken here;
// must link but is never executed.
thread_pool& PGM_BASE::GetThreadPool()
{
    std::abort();
}

static const ADVANCED_CFG g_advancedCfgStub;

const ADVANCED_CFG& ADVANCED_CFG::GetCfg()
{
    return g_advancedCfgStub;
}
