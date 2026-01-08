# Makefile for GAL WebGL Test (WASM)
#
# Builds WEBGL_GAL (ported from OPENGL_GAL) using wxWidgets WASM build.
# Uses pure WebGL 2.0 / OpenGL ES 3.0 (no LEGACY_GL_EMULATION).
#
# Usage:
#   make                    # Build
#   make clean              # Clean build artifacts
#   make DEBUG=1            # Debug build with source maps

CXX = em++

# Paths relative to this Makefile
PROJECT_ROOT = ../../..
KICAD_ROOT = $(PROJECT_ROOT)/kicad
WX_BUILD = $(PROJECT_ROOT)/build-wasm/wxwidgets-universal
TOOLS_ROOT = $(PROJECT_ROOT)/wxwidgets/build/wasm

# Output directory
OUTPUT_DIR = ../../apps/gal-webgl

# wx-config for wxWidgets WASM
WXCONFIG = $(WX_BUILD)/wx-config
WX_CXXFLAGS := $(shell $(WXCONFIG) --cxxflags)
WX_LDFLAGS := $(shell $(WXCONFIG) --libs base,core,gl)

# Sysroot (contains boost, etc.)
SYSROOT = $(PROJECT_ROOT)/build-wasm/sysroot

# KiCad include paths
# Note: -I../native provides stub files (config.h, kicad_stubs.h, etc.)
# Note: -I../scenarios provides shared test scenarios (gal_test_scenarios.h)
KICAD_INCLUDES = -I../native \
                 -I../scenarios \
                 -Igenerated \
                 -I$(KICAD_ROOT)/include \
                 -I$(KICAD_ROOT)/include/gal \
                 -I$(KICAD_ROOT)/include/gal/opengl \
                 -I$(KICAD_ROOT)/common \
                 -I$(KICAD_ROOT)/libs/kimath/include \
                 -I$(KICAD_ROOT)/libs/kiplatform/include \
                 -I$(KICAD_ROOT)/libs/core/include \
                 -I$(KICAD_ROOT)/thirdparty/glm \
                 -I$(KICAD_ROOT)/thirdparty/nlohmann_json \
                 -I$(KICAD_ROOT)/thirdparty/thread-pool \
                 -I$(KICAD_ROOT)/thirdparty/clipper2/Clipper2Lib/include \
                 -I$(SYSROOT)/include \
                 -Iwebgl

# Debug or Release build
ifdef DEBUG
    OPT_FLAGS = -g -O0
    DEBUG_LDFLAGS = -g -gsource-map
else
    OPT_FLAGS = -O2
    DEBUG_LDFLAGS =
endif

CXXFLAGS = $(OPT_FLAGS) $(WX_CXXFLAGS) $(KICAD_INCLUDES) -std=c++20

# Emscripten flags
BASE_LDFLAGS = -sALLOW_MEMORY_GROWTH=1 \
               -sERROR_ON_UNDEFINED_SYMBOLS=0 \
               -sNO_DISABLE_EXCEPTION_CATCHING \
               -sEXPORTED_FUNCTIONS=['_main','_runScenario','_getTotalScenarios','_getCurrentScenario','_getCanvasWidth','_getCanvasHeight'] \
               -sEXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPU8'] \
               -sMODULARIZE=1 \
               -sEXPORT_NAME='createGALTest' \
               -sENVIRONMENT=web

# GL-specific flags - WebGL 2.0 with full ES3 support
# No LEGACY_GL_EMULATION - WEBGL_GAL uses VBOs and custom shaders
EM_GL_FLAGS = -sFULL_ES3=1 -sMAX_WEBGL_VERSION=2

# Legacy GL stubs for wxWidgets compatibility
# wxWidgets GL library may reference legacy functions at runtime, but actual
# rendering uses WEBGL_GAL which only uses modern WebGL 2.0 APIs
# Use absolute path to ensure the library is found
MAKEFILE_DIR := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
LEGACY_GL_STUBS = --js-library=$(MAKEFILE_DIR)legacy_gl_stubs.js

LDFLAGS = $(DEBUG_LDFLAGS) $(BASE_LDFLAGS) $(EM_GL_FLAGS) $(LEGACY_GL_STUBS) $(WX_LDFLAGS)

# Templates
JS = $(TOOLS_ROOT)/wx.js
HTML_TEMPLATE = $(TOOLS_ROOT)/template.html

# Source files
MAIN_SRCS = gal_webgl_test.cpp wasm_stubs.cpp

# KiCad sources needed for linking (not in WEBGL_SRCS)
KICAD_SRCS = $(KICAD_ROOT)/common/gal/hidpi_gl_canvas.cpp \
             $(KICAD_ROOT)/common/gal/graphics_abstraction_layer.cpp \
             $(KICAD_ROOT)/common/gal/gal_display_options.cpp

# Test scenario sources (shared with native test)
SCENARIO_SRCS = ../scenarios/gal_test_scenarios.cpp

# GLU tesselator - stub (no actual implementation needed for basic shapes)
GLU_SRCS =

# Generated shader sources (from generate_shaders.py)
SHADER_SRCS = generated/glsl_kicad_frag.cpp \
              generated/glsl_kicad_vert.cpp \
              generated/glsl_smaa_base.cpp \
              generated/glsl_smaa_pass_1_frag_color.cpp \
              generated/glsl_smaa_pass_1_frag_luma.cpp \
              generated/glsl_smaa_pass_1_vert.cpp \
              generated/glsl_smaa_pass_2_frag.cpp \
              generated/glsl_smaa_pass_2_vert.cpp \
              generated/glsl_smaa_pass_3_frag.cpp \
              generated/glsl_smaa_pass_3_vert.cpp

# WebGL GAL sources (ported from OpenGL GAL)
WEBGL_SRCS = webgl/webgl_gal.cpp \
             webgl/vertex_manager.cpp \
             webgl/vertex_container.cpp \
             webgl/vertex_item.cpp \
             webgl/gpu_manager.cpp \
             webgl/noncached_container.cpp \
             webgl/cached_container.cpp \
             webgl/cached_container_gpu.cpp \
             webgl/cached_container_ram.cpp \
             webgl/shader.cpp \
             webgl/webgl_compositor.cpp \
             webgl/fullscreen_quad.cpp \
             webgl/utils.cpp \
             webgl/gl_context_mgr.cpp \
             webgl/gl_resources.cpp \
             webgl/webgl_antialiasing.cpp

SRCS = $(MAIN_SRCS) $(KICAD_SRCS) $(SCENARIO_SRCS) $(GLU_SRCS) $(SHADER_SRCS) $(WEBGL_SRCS)
OBJS = $(SRCS:.cpp=.o)

# Target
TARGET = $(OUTPUT_DIR)/gal_webgl_test.js

all: $(OUTPUT_DIR) $(TARGET)

$(OUTPUT_DIR):
	mkdir -p $(OUTPUT_DIR)

%.o: %.cpp
	$(CXX) -c $(CXXFLAGS) $< -o $@

$(TARGET): $(OBJS)
	$(CXX) $(OBJS) $(LDFLAGS) --pre-js $(JS) -o $@
	cp gal_webgl_test.html $(OUTPUT_DIR)/

clean:
	rm -f $(OBJS)
	rm -f $(OUTPUT_DIR)/gal_webgl_test.js
	rm -f $(OUTPUT_DIR)/gal_webgl_test.wasm
	rm -f $(OUTPUT_DIR)/gal_webgl_test.html

.PHONY: all clean
