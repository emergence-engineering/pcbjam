/*
 * KiCad Wasm Port - ngspice sharedspice.h stub
 *
 * Provides stub declarations when ngspice is disabled.
 */

#ifndef NGSPICE_SHAREDSPICE_H
#define NGSPICE_SHAREDSPICE_H

// Version information (stub)
#define NGSPICE_PACKAGE_VERSION "disabled"

// ngspice types
typedef int NG_BOOL;

// Callback function types (as used by ngspice)
// These are function types, not function pointer types.
// So SendChar* is a function pointer type.
typedef int SendChar(char*, int, void*);
typedef int SendStat(char*, int, void*);
typedef int ControlledExit(int, NG_BOOL, NG_BOOL, int, void*);
typedef int SendData(void*, int, int, void*);
typedef int SendInitData(void*, int, void*);
typedef int BGThreadRunning(NG_BOOL, int, void*);
typedef int GetVSRCData(double*, double, char*, int, void*);
typedef int GetISRCData(double*, double, char*, int, void*);
typedef int GetSyncData(double, double*, double, int, int, int, void*);

// ngspice is loaded dynamically via dlopen/GetSymbol, so we don't need to
// provide stub implementations for the functions. KiCad will get nullptr
// from GetSymbol when ngspice is not available, and handle it appropriately.

// However, we do need to provide the vector_info struct since it's used
// when processing data from ngspice.
struct vector_info;
typedef struct vector_info* pvector_info;

// Basic type definitions that might be used
typedef struct {
    char* name;
    char* type;
    void* data;
} vecvalues;

typedef struct {
    char* name;
    int veccount;
    vecvalues* vecarray;
} vecvaluesall;

typedef struct {
    char* name;
    char* type;
    int length;
} vecinfo;

typedef struct {
    char* name;
    char* title;
    char* date;
    char* type;
    int veccount;
    vecinfo** vecs;
} vecinfosall;

typedef struct {
    double progress;
    double value;
} plotmsg;

// ngcomplex_t is a complex number with cx_real and cx_imag
typedef struct ngcomplex {
    double cx_real;
    double cx_imag;
} ngcomplex_t;

// vector_info struct - matches the real ngspice definition
// Note: pvector_info is forward-declared above as struct vector_info*
struct vector_info {
    char* v_name;       // name of the vector
    int v_type;         // type of vector
    short v_flags;      // various flags
    double* v_realdata; // real data (if real vector)
    ngcomplex_t* v_compdata; // complex data (if complex vector)
    int v_length;       // length of the vector
    int v_numdims;      // number of dimensions (1 for scalar/vector)
    int v_dims[8];      // dimension sizes
};

#endif // NGSPICE_SHAREDSPICE_H
