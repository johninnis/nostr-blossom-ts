import type { HttpClient, NostrEvent, Result, SigningError, UnsignedEvent } from "@innis/nostr-core"

/** The library's `Result`-returning signing port: a narrower view of `@innis/nostr-core`'s throwing `Signer` that keeps the domain and application layers catch-free. Build one from a `Signer` via {@link adaptSigner}. */
export interface BlossomSigner {
  readonly sign: (event: UnsignedEvent) => Promise<Result<NostrEvent, SigningError>>
}

/** The dependency bundle every use-case factory takes: a {@link BlossomSigner} and an `HttpClient` transport. Assemble it once and reuse it across factories. */
export interface BlossomDeps {
  readonly signer: BlossomSigner
  readonly httpClient: HttpClient
}
