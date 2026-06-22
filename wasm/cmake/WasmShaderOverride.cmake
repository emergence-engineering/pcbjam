# WASM shader override.
#
# Redefines add_shader() to convert GLSL 1.20 -> GLSL ES 3.0 before embedding the shader as a
# C++ string, so common/gal/CMakeLists.txt's unconditional add_shader() calls produce ES3
# shaders on Emscripten while native keeps the upstream GLSL-1.20 path. The later definition
# wins, so this file must be include()d AFTER upstream's add_shader() definition and BEFORE the
# add_shader() calls. (Same conversion as tests/gal-regression/wasm/generate_shaders.py.)
#
# include()d (not add_subdirectory'd) from common/gal/CMakeLists.txt, so ${CMAKE_CURRENT_SOURCE_DIR}
# / ${CMAKE_CURRENT_BINARY_DIR} below resolve to that directory, exactly as the inline fork did.

find_program( PYTHON3_EXECUTABLE python3 REQUIRED )

function( add_shader outTarget inFile shaderName )
    # Determine shader type from filename
    string(FIND "${inFile}" "frag" _is_frag)
    if(_is_frag GREATER -1)
        set(SHADER_TYPE "fragment")
    else()
        set(SHADER_TYPE "vertex")
    endif()

    set(es3GlslFile "${CMAKE_CURRENT_BINARY_DIR}/${shaderName}_es3.glsl")
    set(outCppName "${shaderName}.cpp")
    set(outHeaderName "${shaderName}.h")

    # Step 1: Convert GLSL 120 -> ES 3.0
    add_custom_command(
        OUTPUT ${es3GlslFile}
        COMMAND ${PYTHON3_EXECUTABLE}
            ${CMAKE_CURRENT_SOURCE_DIR}/shaders/convert_glsl_es3.py
            ${CMAKE_CURRENT_SOURCE_DIR}/shaders/${inFile}
            ${es3GlslFile}
            ${SHADER_TYPE}
        DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/shaders/${inFile}
                ${CMAKE_CURRENT_SOURCE_DIR}/shaders/convert_glsl_es3.py
    )

    # Step 2: Embed as C++ string (same as native path)
    add_custom_command(
        OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/${outCppName}
               ${CMAKE_BINARY_DIR}/include/gal/shaders/${outHeaderName}
        COMMAND ${CMAKE_COMMAND}
            -DSOURCE_FILE="${es3GlslFile}"
            -DOUT_CPP_DIR="${CMAKE_CURRENT_BINARY_DIR}/"
            -DOUT_HEADER_DIR="${CMAKE_BINARY_DIR}/include/gal/shaders/"
            -DOUT_CPP_FILENAME="${outCppName}"
            -DOUT_HEADER_FILENAME="${outHeaderName}"
            -DOUT_VAR_NAME="${shaderName}"
            -P ${KICAD_CMAKE_MODULE_PATH}/BuildSteps/CreateShaderCpp.cmake
        DEPENDS ${es3GlslFile}
    )

    target_sources( ${outTarget} PRIVATE ${CMAKE_CURRENT_BINARY_DIR}/${outCppName} )
    target_include_directories( ${outTarget} PUBLIC ${CMAKE_BINARY_DIR}/include/gal/shaders/ )
endfunction()
