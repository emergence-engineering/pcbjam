# Findnng.cmake - Stub for WASM builds
# nng (NanoMsg Next Gen) is used for IPC in KiCad
# For WASM builds, we stub this out as IPC works differently in the browser

if(EMSCRIPTEN)
    message(STATUS "nng stubbed for WASM build (IPC handled differently in browser)")

    # Set variables to indicate nng is "found" (stubbed)
    set(NNG_FOUND TRUE)
    set(nng_FOUND TRUE)
    set(NNG_LIBRARY "")
    set(NNG_LIBRARIES "")
    set(NNG_INCLUDE_DIR "")
    set(NNG_INCLUDE_DIRS "")

    # Create an imported target for nng
    if(NOT TARGET nng::nng)
        add_library(nng::nng INTERFACE IMPORTED)
    endif()

    mark_as_advanced(
        NNG_FOUND
        NNG_LIBRARY
        NNG_INCLUDE_DIR
    )
else()
    # For non-WASM builds, use the system Findnng or search for it
    find_path(NNG_INCLUDE_DIR nng/nng.h)
    find_library(NNG_LIBRARY NAMES nng)

    include(FindPackageHandleStandardArgs)
    find_package_handle_standard_args(nng DEFAULT_MSG NNG_LIBRARY NNG_INCLUDE_DIR)

    if(NNG_FOUND AND NOT TARGET nng::nng)
        add_library(nng::nng UNKNOWN IMPORTED)
        set_target_properties(nng::nng PROPERTIES
            IMPORTED_LOCATION "${NNG_LIBRARY}"
            INTERFACE_INCLUDE_DIRECTORIES "${NNG_INCLUDE_DIR}"
        )
    endif()
endif()
