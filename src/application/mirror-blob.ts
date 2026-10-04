import type { Result } from "@innis/nostr-core"
import type { BlossomFailure } from "../domain/failure/blossom-failure.ts"
import { parseBlobDescriptor } from "../domain/blob.ts"
import type { BlobDescriptor, ServerUrl, Sha256 } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createAuthorisedRequest } from "./authorised-request.ts"
import { parseJsonResponse } from "./parse-response.ts"

interface MirrorBlobInput {
  readonly serverUrl: ServerUrl
  readonly sourceUrl: string
  readonly sha256: Sha256
  readonly signal?: AbortSignal | undefined
}

/** Build the mirror use-case (BUD-04): `PUT /mirror` with a `{ url }` body and an `upload` auth event whose `x` tag carries `sha256`, asking the server to fetch and store the blob at `sourceUrl`. Resolves to the stored {@link BlobDescriptor}. */
export const createMirrorBlob = (
  deps: BlossomDeps,
): (input: MirrorBlobInput) => Promise<Result<BlobDescriptor, BlossomFailure>> => {
  const authorisedRequest = createAuthorisedRequest(deps)

  return async (input) => {
    const response = await authorisedRequest({
      serverUrl: input.serverUrl,
      action: "upload",
      content: "Mirror Blob",
      method: "PUT",
      path: "/mirror",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: input.sourceUrl }),
      hashes: [input.sha256],
      signal: input.signal,
    })

    return parseJsonResponse(response, parseBlobDescriptor, "blob descriptor")
  }
}
