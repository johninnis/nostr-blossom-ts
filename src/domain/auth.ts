import type { Tag, UnsignedEvent } from "@innis/nostr-core"
import { KIND_BLOSSOM_AUTHORISATION, now } from "@innis/nostr-core"
import type { AuthAction, ServerUrl, Sha256 } from "./types.ts"

// Deliberate: an hour, not a minute: the token must outlive a remote signer's approval and the upload of its body — see ADR-0003
/** Default lifetime, in seconds, of a Blossom auth event's NIP-40 `expiration` tag when no explicit expiry is supplied: one hour. */
export const BLOSSOM_AUTH_EXPIRATION_SECONDS = 60 * 60

interface AuthEventInput {
  readonly action: AuthAction
  readonly content: string
  readonly expiration?: number
  readonly createdAt?: number
  readonly hashes?: ReadonlyArray<Sha256> | undefined
  readonly server?: ServerUrl | undefined
}

const hashTags = (hashes: ReadonlyArray<Sha256>): ReadonlyArray<Tag> => hashes.map((hash) => ["x", hash])

const serverTags = (server: ServerUrl | undefined): ReadonlyArray<Tag> =>
  server === undefined ? [] : [["server", new URL(server).hostname]]

/**
 * Build the unsigned kind-24242 Blossom authorisation event (BUD-11): a `t` action tag, a NIP-40 `expiration` tag
 * (defaulting to {@link BLOSSOM_AUTH_EXPIRATION_SECONDS} after `createdAt`), an `x` tag per entry in `hashes`, and,
 * when `server` is given, a `server` tag naming its domain, so the token is valid on that server alone. `createdAt`
 * defaults to the system clock — pin it for deterministic output. The caller signs the result via
 * `BlossomSigner.signEvent`.
 */
export const createUnsignedAuthEvent = (input: AuthEventInput): UnsignedEvent => {
  const createdAt = input.createdAt ?? now()
  return {
    kind: KIND_BLOSSOM_AUTHORISATION,
    content: input.content,
    created_at: createdAt,
    tags: [
      ["t", input.action],
      ["expiration", String(input.expiration ?? createdAt + BLOSSOM_AUTH_EXPIRATION_SECONDS)],
      ...hashTags(input.hashes ?? []),
      ...serverTags(input.server),
    ],
  }
}
