import type { Result } from "@innis/nostr-core"
import { ok } from "@innis/nostr-core"
import type { BlossomError } from "../domain/errors.ts"
import type { ServerUrl, Sha256 } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createAuthorisedRequest } from "./authorised-request.ts"

interface CheckUploadInput {
  readonly serverUrl: ServerUrl
  readonly sha256: Sha256
  readonly size: number
  readonly contentType: string
}

export const createCheckUpload = (
  deps: BlossomDeps,
): (input: CheckUploadInput) => Promise<Result<void, BlossomError>> => {
  const authorisedRequest = createAuthorisedRequest(deps)

  return async (input) => {
    const response = await authorisedRequest({
      serverUrl: input.serverUrl,
      action: "upload",
      content: "Check Upload",
      method: "HEAD",
      path: "/upload",
      headers: {
        "X-SHA-256": input.sha256,
        "X-Content-Length": String(input.size),
        "X-Content-Type": input.contentType,
      },
      hashes: [input.sha256],
    })

    if (!response.success) return response

    return ok(undefined)
  }
}
