/* libgit2 stub for WebAssembly builds
 * Git functionality is not available in browser, but KiCad needs these symbols
 */

#include <stddef.h>

/* Error handling */
typedef struct {
    char *message;
    int klass;
} git_error;

static git_error stub_error = { "Git not available in WebAssembly", 0 };

int git_libgit2_init(void) {
    return 1;  /* Return 1 to indicate "initialized" */
}

int git_libgit2_shutdown(void) {
    return 0;
}

const git_error* git_error_last(void) {
    return &stub_error;
}

/* Repository operations - all return failure */
int git_repository_open(void **out, const char *path) {
    *out = NULL;
    return -1;
}

int git_repository_head(void **out, void *repo) {
    *out = NULL;
    return -1;
}

void git_repository_free(void *repo) {
    (void)repo;
}

/* Reference operations */
const void* git_reference_target(const void *ref) {
    (void)ref;
    return NULL;
}

void git_reference_free(void *ref) {
    (void)ref;
}

/* OID operations */
char* git_oid_tostr(char *out, size_t n, const void *id) {
    if (out && n > 0) {
        out[0] = '\0';
    }
    return out;
}

int git_oid_cmp(const void *a, const void *b) {
    (void)a;
    (void)b;
    return 0;
}
