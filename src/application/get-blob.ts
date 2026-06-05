import type { Result } from "@innis/nostr-core"
import { ok } from "@innis/nostr-core"
import type { BlossomError } from "../domain/errors.ts"
import type { ServerUrl, Sha256 } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createAuthorisedRequest } from "./authorised-request.ts"

interface GetBlobInput {
  readonly serverUrl: ServerUrl
  readonly sha256: Sha256
}

/** The result of {@link createGetBlob}: the blob body as a `Blob`, plus the `contentType` read from the response header. */
export interface BlobResponse {
  readonly data: Blob
  readonly contentType: string
}

/** Build the get use-case: `GET /<sha256>` with a `get` auth event, returning the body as a {@link BlobResponse}. */
export const createGetBlob = (
  deps: BlossomDeps,
): (input: GetBlobInput) => Promise<Result<BlobResponse, BlossomError>> => {
  const authorisedRequest = createAuthorisedRequest(deps)

  return async (input) => {
    const response = await authorisedRequest({
      serverUrl: input.serverUrl,
      action: "get",
      content: "Get Blob",
      method: "GET",
      path: `/${input.sha256}`,
      hashes: [input.sha256],
    })

    if (!response.success) return response

    const blobResult = await response.value.blob()
    if (!blobResult.success) return blobResult

    // Content type is read from the response header, not from data.type: the HttpClient port makes
    // no guarantee that blob() preserves the MIME type (the in-memory test client does not), so the
    // header is the authoritative source.
    const contentType = response.value.headers.get("content-type") ?? "application/octet-stream"

    return ok({ data: blobResult.value, contentType })
  }
}
