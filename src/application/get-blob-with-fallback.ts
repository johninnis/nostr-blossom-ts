import type { Result } from "@innis/nostr-core"
import { failure, ok } from "@innis/nostr-core"
import type { BlossomFailure } from "../domain/failure/blossom-failure.ts"
import type { ServerUrl, Sha256 } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import type { BlobResponse } from "./get-blob.ts"
import { createGetBlob } from "./get-blob.ts"

/** A {@link BlobResponse} plus the server in the fallback chain that served it. */
export interface FallbackBlobResponse extends BlobResponse {
  readonly serverUrl: ServerUrl
}

interface GetBlobWithFallbackInput {
  readonly servers: ReadonlyArray<ServerUrl>
  readonly sha256: Sha256
  /** The blob's size in bytes when known, capping every attempt's body read — see {@link createGetBlob}. */
  readonly expectedSize?: number | undefined
  readonly signal?: AbortSignal | undefined
}

/**
 * Build the get-with-fallback use-case: try each server in preference order until one returns the
 * blob (BUD-03). Every response is verified against the requested hash — a corrupt or lying server
 * counts as a failure and the chain moves on. Resolves to the first verified
 * {@link FallbackBlobResponse}, the last server's failure when every server fails, or a
 * `ValidationFailure` for an empty server list.
 */
export const createGetBlobWithFallback = (
  deps: BlossomDeps,
): (input: GetBlobWithFallbackInput) => Promise<Result<FallbackBlobResponse, BlossomFailure>> => {
  const getBlob = createGetBlob(deps)

  return async (input) => {
    let lastFailure: Result<FallbackBlobResponse, BlossomFailure> | null = null

    for (const serverUrl of input.servers) {
      const result = await getBlob({
        serverUrl,
        sha256: input.sha256,
        verify: true,
        expectedSize: input.expectedSize,
        signal: input.signal,
      })
      if (result.success) return ok({ ...result.value, serverUrl })
      lastFailure = result
    }

    return lastFailure ?? failure({ type: "validation", message: "at least one server is required" })
  }
}
