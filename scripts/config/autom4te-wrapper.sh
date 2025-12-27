#!/bin/bash
# autom4te wrapper - disables cache to keep submodules clean
# This prevents autom4te.cache directories from being created in source trees
#
# Unset AUTOM4TE to prevent infinite recursion when autoconf calls autom4te
unset AUTOM4TE
exec autom4te --no-cache "$@"
