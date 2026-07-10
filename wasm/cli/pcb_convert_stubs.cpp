/*
 * pcb_convert link-order diet stubs (mirror of sym_convert_stubs.cpp).
 *
 * Listed before the kiface objects in the pcb_convert link so
 * --allow-multiple-definition resolves duplicated definitions to these
 * (first definition wins). Grows as the diet surfaces link/runtime needs;
 * function references left dangling by the CMake prune are covered by
 * -sERROR_ON_UNDEFINED_SYMBOLS=0 (they become aborting JS imports), so only
 * data/typeinfo needs and behavior overrides belong here.
 *
 * Currently empty: the --drc path needs no overrides — board *save* and the
 * plot/export surfaces are pruned outright, and Kiface() is deliberately left
 * undefined so a stray call aborts loudly instead of wandering on a null
 * settings object.
 */
