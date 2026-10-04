# 0002. Every token names the server it is sent to

## Status

Accepted

## Context

BUD-11 lets a token carry `server` tags, each a lowercase domain, and a server that finds them must check its own domain is among them; a token without them is valid on every server. BUD-11's security considerations warn that an unscoped token, if intercepted, can be replayed on any other server until it expires, and single out `delete`: one leaked delete token removes the same blob from every server holding it. Leaving the tag out is what most clients do, and blossom-client-sdk adds it only when its caller asks. One token for several servers would save a signature during a mirror fan-out, but this package already signs one token per request, so the scope costs nothing.

## Decision

`createAuthorisedRequest` passes the request's `ServerUrl` to `createUnsignedAuthEvent`, which writes one `server` tag holding that URL's hostname: lowercase, with no scheme, port or path. Every token this package sends is valid on the server it was sent to and nowhere else. `createUnsignedAuthEvent` used on its own writes the tag only when given a server.

## Consequences

- A token that leaks from one server, through its logs or a compromised operator, cannot delete, upload, list or read on another.
- A server that checks `server` tags matches on the domain (shared nostr-adrs ADR-0063); one that compared full URLs would refuse these tokens, and would be non-conformant.
- The in-memory test network refuses a token scoped to another server but, as BUD-11 does, accepts one with no `server` tag, so a use-case that dropped the tag would still pass there; the scope is pinned by the authorised-request test.
- Do not remove the tag to share a token between servers: that is the replay BUD-11 warns about.
