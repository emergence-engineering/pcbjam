/*
 * KiCad Wasm Port - CURL Stub Header
 *
 * This is a minimal stub header for when KICAD_USE_CURL=0.
 * It provides just enough type definitions to let the code compile
 * without the actual libcurl library.
 */

#ifndef KICAD_WASM_CURL_STUB_H
#define KICAD_WASM_CURL_STUB_H

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* CURL handle type */
typedef void CURL;

/* CURL multi handle */
typedef void CURLM;

/* CURL share handle */
typedef void CURLSH;

/* Linked list for headers */
struct curl_slist {
    char *data;
    struct curl_slist *next;
};

/* Error codes */
typedef enum {
    CURLE_OK = 0,
    CURLE_UNSUPPORTED_PROTOCOL,
    CURLE_FAILED_INIT,
    CURLE_URL_MALFORMAT,
    CURLE_NOT_BUILT_IN,
    CURLE_COULDNT_RESOLVE_PROXY,
    CURLE_COULDNT_RESOLVE_HOST,
    CURLE_COULDNT_CONNECT,
    CURLE_REMOTE_ACCESS_DENIED = 9,
    CURLE_HTTP_RETURNED_ERROR = 22,
    CURLE_WRITE_ERROR = 23,
    CURLE_READ_ERROR = 26,
    CURLE_OUT_OF_MEMORY = 27,
    CURLE_OPERATION_TIMEDOUT = 28,
    CURLE_SSL_CONNECT_ERROR = 35,
    CURLE_ABORTED_BY_CALLBACK = 42,
    CURLE_GOT_NOTHING = 52,
    CURLE_SSL_ENGINE_NOTFOUND = 53,
    CURLE_SSL_ENGINE_SETFAILED = 54,
    CURLE_SEND_ERROR = 55,
    CURLE_RECV_ERROR = 56,
    CURLE_SSL_CERTPROBLEM = 58,
    CURLE_SSL_CIPHER = 59,
    CURLE_PEER_FAILED_VERIFICATION = 60,
    CURLE_BAD_CONTENT_ENCODING = 61,
    CURLE_FILESIZE_EXCEEDED = 63,
    CURLE_SEND_FAIL_REWIND = 65,
    CURLE_LOGIN_DENIED = 67,
    CURLE_REMOTE_DISK_FULL = 70,
    CURLE_REMOTE_FILE_EXISTS = 73,
    CURLE_SSH = 79,
    CURLE_AGAIN = 81,
    CURLE_SSL_CRL_BADFILE = 82,
    CURLE_SSL_ISSUER_ERROR = 83,
    CURLE_CHUNK_FAILED = 88,
    CURLE_NO_CONNECTION_AVAILABLE = 89,
    CURLE_SSL_PINNEDPUBKEYNOTMATCH = 90,
    CURLE_SSL_INVALIDCERTSTATUS = 91,
    CURLE_HTTP2_STREAM = 92,
    CURL_LAST
} CURLcode;

/* CURL options (minimal subset) */
typedef enum {
    CURLOPT_URL = 10002,
    CURLOPT_WRITEFUNCTION = 20011,
    CURLOPT_WRITEDATA = 10001,
    CURLOPT_USERAGENT = 10018,
    CURLOPT_HTTPHEADER = 10023,
    CURLOPT_POSTFIELDS = 10015,
    CURLOPT_FOLLOWLOCATION = 52,
    CURLOPT_SSL_VERIFYPEER = 64,
    CURLOPT_SSL_VERIFYHOST = 81,
    CURLOPT_TIMEOUT = 13,
    CURLOPT_CONNECTTIMEOUT = 78,
    CURLOPT_NOPROGRESS = 43,
    CURLOPT_PROGRESSFUNCTION = 20056,
    CURLOPT_PROGRESSDATA = 10057,
    CURLOPT_XFERINFOFUNCTION = 20219,
    CURLOPT_XFERINFODATA = 10057
} CURLoption;

/* CURL info types */
typedef enum {
    CURLINFO_RESPONSE_CODE = 0x200002,
    CURLINFO_CONTENT_LENGTH_DOWNLOAD = 0x300015,
    CURLINFO_SIZE_DOWNLOAD = 0x300008
} CURLINFO;

/* Global flags */
#define CURL_GLOBAL_DEFAULT 3
#define CURL_GLOBAL_SSL 1
#define CURL_GLOBAL_WIN32 2
#define CURL_GLOBAL_ALL 3

/* Stub function declarations - all return error or NULL */
static inline CURL* curl_easy_init(void) { return NULL; }
static inline void curl_easy_cleanup(CURL* curl) { (void)curl; }
static inline CURLcode curl_easy_setopt(CURL* curl, CURLoption option, ...) {
    (void)curl; (void)option;
    return CURLE_NOT_BUILT_IN;
}
static inline CURLcode curl_easy_perform(CURL* curl) {
    (void)curl;
    return CURLE_NOT_BUILT_IN;
}
static inline CURLcode curl_easy_getinfo(CURL* curl, CURLINFO info, ...) {
    (void)curl; (void)info;
    return CURLE_NOT_BUILT_IN;
}
static inline const char* curl_easy_strerror(CURLcode error) {
    (void)error;
    return "CURL support not built in";
}
static inline char* curl_easy_escape(CURL* curl, const char* string, int length) {
    (void)curl; (void)string; (void)length;
    return NULL;
}
static inline void curl_free(void* p) { (void)p; }

static inline struct curl_slist* curl_slist_append(struct curl_slist* list, const char* string) {
    (void)list; (void)string;
    return NULL;
}
static inline void curl_slist_free_all(struct curl_slist* list) { (void)list; }

static inline CURLcode curl_global_init(long flags) { (void)flags; return CURLE_OK; }
static inline void curl_global_cleanup(void) { }
static inline const char* curl_version(void) { return "curl-stub/0.0 (KICAD_USE_CURL=0)"; }

#ifdef __cplusplus
}
#endif

#endif /* KICAD_WASM_CURL_STUB_H */
