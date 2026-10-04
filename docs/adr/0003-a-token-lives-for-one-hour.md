# 0003. A token lives for one hour

## Status

Accepted

## Context

BUD-11 requires a NIP-40 `expiration` tag on every token and leaves its distance from `created_at` to the client. A short life looks safer, since a leaked token is useful for less time, and this package used sixty seconds. But `created_at` is stamped before signing, and the token is checked by the server only when it handles the request: a remote signer waiting on the user's approval, and the upload of a large body over a slow link, both happen inside that window, and a server that reads the whole body before running its handler checks the expiry after the upload ends. Sixty seconds fails uploads of ordinary video. blossom-client-sdk and the PHP twin's example use one hour. Every token this package sends is also scoped to one server (ADR-0002) and, for writes and reads, to one blob, so a longer life widens little.

## Decision

`BLOSSOM_AUTH_EXPIRATION_SECONDS` is 3600, the default distance from `created_at` to the `expiration` tag. A caller of `createUnsignedAuthEvent` may still state its own expiry.

## Consequences

- An upload or a signer approval that takes minutes still lands with a live token.
- A leaked token stays usable for up to an hour, on the one server and the one blob it names; a `list` token names no blob and so lets its holder list the user's blobs on that server for that hour.
- Do not shorten the default to tighten security: the cost lands on large uploads and remote signers, and the scope tags are the protection.
