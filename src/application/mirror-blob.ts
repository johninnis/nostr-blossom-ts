import type { Result } from "@innis/nostr-core"
import type { BlossomError } from "../domain/errors.ts"
import { parseBlobDescriptor } from "../domain/blob.ts"
import type { BlobDescriptor, ServerUrl } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createAuthorisedRequest } from "./authorised-request.ts"
import { parseJsonResponse } from "./parse-response.ts"

interface MirrorBlobInput {
  readonly serverUrl: ServerUrl
  readonly sourceUrl: string
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

/** Build the mirror use-case (BUD-04): `PUT /mirror` with a `{ url }` body and an `upload` auth event, asking the server to fetch and store the blob at `sourceUrl`. Resolves to the stored {@link BlobDescriptor}. */
export const createMirrorBlob = (
  deps: BlossomDeps,
): (input: MirrorBlobInput) => Promise<Result<BlobDescriptor, BlossomError>> => {
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
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    })

    return parseJsonResponse(response, parseBlobDescriptor)
  }
}
