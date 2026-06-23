/*
 * WASM implementation of kiplatform/policy.h
 * Policies are not configured in browser environment
 */

#include <kiplatform/policy.h>
#include <wx/string.h>
#include <optional>

namespace KIPLATFORM
{
namespace POLICY
{

PBOOL GetPolicyBool( const wxString& aKey )
{
    // No enterprise policies in browser environment
    return PBOOL::NOT_CONFIGURED;
}

std::optional<std::uint32_t> GetPolicyEnumUInt( const wxString& aKey )
{
    // No enterprise policies in browser environment
    return std::nullopt;
}

} // namespace POLICY
} // namespace KIPLATFORM
