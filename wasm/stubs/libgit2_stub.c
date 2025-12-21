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

/* Index operations */
int git_repository_index(void **out, void *repo) {
    (void)repo;
    *out = NULL;
    return -1;
}

int git_index_add_bypath(void *index, const char *path) {
    (void)index;
    (void)path;
    return -1;
}

int git_index_write(void *index) {
    (void)index;
    return -1;
}

int git_index_write_tree(void *out, void *index) {
    (void)out;
    (void)index;
    return -1;
}

void git_index_free(void *index) {
    (void)index;
}

/* Reference name to ID */
int git_reference_name_to_id(void *out, void *repo, const char *name) {
    (void)out;
    (void)repo;
    (void)name;
    return -1;
}

/* Commit operations */
int git_commit_lookup(void **out, void *repo, const void *id) {
    (void)repo;
    (void)id;
    *out = NULL;
    return -1;
}

int git_commit_tree(void **out, const void *commit) {
    (void)commit;
    *out = NULL;
    return -1;
}

int git_commit_create(void *id, void *repo, const char *update_ref,
                      const void *author, const void *committer,
                      const char *encoding, const char *message,
                      const void *tree, size_t parent_count, const void **parents) {
    (void)id; (void)repo; (void)update_ref;
    (void)author; (void)committer;
    (void)encoding; (void)message;
    (void)tree; (void)parent_count; (void)parents;
    return -1;
}

void git_commit_free(void *commit) {
    (void)commit;
}

/* Tree operations */
int git_tree_lookup(void **out, void *repo, const void *id) {
    (void)repo;
    (void)id;
    *out = NULL;
    return -1;
}

void git_tree_free(void *tree) {
    (void)tree;
}

/* Diff operations */
int git_diff_tree_to_tree(void **diff, void *repo, void *old_tree, void *new_tree, const void *opts) {
    (void)repo;
    (void)old_tree;
    (void)new_tree;
    (void)opts;
    *diff = NULL;
    return -1;
}

size_t git_diff_num_deltas(const void *diff) {
    (void)diff;
    return 0;
}

void git_diff_free(void *diff) {
    (void)diff;
}

/* Signature operations */
int git_signature_now(void **out, const char *name, const char *email) {
    (void)name;
    (void)email;
    *out = NULL;
    return -1;
}

void git_signature_free(void *sig) {
    (void)sig;
}

/* Additional functions needed by local_history.cpp */

char* git_oid_tostr_s(const void *oid) {
    (void)oid;
    return "";  /* Return empty string - static buffer not needed for stub */
}

int git_diff_tree_to_index(void **diff, void *repo, void *old_tree, void *index, const void *opts) {
    (void)repo;
    (void)old_tree;
    (void)index;
    (void)opts;
    *diff = NULL;
    return -1;
}

const void* git_diff_get_delta(const void *diff, size_t idx) {
    (void)diff;
    (void)idx;
    return NULL;
}

int git_patch_from_diff(void **out, void *diff, size_t idx) {
    (void)diff;
    (void)idx;
    *out = NULL;
    return -1;
}

int git_patch_line_stats(size_t *total_context, size_t *total_additions, size_t *total_deletions, const void *patch) {
    (void)patch;
    if (total_context) *total_context = 0;
    if (total_additions) *total_additions = 0;
    if (total_deletions) *total_deletions = 0;
    return 0;
}

void git_patch_free(void *patch) {
    (void)patch;
}

int git_repository_init(void **out, const char *path, unsigned int is_bare) {
    (void)path;
    (void)is_bare;
    *out = NULL;
    return -1;
}

int git_reference_lookup(void **out, void *repo, const char *name) {
    (void)repo;
    (void)name;
    *out = NULL;
    return -1;
}

int git_object_lookup(void **out, void *repo, const void *id, int type) {
    (void)repo;
    (void)id;
    (void)type;
    *out = NULL;
    return -1;
}

int git_tag_create_lightweight(void *oid, void *repo, const char *tag_name, const void *target, int force) {
    (void)oid;
    (void)repo;
    (void)tag_name;
    (void)target;
    (void)force;
    return -1;
}

void git_object_free(void *object) {
    (void)object;
}

int git_reference_delete(void *ref) {
    (void)ref;
    return -1;
}

/* Git config operations */
int git_config_open_default(void **out) {
    *out = NULL;
    return -1;
}

int git_config_get_entry(void **out, const void *cfg, const char *name) {
    (void)cfg;
    (void)name;
    *out = NULL;
    return -1;
}

void git_config_entry_free(void *entry) {
    (void)entry;
}

void git_config_free(void *cfg) {
    (void)cfg;
}
