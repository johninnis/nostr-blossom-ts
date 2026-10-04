import type { HttpClient, Signer } from "@innis/nostr-core"

/** The library's signing port: the one `Signer` capability the use-cases need. Any `@innis/nostr-core` `Signer` satisfies it, and a `SignerFailure` it returns is passed through as the use-case's `BlossomFailure`. */
export type BlossomSigner = Pick<Signer, "signEvent">

/** The collaborators every use-case factory takes: a {@link BlossomSigner} and an `HttpClient` transport. Assemble them once and reuse them across factories. The client decides whether a server at a private address is reached: give the use-cases for the user's own servers (their BUD-03 list) a client built with `createHttpClient("allow-private")`, and those for servers someone else named the default refusing one. */
export interface BlossomDeps {
  readonly signer: BlossomSigner
  readonly httpClient: HttpClient
}
