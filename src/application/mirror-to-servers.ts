import type { Result } from "@innis/nostr-core"
import type { BlossomError } from "../domain/errors.ts"
import type { BlobDescriptor, ServerUrl, Sha256 } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createMirrorBlob } from "./mirror-blob.ts"

/** One server's result within a multi-server operation: the server addressed and what it returned. */
export interface ServerOutcome<T> {
  readonly serverUrl: ServerUrl
  readonly result: Result<T, BlossomError>
}

interface MirrorToServersInput {
  readonly servers: ReadonlyArray<ServerUrl>
  readonly sourceUrl: string
  readonly sha256: Sha256
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

/**
 * Build the mirror-to-servers use-case: ask every server, concurrently, to mirror the blob at
 * `sourceUrl` (BUD-04). One server's refusal does not stop the others, so the resolved value is a
 * {@link ServerOutcome} per server rather than a single `Result` — inspect each to report or retry
 * the servers that failed.
 */
export const createMirrorToServers = (
  deps: BlossomDeps,
): (input: MirrorToServersInput) => Promise<ReadonlyArray<ServerOutcome<BlobDescriptor>>> => {
  const mirrorBlob = createMirrorBlob(deps)

  return (input) =>
    Promise.all(input.servers.map(async (serverUrl) => ({
      serverUrl,
      result: await mirrorBlob({
        serverUrl,
        sourceUrl: input.sourceUrl,
        sha256: input.sha256,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
      }),
    })))
}
