# 0001. Get and head always sign a token

## Status

Accepted

## Context

BUD-11 marks the `x` tag optional for `GET /<sha256>` and `HEAD /<sha256>`, and BUD-01 serves public blobs to anyone, so a token on a read looks like wasted work: a signature per download, and with a remote signer a round trip or a prompt. Reading without a token is what a client fetching public media does. This package exists to manage the user's own storage, where servers may gate reads per pubkey and blobs may be private; a read without a token fails there, and a read that tries anonymously first and signs on a 401 costs two requests and a second code path.

## Decision

`createGetBlob` and `createHeadBlob` always send a `get` token naming the blob's hash, through the same authorised request as every other endpoint. There is no anonymous read.

## Consequences

- One read works against every server: one that requires a token gets one, one that does not ignores it.
- Every read signs an event. A host that only needs public media fetches the blob URL directly rather than through this package.
- Because a read signs for any server a blob is fetched from, signing for a server is not evidence that it is the user's own (ADR-0004).
- Do not add an unsigned fast path to these use-cases: it is a second way to read, and it fails exactly where this package is needed.
