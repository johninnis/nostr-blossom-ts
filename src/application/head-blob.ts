import type { Result } from "@innis/nostr-core"
import { ok } from "@innis/nostr-core"
import type { BlossomFailure } from "../domain/failure/blossom-failure.ts"
import type { BlobHeaders, ServerUrl, Sha256 } from "../domain/types.ts"
import { extractSha256FromUrl } from "../domain/blob-url.ts"
import type { BlossomDeps } from "./ports.ts"
import { createAuthorisedRequest } from "./authorised-request.ts"

const parseByteCount = (raw: string): number | null => {
  const count = /^\d+$/.test(raw) ? Number(raw) : Number.NaN
  return Number.isSafeInteger(count) ? count : null
}

interface HeadBlobInput {
  readonly serverUrl: ServerUrl
  readonly sha256: Sha256
  readonly signal?: AbortSignal | undefined
}

/** Build the head use-case: `HEAD /<sha256>` with a `get` auth event, returning {@link BlobHeaders} (content type, and content length when the server reports it as a whole number of bytes). A redirect is followed only to a URL carrying the same sha256, as BUD-01 permits. */
export const createHeadBlob = (
  deps: BlossomDeps,
): (input: HeadBlobInput) => Promise<Result<BlobHeaders, BlossomFailure>> => {
  const authorisedRequest = createAuthorisedRequest(deps)

  return async (input) => {
    const response = await authorisedRequest({
      serverUrl: input.serverUrl,
      action: "get",
      content: "Head Blob",
      method: "HEAD",
      path: `/${input.sha256}`,
      hashes: [input.sha256],
      signal: input.signal,
      followRedirectTo: (url) => extractSha256FromUrl(url) === input.sha256,
    })

    if (!response.success) return response

    const headers = response.value.headers
    const contentType = headers.get("content-type") ?? "application/octet-stream"
    const contentLength = parseByteCount(headers.get("content-length") ?? "")

    return ok({ contentType, contentLength: contentLength ?? undefined })
  }
}
