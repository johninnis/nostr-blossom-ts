import type { PublicKey } from "@innis/nostr-core"
import type { BlobDescriptor, ListBlobsQuery, ServerUrl, Sha256 } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createListBlobs } from "./list-blobs.ts"

/** A blob merged across servers: the descriptor from the first server that reported it, and every server it is present on. */
export interface ServerBlob {
  readonly blob: BlobDescriptor
  readonly servers: ReadonlyArray<ServerUrl>
}

/** A snapshot delivered to `onUpdate` each time a server replies: the blobs merged so far, the servers heard from, and the subset of those whose list request failed. */
export interface ListAcrossServersUpdate {
  readonly blobs: ReadonlyArray<ServerBlob>
  readonly respondedServers: ReadonlyArray<ServerUrl>
  readonly failedServers: ReadonlyArray<ServerUrl>
}

/** Handle returned by the list-across-servers use-case. `abort` cancels the in-flight requests and stops further `onUpdate` calls — call it on teardown so a slow server's late reply never reaches a dead view. */
export interface ListAcrossServersHandle {
  readonly abort: () => void
}

interface ListAcrossServersInput {
  readonly servers: ReadonlyArray<ServerUrl>
  readonly pubkey: PublicKey
  readonly query?: ListBlobsQuery
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
  readonly onUpdate: (update: ListAcrossServersUpdate) => void
}

interface MergedBlob {
  readonly blob: BlobDescriptor
  readonly servers: Array<ServerUrl>
}

/**
 * Build the list-across-servers use-case: list the pubkey's blobs on every server concurrently and
 * deliver a fresh {@link ListAcrossServersUpdate} to `onUpdate` as each server replies — never
 * waiting for the slowest. Blobs are merged by hash, keeping the first descriptor seen; a blob's
 * absence from a server only means anything once that server appears in `respondedServers`.
 */
export const createListBlobsAcrossServers = (
  deps: BlossomDeps,
): (input: ListAcrossServersInput) => ListAcrossServersHandle => {
  const listBlobs = createListBlobs(deps)

  return (input) => {
    const controller = new AbortController()
    const signal = input.signal === undefined ? controller.signal : AbortSignal.any([input.signal, controller.signal])

    const merged = new Map<Sha256, MergedBlob>()
    const respondedServers: Array<ServerUrl> = []
    const failedServers: Array<ServerUrl> = []

    const emit = (): void =>
      input.onUpdate({
        blobs: [...merged.values()].map(({ blob, servers }) => ({ blob, servers: [...servers] })),
        respondedServers: [...respondedServers],
        failedServers: [...failedServers],
      })

    for (const serverUrl of input.servers) {
      void listBlobs({
        serverUrl,
        pubkey: input.pubkey,
        query: input.query,
        timeoutMs: input.timeoutMs,
        signal,
      }).then((result) => {
        if (signal.aborted) return
        respondedServers.push(serverUrl)
        if (!result.success) {
          failedServers.push(serverUrl)
        } else {
          for (const blob of result.value) {
            const entry = merged.get(blob.sha256) ?? { blob, servers: [] }
            if (!entry.servers.includes(serverUrl)) entry.servers.push(serverUrl)
            merged.set(blob.sha256, entry)
          }
        }
        emit()
      })
    }

    return { abort: () => controller.abort() }
  }
}
