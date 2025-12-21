/* CURL stub for WebAssembly builds
 * Network operations need to go through JavaScript fetch API
 */

#include <stddef.h>
#include <stdarg.h>

typedef void CURL;
typedef void CURLM;
typedef int CURLcode;
typedef int CURLoption;
typedef int CURLINFO;

#define CURLE_OK 0
#define CURLE_UNSUPPORTED_PROTOCOL 1

/* Version info */
const char* curl_version(void) {
    return "stub-wasm/0.0 (no network in browser)";
}

/* Easy interface */
CURL* curl_easy_init(void) {
    return NULL;  /* No curl in WASM */
}

void curl_easy_cleanup(CURL *curl) {
    (void)curl;
}

CURLcode curl_easy_setopt(CURL *curl, CURLoption option, ...) {
    (void)curl;
    (void)option;
    return CURLE_OK;
}

CURLcode curl_easy_perform(CURL *curl) {
    (void)curl;
    return CURLE_UNSUPPORTED_PROTOCOL;
}

CURLcode curl_easy_getinfo(CURL *curl, CURLINFO info, ...) {
    (void)curl;
    (void)info;
    return CURLE_OK;
}

const char* curl_easy_strerror(CURLcode code) {
    (void)code;
    return "Network operations not available in browser";
}

void curl_easy_reset(CURL *curl) {
    (void)curl;
}

char* curl_easy_escape(CURL *curl, const char *string, int length) {
    (void)curl;
    (void)string;
    (void)length;
    return NULL;
}

void curl_free(void *p) {
    (void)p;
}

CURLcode curl_global_init(long flags) {
    (void)flags;
    return CURLE_OK;
}

void curl_global_cleanup(void) {
    /* Nothing to clean up */
}

/* Multi interface (for async) */
CURLM* curl_multi_init(void) {
    return NULL;
}

void curl_multi_cleanup(CURLM *multi) {
    (void)multi;
}

/* Slist */
struct curl_slist {
    char *data;
    struct curl_slist *next;
};

struct curl_slist* curl_slist_append(struct curl_slist *list, const char *string) {
    (void)list;
    (void)string;
    return NULL;
}

void curl_slist_free_all(struct curl_slist *list) {
    (void)list;
}
