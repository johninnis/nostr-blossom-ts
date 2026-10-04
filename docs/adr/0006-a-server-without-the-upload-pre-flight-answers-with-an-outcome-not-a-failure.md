# 0006. A server without the upload pre-flight answers with an outcome, not a failure

## Status

Accepted

## Context

The `HEAD /upload` (BUD-06) and `HEAD /media` (BUD-05) pre-flights are optional. A server without them answers 404, 405 or 501, which the `HttpClient` returns as a `ServerFailure`, the same shape as a server that implements the check and refuses the upload. Passing that through would make "this server cannot tell you" look like "this server will refuse", and an upload with `check: true` would fail against every server that never implemented the check. A refusal from a server that did check is also an answer, not a fault: the request worked and the server said no.

## Decision

`createCheckUpload` resolves every HTTP answer to a `CheckUploadOutcome`: `accepted` on success; `unsupported` for 404, 405 and 501; `rejected`, with the status and `X-Reason`, for any other status. Only a signing or transport failure is a `Failure`. `createUpload` with `check: true` fails only on `rejected`, and proceeds on `unsupported`, letting the upload decide.

## Consequences

- `check: true` is safe against any server.
- A server that answers 404 to a check it does implement, for a reason of its own, is read as not implementing it; the upload that follows then gets its real answer.
- Do not fold `unsupported` into `rejected` or into a failure.
