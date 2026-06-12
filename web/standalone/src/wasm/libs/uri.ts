/**
 * pcbjam lib URIs are absolute POSIX paths under this mount. Absolute so that
 * KiCad's lib-table URI expansion (ExpandURI -> wxFileName::MakeAbsolute) is a
 * no-op and the path reaches the plugin/provider unmangled — a "scheme://" URI
 * gets rewritten to "/scheme:/..." against the cwd, which differs per project.
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
