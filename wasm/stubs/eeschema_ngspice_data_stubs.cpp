/*
 * Empty replacements for the four largest ngspice model data initializers.
 *
 * Each of sim_model_ngspice_data_{bsim4,b3soi,b4soi,hsim}.cpp defines a
 * single function (addBSIM4/addB3SOI/addB4SOI/addHSIM) that pushes hundreds
 * of entries into NGSPICE_MODEL_INFO_MAP::modelInfos[...]. Once compiled to
 * WASM these functions exceed the V8/SpiderMonkey limit on locals per
 * function ("too many locals"), so Firefox refuses to instantiate the
 * resulting module.
 *
 * The simulator UI is never reachable in the WASM build (FRAME_SIMULATOR
 * fails to instantiate via the ngspice header stub at
 * wasm/stubs/ngspice/sharedspice.h), so leaving these tables empty is safe.
 *
 * eeschema/CMakeLists.txt excludes the original four sources from
 * EESCHEMA_SIM_SRCS for EMSCRIPTEN and adds this file instead.
 */

#ifdef __EMSCRIPTEN__

#include <sim/sim_model_ngspice.h>

void NGSPICE_MODEL_INFO_MAP::addBSIM4() {}
void NGSPICE_MODEL_INFO_MAP::addB3SOI() {}
void NGSPICE_MODEL_INFO_MAP::addB4SOI() {}
void NGSPICE_MODEL_INFO_MAP::addHSIM()  {}

#endif // __EMSCRIPTEN__
