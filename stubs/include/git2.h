/*
 * KiCad Wasm Port - libgit2 Stub Header
 *
 * This is a minimal stub header for when KICAD_USE_GIT=0.
 * It provides just enough type definitions to let the code compile
 * without the actual libgit2 library.
 */

#ifndef KICAD_WASM_GIT2_STUB_H
#define KICAD_WASM_GIT2_STUB_H

#include <stddef.h>
#include <stdint.h>
#include <time.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Basic types
 */
typedef int64_t git_off_t;
typedef int64_t git_time_t;

typedef struct git_repository git_repository;
typedef struct git_reference git_reference;
typedef struct git_commit git_commit;
typedef struct git_tree git_tree;
typedef struct git_tree_entry git_tree_entry;
typedef struct git_index git_index;
typedef struct git_index_entry git_index_entry;
typedef struct git_config git_config;
typedef struct git_remote git_remote;
typedef struct git_signature git_signature;
typedef struct git_revwalk git_revwalk;
typedef struct git_diff git_diff;
typedef struct git_diff_delta git_diff_delta;
typedef struct git_diff_file git_diff_file;
typedef struct git_diff_options git_diff_options;
typedef struct git_status_list git_status_list;
typedef struct git_status_entry git_status_entry;
typedef struct git_branch_iterator git_branch_iterator;
typedef struct git_annotated_commit git_annotated_commit;
typedef struct git_rebase git_rebase;
typedef struct git_rebase_operation git_rebase_operation;
typedef struct git_merge_options git_merge_options;
typedef struct git_checkout_options git_checkout_options;
typedef struct git_fetch_options git_fetch_options;
typedef struct git_push_options git_push_options;
typedef struct git_clone_options git_clone_options;
typedef struct git_credential git_credential;
typedef struct git_credential git_cred; /* Alias for older API */
typedef struct git_blob git_blob;
typedef struct git_object git_object;
typedef struct git_buf git_buf;
typedef struct git_strarray git_strarray;
typedef struct git_odb git_odb;
typedef struct git_odb_backend git_odb_backend;
typedef struct git_refdb git_refdb;
typedef struct git_refdb_backend git_refdb_backend;
typedef struct git_indexer_progress git_indexer_progress;
typedef struct git_blame git_blame;
typedef struct git_blame_options git_blame_options;
typedef struct git_blame_hunk git_blame_hunk;
typedef struct git_config_entry git_config_entry;
typedef struct git_config_iterator git_config_iterator;
typedef struct git_patch git_patch;
typedef struct git_oidarray git_oidarray;
typedef struct git_describe_result git_describe_result;
typedef struct git_diff_stats git_diff_stats;
typedef struct git_filter_list git_filter_list;
typedef struct git_transfer_progress git_transfer_progress;
typedef git_transfer_progress git_indexer_progress_alias; /* Alias in newer libgit2 */
typedef struct git_note git_note;
typedef struct git_note_iterator git_note_iterator;
typedef struct git_status_options git_status_options;
typedef struct git_submodule git_submodule;
typedef struct git_worktree git_worktree;
typedef struct git_tag git_tag;
typedef struct git_indexer git_indexer;
typedef struct git_index_iterator git_index_iterator;
typedef struct git_index_conflict_iterator git_index_conflict_iterator;

/* git_oid - 20 byte SHA1 */
#define GIT_OID_RAWSZ 20
#define GIT_OID_HEXSZ 40

typedef struct git_oid {
    unsigned char id[GIT_OID_RAWSZ];
} git_oid;

/* git_time */
typedef struct git_time {
    git_time_t time;
    int offset;
    char sign;
} git_time;

/* git_signature */
struct git_signature {
    char *name;
    char *email;
    git_time when;
};

/* git_strarray */
struct git_strarray {
    char **strings;
    size_t count;
};

/* git_buf */
struct git_buf {
    char *ptr;
    size_t reserved;
    size_t size;
};

/* Error codes */
/* Error class enum */
typedef enum {
    GIT_ERROR_NONE = 0,
    GIT_ERROR_NOMEMORY = 1,
    GIT_ERROR_OS = 2,
    GIT_ERROR_INVALID = 3,
    GIT_ERROR_REFERENCE = 4,
    GIT_ERROR_ZLIB = 5,
    GIT_ERROR_REPOSITORY = 6,
    GIT_ERROR_CONFIG = 7,
    GIT_ERROR_REGEX = 8,
    GIT_ERROR_ODB = 9,
    GIT_ERROR_INDEX = 10,
    GIT_ERROR_OBJECT = 11,
    GIT_ERROR_NET = 12,
    GIT_ERROR_TAG = 13,
    GIT_ERROR_TREE = 14,
    GIT_ERROR_INDEXER = 15,
    GIT_ERROR_SSL = 16,
    GIT_ERROR_SUBMODULE = 17,
    GIT_ERROR_THREAD = 18,
    GIT_ERROR_STASH = 19,
    GIT_ERROR_CHECKOUT = 20,
    GIT_ERROR_FETCHHEAD = 21,
    GIT_ERROR_MERGE = 22,
    GIT_ERROR_SSH = 23,
    GIT_ERROR_FILTER = 24,
    GIT_ERROR_REVERT = 25,
    GIT_ERROR_CALLBACK = 26,
    GIT_ERROR_CHERRYPICK = 27,
    GIT_ERROR_DESCRIBE = 28,
    GIT_ERROR_REBASE = 29,
    GIT_ERROR_FILESYSTEM = 30,
    GIT_ERROR_PATCH = 31,
    GIT_ERROR_WORKTREE = 32,
    GIT_ERROR_SHA1 = 33,
    GIT_ERROR_HTTP = 34,
    GIT_ERROR_INTERNAL = 35
} git_error_t;

/* Error codes */
typedef enum {
    GIT_OK = 0,
    GIT_ERROR = -1,
    GIT_ENOTFOUND = -3,
    GIT_EEXISTS = -4,
    GIT_EAMBIGUOUS = -5,
    GIT_EBUFS = -6,
    GIT_EUSER = -7,
    GIT_EBAREREPO = -8,
    GIT_EUNBORNBRANCH = -9,
    GIT_EUNMERGED = -10,
    GIT_ENONFASTFORWARD = -11,
    GIT_EINVALIDSPEC = -12,
    GIT_ECONFLICT = -13,
    GIT_ELOCKED = -14,
    GIT_EMODIFIED = -15,
    GIT_EAUTH = -16,
    GIT_ECERTIFICATE = -17,
    GIT_EAPPLIED = -18,
    GIT_EPEEL = -19,
    GIT_EEOF = -20,
    GIT_EINVALID = -21,
    GIT_EUNCOMMITTED = -22,
    GIT_EDIRECTORY = -23,
    GIT_EMERGECONFLICT = -24,
    GIT_PASSTHROUGH = -30,
    GIT_ITEROVER = -31,
    GIT_RETRY = -32,
    GIT_EMISMATCH = -33,
    GIT_EINDEXDIRTY = -34,
    GIT_EAPPLYFAIL = -35
} git_error_code;

/* Object types */
typedef enum {
    GIT_OBJECT_ANY = -2,
    GIT_OBJECT_INVALID = -1,
    GIT_OBJECT_COMMIT = 1,
    GIT_OBJECT_TREE = 2,
    GIT_OBJECT_BLOB = 3,
    GIT_OBJECT_TAG = 4,
    GIT_OBJECT_OFS_DELTA = 6,
    GIT_OBJECT_REF_DELTA = 7
} git_object_t;

/* Branch types */
typedef enum {
    GIT_BRANCH_LOCAL = 1,
    GIT_BRANCH_REMOTE = 2,
    GIT_BRANCH_ALL = GIT_BRANCH_LOCAL | GIT_BRANCH_REMOTE
} git_branch_t;

/* Status flags */
typedef enum {
    GIT_STATUS_CURRENT = 0,
    GIT_STATUS_INDEX_NEW = (1u << 0),
    GIT_STATUS_INDEX_MODIFIED = (1u << 1),
    GIT_STATUS_INDEX_DELETED = (1u << 2),
    GIT_STATUS_INDEX_RENAMED = (1u << 3),
    GIT_STATUS_INDEX_TYPECHANGE = (1u << 4),
    GIT_STATUS_WT_NEW = (1u << 7),
    GIT_STATUS_WT_MODIFIED = (1u << 8),
    GIT_STATUS_WT_DELETED = (1u << 9),
    GIT_STATUS_WT_TYPECHANGE = (1u << 10),
    GIT_STATUS_WT_RENAMED = (1u << 11),
    GIT_STATUS_WT_UNREADABLE = (1u << 12),
    GIT_STATUS_IGNORED = (1u << 14),
    GIT_STATUS_CONFLICTED = (1u << 15)
} git_status_t;

/* Delta types */
typedef enum {
    GIT_DELTA_UNMODIFIED = 0,
    GIT_DELTA_ADDED = 1,
    GIT_DELTA_DELETED = 2,
    GIT_DELTA_MODIFIED = 3,
    GIT_DELTA_RENAMED = 4,
    GIT_DELTA_COPIED = 5,
    GIT_DELTA_IGNORED = 6,
    GIT_DELTA_UNTRACKED = 7,
    GIT_DELTA_TYPECHANGE = 8,
    GIT_DELTA_UNREADABLE = 9,
    GIT_DELTA_CONFLICTED = 10
} git_delta_t;

/* Credential types */
typedef enum {
    GIT_CREDENTIAL_USERPASS_PLAINTEXT = (1u << 0),
    GIT_CREDENTIAL_SSH_KEY = (1u << 1),
    GIT_CREDENTIAL_SSH_CUSTOM = (1u << 2),
    GIT_CREDENTIAL_DEFAULT = (1u << 3),
    GIT_CREDENTIAL_SSH_INTERACTIVE = (1u << 4),
    GIT_CREDENTIAL_USERNAME = (1u << 5),
    GIT_CREDENTIAL_SSH_MEMORY = (1u << 6)
} git_credential_t;

/* git_error */
typedef struct git_error {
    char *message;
    int klass;
} git_error;

/*
 * Stub functions - all return error
 */

/* Global */
static inline int git_libgit2_init(void) { return 1; }
static inline int git_libgit2_shutdown(void) { return 0; }
static inline const git_error* git_error_last(void) { return NULL; }
static inline void git_error_clear(void) {}

/* Repository */
static inline int git_repository_open(git_repository **out, const char *path) {
    (void)out; (void)path;
    return GIT_ENOTFOUND;
}
static inline int git_repository_open_ext(git_repository **out, const char *path,
    unsigned int flags, const char *ceiling_dirs) {
    (void)out; (void)path; (void)flags; (void)ceiling_dirs;
    return GIT_ENOTFOUND;
}
static inline int git_repository_init(git_repository **out, const char *path, unsigned is_bare) {
    (void)out; (void)path; (void)is_bare;
    return GIT_ERROR;
}
static inline void git_repository_free(git_repository *repo) { (void)repo; }
static inline int git_repository_head(git_reference **out, git_repository *repo) {
    (void)out; (void)repo;
    return GIT_ERROR;
}
static inline int git_repository_index(git_index **out, git_repository *repo) {
    (void)out; (void)repo;
    return GIT_ERROR;
}
static inline int git_repository_config(git_config **out, git_repository *repo) {
    (void)out; (void)repo;
    return GIT_ERROR;
}
static inline const char* git_repository_path(const git_repository *repo) {
    (void)repo;
    return NULL;
}
static inline const char* git_repository_workdir(const git_repository *repo) {
    (void)repo;
    return NULL;
}
static inline int git_repository_discover(git_buf *out, const char *start_path,
    int across_fs, const char *ceiling_dirs) {
    (void)out; (void)start_path; (void)across_fs; (void)ceiling_dirs;
    return GIT_ENOTFOUND;
}

/* Reference */
static inline int git_reference_resolve(git_reference **out, const git_reference *ref) {
    (void)out; (void)ref;
    return GIT_ERROR;
}
static inline void git_reference_free(git_reference *ref) { (void)ref; }
static inline const git_oid* git_reference_target(const git_reference *ref) {
    (void)ref;
    return NULL;
}
static inline const char* git_reference_name(const git_reference *ref) {
    (void)ref;
    return NULL;
}
static inline int git_reference_name_to_id(git_oid *out, git_repository *repo, const char *name) {
    (void)out; (void)repo; (void)name;
    return GIT_ERROR;
}

/* Branch */
static inline int git_branch_name(const char **out, const git_reference *ref) {
    (void)out; (void)ref;
    return GIT_ERROR;
}
static inline int git_branch_is_head(const git_reference *branch) {
    (void)branch;
    return 0;
}
static inline int git_branch_iterator_new(git_branch_iterator **out, git_repository *repo,
    git_branch_t list_flags) {
    (void)out; (void)repo; (void)list_flags;
    return GIT_ERROR;
}
static inline int git_branch_next(git_reference **out, git_branch_t *out_type,
    git_branch_iterator *iter) {
    (void)out; (void)out_type; (void)iter;
    return GIT_ITEROVER;
}
static inline void git_branch_iterator_free(git_branch_iterator *iter) { (void)iter; }
static inline int git_branch_create(git_reference **out, git_repository *repo,
    const char *branch_name, const git_commit *target, int force) {
    (void)out; (void)repo; (void)branch_name; (void)target; (void)force;
    return GIT_ERROR;
}

/* Commit */
static inline int git_commit_lookup(git_commit **commit, git_repository *repo, const git_oid *id) {
    (void)commit; (void)repo; (void)id;
    return GIT_ERROR;
}
static inline void git_commit_free(git_commit *commit) { (void)commit; }
static inline git_time_t git_commit_time(const git_commit *commit) {
    (void)commit;
    return 0;
}
static inline int git_commit_tree(git_tree **tree_out, const git_commit *commit) {
    (void)tree_out; (void)commit;
    return GIT_ERROR;
}
static inline const git_signature* git_commit_author(const git_commit *commit) {
    (void)commit;
    return NULL;
}
static inline const char* git_commit_message(const git_commit *commit) {
    (void)commit;
    return NULL;
}
static inline const char* git_commit_summary(const git_commit *commit) {
    (void)commit;
    return "";
}
static inline unsigned int git_commit_parentcount(const git_commit *commit) {
    (void)commit;
    return 0;
}
static inline int git_commit_parent(git_commit **out, const git_commit *commit, unsigned int n) {
    (void)out; (void)commit; (void)n;
    return GIT_ERROR;
}

/* Tree */
static inline void git_tree_free(git_tree *tree) { (void)tree; }
static inline int git_tree_walk(const git_tree *tree, int mode,
    int (*callback)(const char*, const git_tree_entry*, void*), void *payload) {
    (void)tree; (void)mode; (void)callback; (void)payload;
    return GIT_ERROR;
}
static inline const char* git_tree_entry_name(const git_tree_entry *entry) {
    (void)entry;
    return NULL;
}
static inline git_object_t git_tree_entry_type(const git_tree_entry *entry) {
    (void)entry;
    return GIT_OBJECT_INVALID;
}

/* Index */
static inline void git_index_free(git_index *index) { (void)index; }
static inline int git_index_add_bypath(git_index *index, const char *path) {
    (void)index; (void)path;
    return GIT_ERROR;
}
static inline int git_index_remove_bypath(git_index *index, const char *path) {
    (void)index; (void)path;
    return GIT_ERROR;
}
static inline int git_index_write(git_index *index) {
    (void)index;
    return GIT_ERROR;
}

/* Revwalk */
static inline int git_revwalk_new(git_revwalk **out, git_repository *repo) {
    (void)out; (void)repo;
    return GIT_ERROR;
}
static inline void git_revwalk_free(git_revwalk *walk) { (void)walk; }
static inline int git_revwalk_push(git_revwalk *walk, const git_oid *id) {
    (void)walk; (void)id;
    return GIT_ERROR;
}
static inline int git_revwalk_hide(git_revwalk *walk, const git_oid *id) {
    (void)walk; (void)id;
    return GIT_ERROR;
}
static inline int git_revwalk_next(git_oid *out, git_revwalk *walk) {
    (void)out; (void)walk;
    return GIT_ITEROVER;
}
static inline int git_revwalk_push_head(git_revwalk *walk) {
    (void)walk;
    return GIT_ERROR;
}
static inline void git_revwalk_sorting(git_revwalk *walk, unsigned int sort_mode) {
    (void)walk; (void)sort_mode;
}

/* Status */
static inline int git_status_list_new(git_status_list **out, git_repository *repo,
    const void *opts) {
    (void)out; (void)repo; (void)opts;
    return GIT_ERROR;
}
static inline void git_status_list_free(git_status_list *list) { (void)list; }

/* Clone */
static inline int git_clone(git_repository **out, const char *url, const char *local_path,
    const git_clone_options *options) {
    (void)out; (void)url; (void)local_path; (void)options;
    return GIT_ERROR;
}

/* Remote */
static inline int git_remote_lookup(git_remote **out, git_repository *repo, const char *name) {
    (void)out; (void)repo; (void)name;
    return GIT_ERROR;
}
static inline void git_remote_free(git_remote *remote) { (void)remote; }

/* Diff */
static inline void git_diff_free(git_diff *diff) { (void)diff; }

/* Signature */
static inline void git_signature_free(git_signature *sig) { (void)sig; }

/* Buffer */
static inline void git_buf_dispose(git_buf *buffer) {
    if (buffer) buffer->ptr = NULL;
}
static inline void git_buf_free(git_buf *buffer) {
    if (buffer) buffer->ptr = NULL;
}

/* Blob */
static inline void git_blob_free(git_blob *blob) { (void)blob; }
static inline const void* git_blob_rawcontent(const git_blob *blob) { (void)blob; return NULL; }
static inline git_off_t git_blob_rawsize(const git_blob *blob) { (void)blob; return 0; }

/* Blame */
static inline void git_blame_free(git_blame *blame) { (void)blame; }

/* Config entry/iterator */
static inline void git_config_entry_free(git_config_entry *entry) { (void)entry; }
static inline void git_config_iterator_free(git_config_iterator *iter) { (void)iter; }

/* Patch */
static inline void git_patch_free(git_patch *patch) { (void)patch; }

/* Config */
static inline void git_config_free(git_config *cfg) { (void)cfg; }
static inline int git_config_get_entry(git_config_entry **out, const git_config *cfg, const char *name) {
    (void)out; (void)cfg; (void)name;
    return GIT_ENOTFOUND;
}

/* Annotated commit */
static inline void git_annotated_commit_free(git_annotated_commit *commit) { (void)commit; }

/* Credential */
static inline void git_credential_free(git_credential *cred) { (void)cred; }

/* OID array */
static inline void git_oidarray_free(git_oidarray *array) { (void)array; }

/* Str array */
static inline void git_strarray_free(git_strarray *array) { (void)array; }

/* Describe result */
static inline void git_describe_result_free(git_describe_result *result) { (void)result; }

/* Diff stats */
static inline void git_diff_stats_free(git_diff_stats *stats) { (void)stats; }

/* Filter list */
static inline void git_filter_list_free(git_filter_list *list) { (void)list; }

/* Object */
static inline void git_object_free(git_object *object) { (void)object; }
static inline int git_object_lookup(git_object **object, git_repository *repo,
    const git_oid *id, git_object_t type) {
    (void)object; (void)repo; (void)id; (void)type;
    return GIT_ERROR;
}
static inline git_object_t git_object_type(const git_object *obj) {
    (void)obj;
    return GIT_OBJECT_INVALID;
}

/* Note */
static inline void git_note_free(git_note *note) { (void)note; }
static inline void git_note_iterator_free(git_note_iterator *it) { (void)it; }

/* Submodule */
static inline void git_submodule_free(git_submodule *submodule) { (void)submodule; }

/* Worktree */
static inline void git_worktree_free(git_worktree *wt) { (void)wt; }

/* Tag */
static inline void git_tag_free(git_tag *tag) { (void)tag; }

/* Rebase */
static inline void git_rebase_free(git_rebase *rebase) { (void)rebase; }

/* Indexer */
static inline void git_indexer_free(git_indexer *idx) { (void)idx; }

/* Index iterator */
static inline void git_index_iterator_free(git_index_iterator *iterator) { (void)iterator; }

/* Index conflict iterator */
static inline void git_index_conflict_iterator_free(git_index_conflict_iterator *iterator) { (void)iterator; }

/* OID */
static inline int git_oid_cmp(const git_oid *a, const git_oid *b) {
    (void)a; (void)b;
    return 0;
}
static inline char* git_oid_tostr_s(const git_oid *id) {
    (void)id;
    return (char*)"";
}
static inline char* git_oid_tostr(char *out, size_t n, const git_oid *id) {
    (void)out; (void)n; (void)id;
    if (out && n > 0) out[0] = '\0';
    return out;
}

#ifdef __cplusplus
}
#endif

#endif /* KICAD_WASM_GIT2_STUB_H */
