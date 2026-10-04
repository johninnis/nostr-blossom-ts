# 0008. A blob's content type is read from the response header

## Status

Accepted

## Context

`createGetBlob` returns the body as a `Blob`, and a `Blob` has a `type`, so reading the content type from it looks like the obvious source. The `HttpClient` port promises a `Blob` of the body's bytes, not one carrying the response's media type, and an implementation that builds the `Blob` from the bytes alone leaves `type` empty. BUD-01 makes the server state the type in `Content-Type`, and default to `application/octet-stream` when it does not know it.

## Decision

`createGetBlob` reads `contentType` from the response's `Content-Type` header, and uses `application/octet-stream` when there is none. It never reads the `Blob`'s own `type`.

## Consequences

- The content type is the same through any `HttpClient` implementation.
- Do not "simplify" to `data.type`: it is empty through clients the port allows.
