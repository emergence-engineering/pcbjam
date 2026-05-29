/*
 * libc++ workaround: provide std::char_traits<unsigned short> for WASM builds.
 *
 * KiCad's third-party Altium parser uses
 *     typedef std::basic_string<uint16_t> utf16string;
 * (kicad/thirdparty/compoundfilereader/compoundfilereader.h:264).
 *
 * Modern libc++ (the version bundled with current Emscripten) pulls
 * <__format/parser_std_format_spec.h> via <vector>, which triggers implicit
 * instantiation of char_traits<unsigned short>. The standard only specializes
 * char_traits for char / wchar_t / char8_t / char16_t / char32_t, so the
 * uint16_t (== unsigned short) usage now fails to compile.
 *
 * We force-include this header into every translation unit via the build
 * script's CMAKE_CXX_FLAGS so the specialization is visible before any code
 * that needs it. Specializing std::char_traits for non-standard types is
 * technically undefined per the standard but is the established workaround
 * historically supported by libc++/libstdc++.
 */

#ifndef KICAD_WASM_CHAR_TRAITS_UINT16_WORKAROUND_H
#define KICAD_WASM_CHAR_TRAITS_UINT16_WORKAROUND_H

#ifdef __cplusplus
#ifdef __EMSCRIPTEN__

#include <cstddef>
#include <cstring>
#include <cwchar>
#include <ios>

namespace std {

template<>
struct char_traits<unsigned short>
{
    using char_type  = unsigned short;
    using int_type   = int;
    using off_type   = streamoff;
    using pos_type   = fpos<mbstate_t>;
    using state_type = mbstate_t;

    static constexpr void assign( char_type& a, const char_type& b ) noexcept { a = b; }
    static constexpr bool eq( char_type a, char_type b ) noexcept { return a == b; }
    static constexpr bool lt( char_type a, char_type b ) noexcept { return a < b; }

    static int compare( const char_type* s1, const char_type* s2, size_t n )
    {
        for( size_t i = 0; i < n; ++i )
        {
            if( s1[i] < s2[i] ) return -1;
            if( s1[i] > s2[i] ) return 1;
        }
        return 0;
    }

    static size_t length( const char_type* s )
    {
        size_t i = 0;
        while( s[i] != 0 ) ++i;
        return i;
    }

    static const char_type* find( const char_type* s, size_t n, const char_type& a )
    {
        for( size_t i = 0; i < n; ++i )
            if( s[i] == a ) return s + i;
        return nullptr;
    }

    static char_type* move( char_type* s1, const char_type* s2, size_t n )
    {
        return static_cast<char_type*>( memmove( s1, s2, n * sizeof( char_type ) ) );
    }

    static char_type* copy( char_type* s1, const char_type* s2, size_t n )
    {
        return static_cast<char_type*>( memcpy( s1, s2, n * sizeof( char_type ) ) );
    }

    static char_type* assign( char_type* s, size_t n, char_type a )
    {
        for( size_t i = 0; i < n; ++i ) s[i] = a;
        return s;
    }

    static constexpr int_type not_eof( int_type c ) noexcept
    {
        return c == eof() ? static_cast<int_type>( 0 ) : c;
    }

    static constexpr char_type to_char_type( int_type c ) noexcept
    {
        return static_cast<char_type>( c );
    }

    static constexpr int_type to_int_type( char_type c ) noexcept
    {
        return static_cast<int_type>( c );
    }

    static constexpr bool eq_int_type( int_type a, int_type b ) noexcept { return a == b; }
    static constexpr int_type eof() noexcept { return static_cast<int_type>( -1 ); }
};

} // namespace std

#endif // __EMSCRIPTEN__
#endif // __cplusplus

#endif // KICAD_WASM_CHAR_TRAITS_UINT16_WORKAROUND_H
