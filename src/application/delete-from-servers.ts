import type { ServerUrl, Sha256 } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createDeleteBlob } from "./delete-blob.ts"
import type { ServerOutcome } from "./server-outcomes.ts"
import { collectServerOutcomes } from "./server-outcomes.ts"

interface DeleteFromServersInput {
  readonly servers: ReadonlyArray<ServerUrl>
  readonly sha256: Sha256
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

/**
 * Build the delete-from-servers use-case: delete the blob from every server, concurrently. One
 * server's refusal does not stop the others, so the resolved value is a {@link ServerOutcome} per
 * server rather than a single `Result` — inspect each to report the servers that still hold the blob.
 */
export const createDeleteFromServers = (
  deps: BlossomDeps,
): (input: DeleteFromServersInput) => Promise<ReadonlyArray<ServerOutcome<void>>> => {
  const deleteBlob = createDeleteBlob(deps)

  return (input) =>
    collectServerOutcomes(input.servers, (serverUrl) =>
      deleteBlob({
        serverUrl,
        sha256: input.sha256,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
      }))
}
