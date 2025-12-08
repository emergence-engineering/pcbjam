/*
 * WASM implementation of printing.h
 * Printing is not directly supported in browser environment
 */

#include <printing.h>
#include <string>

namespace KIPLATFORM
{
namespace PRINTING
{

PRINT_RESULT PrintPDF( const std::string& aFile )
{
    // Direct printing is not supported in browser
    // User can use browser's print functionality or download the PDF
    return PRINT_RESULT::UNSUPPORTED;
}

} // namespace PRINTING
} // namespace KIPLATFORM
