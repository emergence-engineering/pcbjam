/**
 * pcbjam lib URIs are absolute POSIX paths under a single mount. Absolute so
 * that KiCad's lib-table URI expansion (ExpandURI -> wxFileName::MakeAbsolute)
 * is a no-op and the path reaches the plugin/provider unmangled — a "scheme://"
 * URI gets rewritten to "/scheme:/..." against the cwd, which differs per
 * project.
 *
 * One mount for every lib: the fork reports them all writable and the
 * provider/server decides what a save means (write a user lib, mirror an
 * origin, reject). The fork stays agnostic to origin/user.
 */
export const PCBJAM_LIB_MOUNT = "/mnt/pcbjam";
export const PCBJAM_LIB_PREFIX = `${PCBJAM_LIB_MOUNT}/`;

/** The lib-table URI for a lib id. */
export function libUri(id: string): string {
  return `${PCBJAM_LIB_PREFIX}${id}`;
}

/** Recover the lib id from a "/mnt/pcbjam/<id>" URI (arrives unmangled). */
export function libIdFromUri(uri: string): string | null {
  return uri.startsWith(PCBJAM_LIB_PREFIX)
    ? uri.slice(PCBJAM_LIB_PREFIX.length)
    : null;
}
