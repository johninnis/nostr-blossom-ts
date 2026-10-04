import type { Result } from "@innis/nostr-core"
import { ok } from "@innis/nostr-core"
import type { BlossomFailure } from "../domain/failure/blossom-failure.ts"
import type { ServerUrl, Sha256 } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createAuthorisedRequest } from "./authorised-request.ts"

interface DeleteBlobInput {
  readonly serverUrl: ServerUrl
  readonly sha256: Sha256
  readonly signal?: AbortSignal | undefined
}

/** Build the delete use-case (BUD-12): `DELETE /<sha256>` with a `delete` auth event. Resolves to `void` on success. */
export const createDeleteBlob = (
  deps: BlossomDeps,
): (input: DeleteBlobInput) => Promise<Result<void, BlossomFailure>> => {
  const authorisedRequest = createAuthorisedRequest(deps)

  return async (input) => {
    const response = await authorisedRequest({
      serverUrl: input.serverUrl,
      action: "delete",
      content: "Delete Blob",
      method: "DELETE",
      path: `/${input.sha256}`,
      hashes: [input.sha256],
      signal: input.signal,
    })

    if (!response.success) return response

    return ok(undefined)
  }
}
