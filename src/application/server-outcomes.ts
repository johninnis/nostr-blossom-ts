import type { Result } from "@innis/nostr-core"
import type { BlossomError } from "../domain/errors.ts"
import type { ServerUrl } from "../domain/types.ts"

/** One server's result within a multi-server operation: the server addressed and what it returned. */
export interface ServerOutcome<T> {
  readonly serverUrl: ServerUrl
  readonly result: Result<T, BlossomError>
}

export const collectServerOutcomes = <T>(
  servers: ReadonlyArray<ServerUrl>,
  perServer: (serverUrl: ServerUrl) => Promise<Result<T, BlossomError>>,
): Promise<ReadonlyArray<ServerOutcome<T>>> =>
  Promise.all(servers.map(async (serverUrl) => ({ serverUrl, result: await perServer(serverUrl) })))
