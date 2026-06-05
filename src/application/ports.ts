import type { HttpClient, NostrEvent, Result, SigningError, UnsignedEvent } from "@innis/nostr-core"

export interface BlossomSigner {
  readonly sign: (event: UnsignedEvent) => Promise<Result<NostrEvent, SigningError>>
}

export interface BlossomDeps {
  readonly signer: BlossomSigner
  readonly httpClient: HttpClient
}
