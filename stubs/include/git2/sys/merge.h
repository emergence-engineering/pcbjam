/*
 * KiCad Wasm Port - libgit2 sys/merge.h Stub Header
 */

#ifndef KICAD_WASM_GIT2_SYS_MERGE_STUB_H
#define KICAD_WASM_GIT2_SYS_MERGE_STUB_H

#include "../git2.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Merge driver structures - minimal stubs */
typedef struct git_merge_driver git_merge_driver;
typedef struct git_merge_driver_source git_merge_driver_source;

typedef enum {
    GIT_MERGE_DRIVER_BINARY = 0,
    GIT_MERGE_DRIVER_TEXT = 1,
    GIT_MERGE_DRIVER_UNION = 2
} git_merge_driver_t;

/* Registration functions - stubs */
static inline int git_merge_driver_register(const char *name, git_merge_driver *driver) {
    (void)name; (void)driver;
    return GIT_ERROR;
}

static inline int git_merge_driver_unregister(const char *name) {
    (void)name;
    return GIT_ERROR;
}

#ifdef __cplusplus
}
#endif

#endif /* KICAD_WASM_GIT2_SYS_MERGE_STUB_H */
