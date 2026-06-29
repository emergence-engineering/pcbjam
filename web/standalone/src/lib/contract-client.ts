import { contract, USER_HEADER } from "@pcbjam/shared";
import { initClient } from "@ts-rest/core";
import { API_BASE_URL, userSlug } from "./config";

/**
 * ts-rest client over the shared contract (the REST backend). Shared by the
 * remote project source (lib/project-source.ts) and the lib/drift endpoints
 * (lib/api.ts). Kept in its own module so project-source and api don't import
 * each other (avoids a cycle). The scope is a PATH param (per call); the user is
 * a header (the thin pre-auth identity, used for per-user lib pins).
 */
export const client = initClient(contract, {
  baseUrl: API_BASE_URL,
  baseHeaders: { [USER_HEADER]: userSlug() },
});
