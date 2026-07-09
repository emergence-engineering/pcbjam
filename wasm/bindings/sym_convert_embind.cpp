// sym_convert's "embind" object — deliberately embind-free (ysync 0009 size
// research, step (a)).
//
// The eeschema kiface references exactly ONE symbol from the editor's embind
// TU: kicadCollabOnSave (files-io.cpp, called from SCH_EDIT_FRAME::SaveEEFile —
// a path the headless converter never executes). Linking the real
// eeschema_embind.o for that one symbol roots the ENTIRE editor surface from
// .init_array (EMSCRIPTEN_BINDINGS takes the address of every bound function:
// kicadOpenFile → frames/tools/dialogs, collab bridge, presence → GAL), which
// GC cannot remove. This no-op hook satisfies the reference instead.
extern "C" void kicadCollabOnSave( const char* /* aPath */ ) {}
