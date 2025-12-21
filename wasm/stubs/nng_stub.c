/*
 * NNG stub implementation for KiCad WASM build
 * Socket-based IPC is not supported in browsers.
 * These stubs allow the code to compile but return errors indicating unsupported.
 */

#include "nng/nng.h"

// All NNG operations fail in WASM since sockets aren't available
// Using NNG_ENOENT as a generic "not available" error

int nng_rep0_open(nng_socket *s) {
    if (s) {
        s->id = -1;
    }
    return NNG_ENOENT;
}

int nng_listener_create(nng_listener *l, nng_socket s, const char *url) {
    (void)s;
    (void)url;
    if (l) {
        l->id = -1;
    }
    return NNG_ENOENT;
}

int nng_socket_set_ms(nng_socket s, const char *opt, nng_duration dur) {
    (void)s;
    (void)opt;
    (void)dur;
    return NNG_ENOENT;
}

int nng_listener_start(nng_listener l, int flags) {
    (void)l;
    (void)flags;
    return NNG_ENOENT;
}

int nng_recv(nng_socket s, void *data, size_t *sizep, int flags) {
    (void)s;
    (void)data;
    (void)sizep;
    (void)flags;
    return NNG_ENOENT;
}

int nng_send(nng_socket s, void *data, size_t size, int flags) {
    (void)s;
    (void)data;
    (void)size;
    (void)flags;
    return NNG_ENOENT;
}

int nng_close(nng_socket s) {
    (void)s;
    return 0;  // Close always succeeds
}

void nng_free(void *ptr, size_t size) {
    (void)ptr;
    (void)size;
    // Nothing to free in stub
}
