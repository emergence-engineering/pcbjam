/* CURL stub for WebAssembly builds
 * Network operations need to go through JavaScript fetch API
 */

typedef int CURLcode;
#define CURLE_OK 0

CURLcode curl_global_init(long flags) {
    (void)flags;
    return CURLE_OK;
}

void curl_global_cleanup(void) {
    /* Nothing to clean up */
}
