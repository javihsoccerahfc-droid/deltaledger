/**
 * Shared constants for the BOM and open-PO import flows. Kept in one place so the UI copy,
 * client-side validation, and the Next.js Server Action body limit (next.config.mjs) can't
 * silently drift apart.
 *
 * IMPORTANT -- the real ceiling is Vercel's, not Next's:
 * Vercel enforces a hard, non-configurable 4.5 MB request body limit on every Vercel Function
 * (which is what a Next.js Server Action runs as/through in production) -- setting Next's own
 * `experimental.serverActions.bodySizeLimit` higher than that does NOT raise the platform
 * ceiling; requests over 4.5 MB still fail with 413 FUNCTION_PAYLOAD_TOO_LARGE regardless of
 * the Next config value. MAX_IMPORT_FILE_SIZE_BYTES is set safely under that platform limit
 * (leaving headroom for multipart boundary/field overhead), and next.config.mjs's
 * bodySizeLimit is set to match -- both must be updated together if this ever changes.
 */
export const MAX_IMPORT_FILE_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB
export const MAX_IMPORT_FILE_SIZE_LABEL = "4 MB";

/**
 * How long the client waits for a BOM/PO import Server Action before treating it as timed out
 * and handing control back to the user (see src/lib/timedAction.ts for what "timed out" does
 * and doesn't mean). 45s is generous for parsing a few-MB spreadsheet and writing it inside a
 * single Postgres transaction on a cold serverless function, while still being short enough
 * that a genuinely stuck request doesn't leave someone staring at a spinner indefinitely.
 */
export const IMPORT_TIMEOUT_MS = 45_000;

/**
 * Shown when a timeout fires (see src/lib/timedAction.ts and src/lib/importSlotState.ts). The
 * wording is deliberate and exact: it must not imply success or failure (the true outcome is
 * unknown), and it must tell the user a page refresh -- not an immediate retry -- is required,
 * since retrying while the original request may still be running server-side risks a
 * duplicate import.
 */
export const IMPORT_TIMEOUT_UNKNOWN_MESSAGE =
  "The import is taking longer than expected. Its final status is unknown. Refresh the page " +
  "before trying again to avoid creating a duplicate import.";
