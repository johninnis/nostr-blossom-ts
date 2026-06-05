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
}

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
    })

    return parseJsonResponse(response, parseBlobDescriptor)
  }
}
