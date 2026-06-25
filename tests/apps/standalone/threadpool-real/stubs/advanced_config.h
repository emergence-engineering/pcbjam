#pragma once
// Minimal stub of kicad/include/advanced_config.h. thread_pool.cpp only reads
// ADVANCED_CFG::GetCfg().m_MaximumThreads; 0 => the pool uses hardware_concurrency().
struct ADVANCED_CFG
{
    int                        m_MaximumThreads = 0;
    static const ADVANCED_CFG& GetCfg();
};
