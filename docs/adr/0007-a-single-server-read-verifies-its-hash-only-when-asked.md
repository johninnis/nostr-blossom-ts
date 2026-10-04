# 0007. A single-server read verifies its hash only when asked

## Status

Accepted

## Context

A blob is addressed by its SHA-256, so a client can check that what it received is what it asked for. Always hashing looks like the safe default. But hashing a large blob costs a full pass over it, and a host reading from its own server, or one that hands the bytes to something that verifies them anyway, pays it for nothing. Where the server is not chosen by the user, reading through a fallback chain of servers that other people named, a lying or corrupt server is the expected case, and an unverified byte is never acceptable.

## Decision

`createGetBlob` hashes the body and compares it with the requested hash only when called with `verify: true`. `createGetBlobWithFallback` always verifies, and a server whose bytes do not match counts as a failure and the chain moves on.

## Consequences

- A caller reading from one server it trusts pays no hashing cost.
- A caller reading from servers it did not choose uses the fallback chain, or passes `verify: true`.
- Do not make the fallback chain's verification optional: moving past a lying server is its purpose.
