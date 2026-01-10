/*
 * 3D Scenegraph stubs for KiCad WASM build
 * When KICAD_BUILD_3D_VIEWER_WASM=OFF, these provide stub implementations
 * for 3D cache and scenegraph classes.
 */

#include <3d_cache/3d_cache.h>
#include <3d_cache/3d_plugin_manager.h>
#include <plugins/3dapi/ifsg_all.h>
#include <wx/log.h>
#include <cmath>

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


// SGPOINT stub implementations

SGPOINT::SGPOINT() : x( 0.0 ), y( 0.0 ), z( 0.0 )
{
}

SGPOINT::SGPOINT( double aXVal, double aYVal, double aZVal ) noexcept
    : x( aXVal ), y( aYVal ), z( aZVal )
{
}

void SGPOINT::GetPoint( const double& aXVal, const double& aYVal, const double& aZVal ) noexcept
{
    (void)aXVal; (void)aYVal; (void)aZVal;
}

void SGPOINT::GetPoint( const SGPOINT& aPoint ) noexcept
{
    (void)aPoint;
}

void SGPOINT::GetPoint( const SGPOINT* aPoint ) noexcept
{
    (void)aPoint;
}

void SGPOINT::SetPoint( double aXVal, double aYVal, double aZVal ) noexcept
{
    x = aXVal; y = aYVal; z = aZVal;
}

void SGPOINT::SetPoint( const SGPOINT& aPoint ) noexcept
{
    x = aPoint.x; y = aPoint.y; z = aPoint.z;
}


// SGVECTOR stub implementations

SGVECTOR::SGVECTOR() : vx( 0.0 ), vy( 0.0 ), vz( 1.0 )
{
}

SGVECTOR::SGVECTOR( double aXVal, double aYVal, double aZVal )
    : vx( aXVal ), vy( aYVal ), vz( aZVal )
{
    normalize();
}

void SGVECTOR::GetVector( double& aXVal, double& aYVal, double& aZVal ) const noexcept
{
    aXVal = vx; aYVal = vy; aZVal = vz;
}

void SGVECTOR::SetVector( double aXVal, double aYVal, double aZVal )
{
    vx = aXVal; vy = aYVal; vz = aZVal;
    normalize();
}

void SGVECTOR::SetVector( const SGVECTOR& aVector )
{
    vx = aVector.vx; vy = aVector.vy; vz = aVector.vz;
}

SGVECTOR& SGVECTOR::operator=( const SGVECTOR& source ) noexcept
{
    vx = source.vx; vy = source.vy; vz = source.vz;
    return *this;
}

void SGVECTOR::normalize() noexcept
{
    double mag = vx*vx + vy*vy + vz*vz;
    if( mag > 1e-12 )
    {
        mag = 1.0 / sqrt( mag );
        vx *= mag; vy *= mag; vz *= mag;
    }
}


// SGCOLOR stub implementations

SGCOLOR::SGCOLOR() : red( 0.0f ), green( 0.0f ), blue( 0.0f )
{
}

SGCOLOR::SGCOLOR( float aRVal, float aGVal, float aBVal )
    : red( aRVal ), green( aGVal ), blue( aBVal )
{
}

void SGCOLOR::GetColor( float& aRedVal, float& aGreenVal, float& aBlueVal ) const noexcept
{
    aRedVal = red; aGreenVal = green; aBlueVal = blue;
}

void SGCOLOR::GetColor( SGCOLOR& aColor ) const noexcept
{
    aColor.red = red; aColor.green = green; aColor.blue = blue;
}

void SGCOLOR::GetColor( SGCOLOR* aColor ) const noexcept
{
    if( aColor ) { aColor->red = red; aColor->green = green; aColor->blue = blue; }
}

bool SGCOLOR::SetColor( float aRedVal, float aGreenVal, float aBlueVal )
{
    red = aRedVal; green = aGreenVal; blue = aBlueVal;
    return true;
}

bool SGCOLOR::SetColor( const SGCOLOR& aColor ) noexcept
{
    red = aColor.red; green = aColor.green; blue = aColor.blue;
    return true;
}

bool SGCOLOR::SetColor( const SGCOLOR* aColor ) noexcept
{
    if( aColor ) { red = aColor->red; green = aColor->green; blue = aColor->blue; return true; }
    return false;
}

bool SGCOLOR::checkRange( float aRedVal, float aGreenVal, float aBlueVal ) const noexcept
{
    (void)aRedVal; (void)aGreenVal; (void)aBlueVal;
    return true;
}


// IFSG_NODE stub implementations

IFSG_NODE::IFSG_NODE() : m_node( nullptr )
{
}

IFSG_NODE::~IFSG_NODE()
{
}

void IFSG_NODE::Destroy()
{
    m_node = nullptr;
}

SGNODE* IFSG_NODE::GetRawPtr() noexcept
{
    return m_node;
}

S3D::SGTYPES IFSG_NODE::GetNodeType() const
{
    return S3D::SGTYPE_TRANSFORM;
}

SGNODE* IFSG_NODE::GetParent() const
{
    return nullptr;
}

bool IFSG_NODE::SetParent( SGNODE* aParent )
{
    (void)aParent;
    return false;
}

const char* IFSG_NODE::GetName()
{
    return nullptr;
}

bool IFSG_NODE::SetName( const char* aName )
{
    (void)aName;
    return false;
}

const char* IFSG_NODE::GetNodeTypeName( S3D::SGTYPES aNodeType ) const
{
    (void)aNodeType;
    return "STUB";
}

SGNODE* IFSG_NODE::FindNode( const char* aNodeName )
{
    (void)aNodeName;
    return nullptr;
}

bool IFSG_NODE::AddRefNode( SGNODE* aNode )
{
    (void)aNode;
    return false;
}

bool IFSG_NODE::AddRefNode( IFSG_NODE& aNode )
{
    (void)aNode;
    return false;
}

bool IFSG_NODE::AddChildNode( SGNODE* aNode )
{
    (void)aNode;
    return false;
}

bool IFSG_NODE::AddChildNode( IFSG_NODE& aNode )
{
    (void)aNode;
    return false;
}


// IFSG_TRANSFORM stub implementations

IFSG_TRANSFORM::IFSG_TRANSFORM( bool create ) : IFSG_NODE()
{
    (void)create;
}

IFSG_TRANSFORM::IFSG_TRANSFORM( SGNODE* aParent ) : IFSG_NODE()
{
    (void)aParent;
}

bool IFSG_TRANSFORM::Attach( SGNODE* aNode )
{
    (void)aNode;
    return false;
}

bool IFSG_TRANSFORM::NewNode( SGNODE* aParent )
{
    (void)aParent;
    return false;
}

bool IFSG_TRANSFORM::NewNode( IFSG_NODE& aParent )
{
    (void)aParent;
    return false;
}

bool IFSG_TRANSFORM::SetScaleOrientation( const SGVECTOR& aScaleAxis, double aAngle )
{
    (void)aScaleAxis; (void)aAngle;
    return false;
}

bool IFSG_TRANSFORM::SetRotation( const SGVECTOR& aRotationAxis, double aAngle )
{
    (void)aRotationAxis; (void)aAngle;
    return false;
}

bool IFSG_TRANSFORM::SetScale( const SGPOINT& aScale ) noexcept
{
    (void)aScale;
    return false;
}

bool IFSG_TRANSFORM::SetScale( double aScale )
{
    (void)aScale;
    return false;
}

bool IFSG_TRANSFORM::SetCenter( const SGPOINT& aCenter ) noexcept
{
    (void)aCenter;
    return false;
}

bool IFSG_TRANSFORM::SetTranslation( const SGPOINT& aTranslation ) noexcept
{
    (void)aTranslation;
    return false;
}


// S3D namespace stub implementations

namespace S3D
{

bool WriteVRML( const char* filename, bool overwrite, SGNODE* aTopNode,
                bool reuse, bool renameNodes )
{
    (void)filename; (void)overwrite; (void)aTopNode;
    (void)reuse; (void)renameNodes;
    return false;
}

SGNODE* GetSGNodeParent( SGNODE* aNode )
{
    (void)aNode;
    return nullptr;
}

void DestroyNode( SGNODE* aNode ) noexcept
{
    (void)aNode;
}

}  // namespace S3D
