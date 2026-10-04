import type { NetworkFailure, ServerFailure, SignerFailure } from "@innis/nostr-core"

/** A Blossom request or response failed validation — an empty server list, a malformed blob descriptor or list, a signed auth event too long for its header to be read, or blob content that does not hash to the requested SHA-256. `message` says which. */
export interface ValidationFailure {
  readonly type: "validation"
  readonly message: string
}

/** Every failure a Blossom use-case can return: the `SignerFailure` of a signer that did not sign the auth event, a `ServerFailure` (HTTP status `>= 400` or a refused redirect), a transport `NetworkFailure`, or a {@link ValidationFailure}. Discriminate on `type`. */
export type BlossomFailure =
  | SignerFailure
  | ServerFailure
  | ValidationFailure
  | NetworkFailure
