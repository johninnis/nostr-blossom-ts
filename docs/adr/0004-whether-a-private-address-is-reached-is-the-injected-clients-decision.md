# 0004. Whether a private address is reached is the injected client's decision

## Status

Accepted

## Context

A server URL can come from the user's own BUD-03 list, where a server on `localhost` or the LAN is legitimate, or from someone else's event, where a private address is a request-forgery vector against the user's network. It looks natural for each use-case to decide: allow private addresses for uploads, which go to the user's servers, and refuse them for reads. But a use-case does not know whose server a URL names. A read signs a token (ADR-0001) for any server a blob is fetched from, including another user's BUD-03 servers, so signing for a server is not evidence that it is the user's; and a user's own server may be read from as well as written to. Only the host knows where each URL came from.

## Decision

No use-case sets a private-address policy. A server at a private, loopback or link-local address, or `localhost`, is reached exactly when the `HttpClient` in `BlossomDeps` reaches one. The host builds the use-cases for its user's own servers with `createHttpClient("allow-private")` and those for servers someone else named with the default refusing client.

## Consequences

- One rule, in one place: the client the host chose.
- A host that wires a single allowing client for everything exposes its network to URLs from other people's events. The README and `BlossomDeps` say which client goes where.
- Do not add a per-use-case override: it would put back a decision the use-case cannot make correctly.
