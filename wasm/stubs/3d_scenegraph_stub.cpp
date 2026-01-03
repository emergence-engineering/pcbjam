/*
 * 3D Scenegraph stubs for KiCad WASM build
 * When KICAD_BUILD_3D_VIEWER_WASM=OFF, these provide stub implementations
 * for 3D cache and scenegraph classes.
 */

#include <3d_cache/3d_cache.h>
#include <3d_cache/3d_plugin_manager.h>
#include <wx/log.h>

// S3D_CACHE stub implementations

S3D_CACHE::S3D_CACHE() :
    m_FNResolver( nullptr ),
    m_Plugins( nullptr ),
    m_project( nullptr )
{
}

S3D_CACHE::~S3D_CACHE()
{
}

bool S3D_CACHE::Set3DConfigDir( const wxString& aConfigDir )
{
    m_ConfigDir = aConfigDir;
    return true;
}

bool S3D_CACHE::SetProject( PROJECT* aProject )
{
    m_project = aProject;
    return true;
}

void S3D_CACHE::SetProgramBase( PGM_BASE* aBase )
{
    (void)aBase;
    // No-op: 3D cache not available in WASM
}

SCENEGRAPH* S3D_CACHE::Load( const wxString& aModelFile, const wxString& aBasePath,
                              std::vector<const EMBEDDED_FILES*> aEmbeddedFilesStack )
{
    (void)aModelFile;
    (void)aBasePath;
    (void)aEmbeddedFilesStack;
    // 3D models not supported in WASM
    return nullptr;
}

FILENAME_RESOLVER* S3D_CACHE::GetResolver() noexcept
{
    return m_FNResolver;
}

std::list<wxString> const* S3D_CACHE::GetFileFilters() const
{
    static std::list<wxString> emptyList;
    return &emptyList;
}

void S3D_CACHE::FlushCache( bool closePlugins )
{
    (void)closePlugins;
    // No-op: no cache in WASM
}

void S3D_CACHE::ClosePlugins()
{
    // No-op: no plugins in WASM
}

S3DMODEL* S3D_CACHE::GetModel( const wxString& aModelFileName, const wxString& aBasePath,
                                std::vector<const EMBEDDED_FILES*> aEmbeddedFilesStack )
{
    (void)aModelFileName;
    (void)aBasePath;
    (void)aEmbeddedFilesStack;
    // 3D models not supported in WASM
    return nullptr;
}

void S3D_CACHE::CleanCacheDir( int aNumDaysOld )
{
    (void)aNumDaysOld;
    // No-op: no cache in WASM
}

SCENEGRAPH* S3D_CACHE::checkCache( const wxString& aFileName, S3D_CACHE_ENTRY** aCachePtr )
{
    (void)aFileName;
    if( aCachePtr )
        *aCachePtr = nullptr;
    return nullptr;
}

bool S3D_CACHE::getHash( const wxString& aFileName, HASH_128& aHash )
{
    (void)aFileName;
    (void)aHash;
    return false;
}

bool S3D_CACHE::loadCacheData( S3D_CACHE_ENTRY* aCacheItem )
{
    (void)aCacheItem;
    return false;
}

bool S3D_CACHE::saveCacheData( S3D_CACHE_ENTRY* aCacheItem )
{
    (void)aCacheItem;
    return false;
}

SCENEGRAPH* S3D_CACHE::load( const wxString& aModelFile, const wxString& aBasePath,
                              S3D_CACHE_ENTRY** aCachePtr,
                              std::vector<const EMBEDDED_FILES*> aEmbeddedFilesStack )
{
    (void)aModelFile;
    (void)aBasePath;
    (void)aEmbeddedFilesStack;
    if( aCachePtr )
        *aCachePtr = nullptr;
    return nullptr;
}
