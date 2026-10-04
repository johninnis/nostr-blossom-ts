# 0005. A blob read is capped at its expected size, else at 256 MiB

## Status

Accepted

## Context

`createGetBlob` reads a whole blob into memory as a `Blob`. The `HttpClient`'s default body ceiling is sized for JSON and would refuse ordinary media; lifting the ceiling altogether lets one server, or a redirect target, exhaust a browser tab with an endless body. A caller usually knows the size it expects, from the `BlobDescriptor` it listed, and a blob larger than its descriptor says is wrong whatever it contains.

## Decision

`createGetBlob` and `createGetBlobWithFallback` take an optional `expectedSize` and cap the body read at it. Without one they cap at `DEFAULT_MAX_BLOB_BYTES`, 256 MiB. Every other request reads JSON or nothing and keeps the client's default ceiling.

## Consequences

- A body larger than the cap fails as the client's body-size failure, before it is held in memory.
- A blob over 256 MiB of unknown size cannot be read through this package without passing its size.
- Do not remove the default to make large downloads work: pass `expectedSize`.
