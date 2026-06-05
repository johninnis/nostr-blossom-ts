import type { Result } from "@innis/nostr-core"
import { ok } from "@innis/nostr-core"
import type { BlossomError } from "../domain/errors.ts"
import type { BlobHeaders, ServerUrl, Sha256 } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createAuthorisedRequest } from "./authorised-request.ts"

interface HeadBlobInput {
  readonly serverUrl: ServerUrl
  readonly sha256: Sha256
}

export const createHeadBlob = (
  deps: BlossomDeps,
): (input: HeadBlobInput) => Promise<Result<BlobHeaders, BlossomError>> => {
  const authorisedRequest = createAuthorisedRequest(deps)

  return async (input) => {
    const response = await authorisedRequest({
      serverUrl: input.serverUrl,
      action: "get",
      content: "Head Blob",
      method: "HEAD",
      path: `/${input.sha256}`,
      hashes: [input.sha256],
    })

    if (!response.success) return response

    const headers = response.value.headers
    const contentType = headers.get("content-type") ?? "application/octet-stream"
    const rawContentLength = headers.get("content-length")
    const contentLength = rawContentLength !== null ? Number(rawContentLength) : Number.NaN

    return ok({ contentType, contentLength: Number.isFinite(contentLength) ? contentLength : undefined })
  }
}
