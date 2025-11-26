/*
 * KiCad Wasm Port - libgit2 sys/errors.h Stub Header
 */

#ifndef KICAD_WASM_GIT2_SYS_ERRORS_STUB_H
#define KICAD_WASM_GIT2_SYS_ERRORS_STUB_H

#include "../git2.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Error setting functions - stubs */
static inline void git_error_set_str(int error_class, const char *string) {
    (void)error_class; (void)string;
}

static inline void git_error_set(int error_class, const char *fmt, ...) {
    (void)error_class; (void)fmt;
}

#ifdef __cplusplus
}
#endif

#endif /* KICAD_WASM_GIT2_SYS_ERRORS_STUB_H */
