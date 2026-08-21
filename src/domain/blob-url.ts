import type { Result } from "@innis/nostr-core"
import { failure, ok } from "@innis/nostr-core"
import { createServerUrl, createSha256 } from "./blob.ts"
import { ValidationError } from "./errors.ts"
import type { ServerUrl, Sha256 } from "./types.ts"

interface BlobPath {
  readonly sha256: Sha256
  readonly extension: string
}

const parseBlobPath = (url: string): BlobPath | null => {
  const parsed = URL.parse(url)
  if (parsed === null) return null
  for (const segment of parsed.pathname.split("/").toReversed()) {
    const [name, ...rest] = segment.split(".")
    const sha256 = createSha256(name ?? "")
    if (sha256.success) return { sha256: sha256.value, extension: rest.join(".") }
  }
  return null
}

/**
 * Build the BUD-01 URL a blob is served from: `<serverUrl>/<sha256>`, plus a file extension when one
 * is given (`"png"` and `".png"` are equivalent). The extension is a media-type hint only — the hash
 * alone addresses the blob.
 */
export const buildBlobUrl = (serverUrl: ServerUrl, sha256: Sha256, extension?: string): string => {
  const suffix = extension === undefined || extension === "" ? "" : `.${extension.replace(/^\./, "")}`
  return `${serverUrl}/${sha256}${suffix}`
}

/**
 * Extract the {@link Sha256} a Blossom URL addresses: the last path segment whose name (before any
 * file extension) is a 64-character hex hash, per BUD-03's rule for locating a blob's hash in a URL
 * so it can be fetched from alternative servers. Returns a `ValidationError` failure when the URL is
 * unparseable or no path segment carries a hash. This is the single validated URL → hash path — use
 * it instead of pattern-matching URLs by hand.
 */
export const extractSha256FromUrl = (url: string): Result<Sha256, ValidationError> => {
  const path = parseBlobPath(url)
  return path !== null ? ok(path.sha256) : failure(new ValidationError("URL carries no SHA-256 path segment"))
}

/**
 * The ordered, deduplicated list of URLs a blob may be fetched from (BUD-03 fallback): the original
 * URL first, then the blob rebuilt on its own origin and on each of the user's servers, preserving
 * the original's file extension. A URL that addresses no hash has no alternatives — the list is just
 * that URL.
 */
export const buildFallbackUrls = (url: string, servers: ReadonlyArray<ServerUrl>): ReadonlyArray<string> => {
  const path = parseBlobPath(url)
  if (path === null) return [url]
  const origin = createServerUrl(URL.parse(url)?.origin ?? "")
  const candidateServers = origin.success ? [origin.value, ...servers] : servers
  const rebuilt = candidateServers.map((serverUrl) => buildBlobUrl(serverUrl, path.sha256, path.extension))
  return [...new Set([url, ...rebuilt])]
}
