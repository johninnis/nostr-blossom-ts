import type { NetworkError, ServerError, SigningError } from "@innis/nostr-core"
import { TaggedError } from "@innis/nostr-core"

/** A Blossom input or response failed validation — an invalid hash or server URL, or a malformed blob descriptor. Carries the `"ValidationError"` tag. */
export class ValidationError extends TaggedError<"ValidationError"> {
  constructor(message: string) {
    super("ValidationError", message)
  }
}

/** Every failure a Blossom use-case can return: a `SigningError`, an HTTP `>= 400` `ServerError`, a transport `NetworkError`, or a {@link ValidationError}. Each member carries a `tag` discriminant. */
export type BlossomError =
  | SigningError
  | ServerError
  | ValidationError
  | NetworkError
