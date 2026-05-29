/*
 * Minimal stub of ngspice's sharedspice.h for KiCad WASM builds.
 *
 * Only the type names referenced by kicad/eeschema/sim/ngspice.{h,cpp} need
 * to exist. The eeschema sim layer compiles but the simulator frame is never
 * instantiated in WASM (FRAME_SIMULATOR's try/catch in IFACE::CreateKiWindow
 * catches the init failure and returns nullptr).
 *
 * We intentionally do NOT define NGSPICE_PACKAGE_VERSION so that ngspice.h's
 * fallback `typedef bool NG_BOOL;` (line 46) provides the boolean type.
 */

#ifndef KICAD_WASM_NGSPICE_SHAREDSPICE_STUB_H
#define KICAD_WASM_NGSPICE_SHAREDSPICE_STUB_H

#ifdef __cplusplus
extern "C" {
#endif

typedef struct ngcomplex {
    double cx_real;
    double cx_imag;
} ngcomplex_t;

struct vector_info {
    char*        v_name;
    int          v_type;
    short        v_flags;
    double*      v_realdata;
    ngcomplex_t* v_compdata;
    int          v_length;
};

typedef struct vector_info* pvector_info;

/* Opaque payload types for callbacks we never wire up (SendData/SendInitData). */
typedef struct vecvaluesall* pvecvaluesall;
typedef struct vecinfoall*   pvecinfoall;

/*
 * Function types (not pointers). ngspice.h references them as `SendChar*` etc.,
 * so the trailing star in the typedef site makes the pointer.
 */
typedef int (SendChar)(char*, int, void*);
typedef int (SendStat)(char*, int, void*);
typedef int (ControlledExit)(int, bool, bool, int, void*);
typedef int (SendData)(pvecvaluesall, int, int, void*);
typedef int (SendInitData)(pvecinfoall, int, void*);
typedef int (BGThreadRunning)(bool, int, void*);

#ifdef __cplusplus
}
#endif

#endif /* KICAD_WASM_NGSPICE_SHAREDSPICE_STUB_H */
