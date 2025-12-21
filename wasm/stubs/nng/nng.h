/*
 * NNG stub header for KiCad WASM build
 * Socket-based IPC is not supported in browsers, so we provide stub implementations
 * that compile but don't do anything.
 */

#ifndef NNG_NNG_H
#define NNG_NNG_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Error codes
#define NNG_ETIMEDOUT 5
#define NNG_ECLOSED   6
#define NNG_ENOENT    7

// Options
#define NNG_OPT_RECVTIMEO "recv-timeout"

// Flags
#define NNG_FLAG_ALLOC 1

// Opaque types
typedef struct nng_socket_s { int id; } nng_socket;
typedef struct nng_listener_s { int id; } nng_listener;
typedef int nng_duration;

// NNG function stubs - all return error codes indicating "not supported"
int nng_rep0_open(nng_socket *s);
int nng_listener_create(nng_listener *l, nng_socket s, const char *url);
int nng_socket_set_ms(nng_socket s, const char *opt, nng_duration dur);
int nng_listener_start(nng_listener l, int flags);
int nng_recv(nng_socket s, void *data, size_t *sizep, int flags);
int nng_send(nng_socket s, void *data, size_t size, int flags);
int nng_close(nng_socket s);
void nng_free(void *ptr, size_t size);

#ifdef __cplusplus
}
#endif

#endif // NNG_NNG_H
