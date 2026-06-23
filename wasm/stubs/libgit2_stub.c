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

/* ============================================================================
 * KiCad 10 rebase: additional libgit2 stubs.
 *
 * KiCad 10 restructured its git backend (git/git_backend.cpp,
 * git/libgit_backend.cpp) and added text_eval/text_eval_vcs.cpp (VCS text
 * variables), which call libgit2 functions not covered by the stubs above.
 * These no-op / failure-returning definitions let the WASM build link; git is
 * non-functional in the browser, so callers see "no repository / failure".
 *
 * Signatures use generic types (pointers -> void*, enums/callbacks -> int) to
 * keep the wasm function types compatible with the real callers without
 * pulling in git2.h. Generated from the libgit2 1.7.1 headers.
 * ============================================================================ */
int git_annotated_commit_from_ref(void **out, void *repo, const void *ref) { return -1; }
const void * git_annotated_commit_id(const void *commit) { return 0; }
int git_annotated_commit_lookup(void **out, void *repo, const void *id) { return -1; }
int git_branch_create(void **out, void *repo, const char *branch_name, const void *target, int force) { return -1; }
int git_branch_is_head(const void *branch) { return -1; }
int git_branch_iterator_new(void **out, void *repo, int list_flags) { return -1; }
int git_branch_lookup(void **out, void *repo, const char *branch_name, int branch_type) { return -1; }
int git_branch_name(const char **out, const void *ref) { return -1; }
int git_branch_next(void **out, void *out_type, void *iter) { return -1; }
int git_branch_remote_name(void *out, void *repo, const char *refname) { return -1; }
int git_branch_set_upstream(void *branch, const char *branch_name) { return -1; }
int git_branch_upstream(void **out, const void *branch) { return -1; }
void git_buf_dispose(void *buffer) { }
int git_checkout_init_options(void *opts, unsigned int version) { return -1; }
int git_checkout_tree(void *repo, const void *treeish, const void *opts) { return -1; }
int git_clone(void **out, const char *url, const char *local_path, const void *options) { return -1; }
int git_clone_init_options(void *opts, unsigned int version) { return -1; }
int git_commit_amend(void *id, const void *commit_to_amend, const char *update_ref, const void *author, const void *committer, const char *message_encoding, const char *message, const void *tree) { return -1; }
const void * git_commit_author(const void *commit) { return 0; }
const void * git_commit_committer(const void *commit) { return 0; }
const char * git_commit_message(const void *commit) { return 0; }
int git_commit_parent(void **out, const void *commit, unsigned int n) { return -1; }
unsigned int git_commit_parentcount(const void *commit) { return 0; }
long long git_commit_time(const void *commit) { return 0; }
int git_config_get_bool(int *out, const void *cfg, const char *name) { return -1; }
int git_credential_ssh_key_from_agent(void **out, const char *username) { return -1; }
int git_credential_ssh_key_new(void **out, const char *username, const char *publickey, const char *privatekey, const char *passphrase) { return -1; }
int git_credential_username_new(void **out, const char *username) { return -1; }
int git_credential_userpass_plaintext_new(void **out, const char *username, const char *password) { return -1; }
int git_diff_init_options(void *opts, unsigned int version) { return -1; }
void git_error_clear(void) { }
int git_error_set_str(int error_class, const char *string) { return -1; }
int git_fetch_init_options(void *opts, unsigned int version) { return -1; }
int git_index_clear(void *index) { return -1; }
int git_index_find(size_t *at_pos, void *index, const char *path) { return -1; }
int git_index_has_conflicts(const void *index) { return -1; }
int git_index_read_tree(void *index, const void *tree) { return -1; }
int git_index_remove_bypath(void *index, const char *path) { return -1; }
int git_libgit2_version(int *major, int *minor, int *rev) { if(major)*major=1; if(minor)*minor=7; if(rev)*rev=1; return 0; }
int git_merge(void *repo, const void **their_heads, size_t their_heads_len, const void *merge_opts, const void *checkout_opts) { return -1; }
int git_merge_analysis(void *analysis_out, void *preference_out, void *repo, const void **their_heads, size_t their_heads_len) { return -1; }
int git_merge_base(void *out, void *repo, const void *one, const void *two) { return -1; }
const void * git_object_id(const void *obj) { return 0; }
int git_object_type(const void *obj) { return -1; }
int git_oid_cpy(void *out, const void *src) { return -1; }
int git_oid_fromstrn(void *out, const char *str, size_t length) { return -1; }
int git_oid_is_zero(const void *id) { return 1; }
int git_oid_iszero(const void *id) { return 1; }
int git_push_init_options(void *opts, unsigned int version) { return -1; }
int git_rebase_abort(void *rebase) { return -1; }
int git_rebase_commit(void *id, void *rebase, const void *author, const void *committer, const char *message_encoding, const char *message) { return -1; }
int git_rebase_finish(void *rebase, const void *signature) { return -1; }
int git_rebase_init(void **out, void *repo, const void *branch, const void *upstream, const void *onto, const void *opts) { return -1; }
int git_rebase_init_options(void *opts, unsigned int version) { return -1; }
int git_rebase_next(void **operation, void *rebase) { return -1; }
int git_reference_dwim(void **out, void *repo, const char *shorthand) { return -1; }
int git_reference_is_branch(const void *ref) { return -1; }
int git_reference_is_remote(const void *ref) { return -1; }
const char * git_reference_name(const void *ref) { return 0; }
int git_reference_peel(void **out, const void *ref, int type) { return -1; }
int git_reference_resolve(void **out, const void *ref) { return -1; }
int git_reference_set_target(void **out, void *ref, const void *id, const char *log_message) { return -1; }
const char * git_reference_shorthand(const void *ref) { return 0; }
int git_remote_connect(void *remote, int direction, const void *callbacks, const void *proxy_opts, const void *custom_headers) { return -1; }
int git_remote_create_anonymous(void **out, void *repo, const char *url) { return -1; }
int git_remote_create_with_fetchspec(void **out, void *repo, const char *name, const char *url, const char *fetch) { return -1; }
int git_remote_disconnect(void *remote) { return -1; }
int git_remote_fetch(void *remote, const void *refspecs, const void *opts, const char *reflog_message) { return -1; }
void git_remote_free(void *remote) { }
int git_remote_init_callbacks(void *opts, unsigned int version) { return -1; }
int git_remote_list(void *out, void *repo) { return -1; }
int git_remote_lookup(void **out, void *repo, const char *name) { return -1; }
const char * git_remote_name(const void *remote) { return 0; }
int git_remote_push(void *remote, const void *refspecs, const void *opts) { return -1; }
const char * git_remote_pushurl(const void *remote) { return 0; }
int git_remote_set_url(void *repo, const char *remote, const char *url) { return -1; }
const char * git_remote_url(const void *remote) { return 0; }
int git_repository_config(void **out, void *repo) { return -1; }
int git_repository_discover(void *out, const char *start_path, int across_fs, const char *ceiling_dirs) { return -1; }
int git_repository_fetchhead_foreach(void *repo, int callback, void *payload) { return -1; }
int git_repository_head_unborn(void *repo) { return -1; }
int git_repository_init_ext(void **out, const char *repo_path, void *opts) { return -1; }
int git_repository_init_init_options(void *opts, unsigned int version) { return -1; }
const char * git_repository_path(const void *repo) { return 0; }
int git_repository_set_head(void *repo, const char *refname) { return -1; }
int git_repository_state_cleanup(void *repo) { return -1; }
const char * git_repository_workdir(const void *repo) { return 0; }
int git_reset(void *repo, const void *target, int reset_type, const void *checkout_opts) { return -1; }
int git_revparse_single(void **out, void *repo, const char *spec) { return -1; }
void git_revwalk_free(void *walk) { }
int git_revwalk_hide(void *walk, const void *commit_id) { return -1; }
int git_revwalk_new(void **out, void *repo) { return -1; }
int git_revwalk_next(void *out, void *walk) { return -1; }
int git_revwalk_push(void *walk, const void *id) { return -1; }
int git_revwalk_push_glob(void *walk, const char *glob) { return -1; }
int git_revwalk_sorting(void *walk, unsigned int sort_mode) { return -1; }
int git_signature_default(void **out, void *repo) { return -1; }
const void * git_status_byindex(void *statuslist, size_t idx) { return 0; }
int git_status_init_options(void *opts, unsigned int version) { return -1; }
size_t git_status_list_entrycount(void *statuslist) { return 0; }
void git_status_list_free(void *statuslist) { }
int git_status_list_new(void **out, void *repo, const void *opts) { return -1; }
int git_status_options_init(void *opts, unsigned int version) { return -1; }
void git_strarray_dispose(void *array) { }
int git_tag_list_match(void *tag_names, const char *pattern, void *repo) { return -1; }
int git_tag_peel(void **tag_target_out, const void *tag) { return -1; }
int git_tree_entry_bypath(void **out, const void *root, const char *path) { return -1; }
void git_tree_entry_free(void *entry) { }
const void * git_tree_entry_id(const void *entry) { return 0; }
const char * git_tree_entry_name(const void *entry) { return 0; }
int git_tree_entry_type(const void *entry) { return -1; }
int git_tree_walk(const void *tree, int mode, int callback, void *payload) { return -1; }

/* ---- KiCad 10 local-history (git/history_lock.cpp, git/local_history.cpp) and
 *      other kicommon git callers: additional no-op libgit2 stubs. Same rationale
 *      as the block above (git is non-functional in the browser).             ---- */
void git_annotated_commit_free(void *commit) { }
void git_blame_free(void *blame) { }
void git_blob_free(void *blob) { }
int git_blob_lookup(void **blob, void *repo, const void *id) { return -1; }
const void * git_blob_rawcontent(const void *blob) { return 0; }
long long git_blob_rawsize(const void *blob) { return 0; }
void git_branch_iterator_free(void *iter) { }
void git_buf_free(void *buffer) { }
void git_config_iterator_free(void *iter) { }
void git_credential_free(void *cred) { }
void git_describe_result_free(void *result) { }
void git_diff_stats_free(void *stats) { }
void git_filter_list_free(void *filters) { }
int git_ignore_add_rule(void *repo, const char *rules) { return -1; }
int git_index_add_all(void *index, const void *pathspec, unsigned int flags, int callback, void *payload) { return -1; }
void git_index_conflict_iterator_free(void *iterator) { }
void git_index_iterator_free(void *iterator) { }
void git_indexer_free(void *idx) { }
void git_odb_free(void *db) { }
const void * git_odb_object_data(void *object) { return 0; }
void git_odb_object_free(void *object) { }
size_t git_odb_object_size(void *object) { return 0; }
int git_odb_object_type(void *object) { return -1; }
int git_odb_read(void **out, void *db, const void *id) { return -1; }
int git_odb_read_header(size_t *len_out, void *type_out, void *db, const void *id) { return -1; }
int git_odb_write(void *out, void *odb, const void *data, size_t len, int type) { return -1; }
int git_oid_fromstr(void *out, const char *str) { return -1; }
void git_oidarray_free(void *array) { }
void git_packbuilder_free(void *pb) { }
int git_packbuilder_insert_commit(void *pb, const void *id) { return -1; }
int git_packbuilder_new(void **out, void *repo) { return -1; }
int git_packbuilder_set_callbacks(void *pb, int progress_cb, void *progress_cb_payload) { return -1; }
int git_packbuilder_write(void *pb, const char *path, unsigned int mode, int progress_cb, void *progress_cb_payload) { return -1; }
void git_rebase_free(void *rebase) { }
int git_repository_odb(void **out, void *repo) { return -1; }
int git_repository_set_workdir(void *repo, const char *workdir, int update_gitlink) { return -1; }
int git_revwalk_push_head(void *walk) { return -1; }
int git_signature_new(void **out, const char *name, const char *email, long long time, int offset) { return -1; }
int git_status_file(unsigned int *status_flags, void *repo, const char *path) { return -1; }
void git_strarray_free(void *array) { }
int git_tag_list(void *tag_names, void *repo) { return -1; }
const void * git_tree_entry_byindex(const void *tree, size_t idx) { return 0; }
size_t git_tree_entrycount(const void *tree) { return 0; }
const void * git_tree_id(const void *tree) { return 0; }
