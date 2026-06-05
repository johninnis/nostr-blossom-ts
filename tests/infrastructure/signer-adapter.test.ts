import { assert, assertEquals } from "@std/assert"
import { createLocalSigner, generateSecretKey } from "@innis/nostr-core"
import { adaptSigner } from "../../src/infrastructure/signer-adapter.ts"

const unsigned = { kind: 1, content: "hi", created_at: 0, tags: [] }

Deno.test("adaptSigner wraps a successful signature in ok", async () => {
  const signer = adaptSigner(createLocalSigner(generateSecretKey()))

  const result = await signer.sign(unsigned)

  assert(result.success)
  assertEquals(result.value.kind, 1)
  assertEquals(result.value.content, "hi")
})

Deno.test("adaptSigner converts a thrown signing error into a SigningError failure", async () => {
  const signer = adaptSigner({
    ...createLocalSigner(generateSecretKey()),
    signEvent: () => Promise.reject(new Error("nope")),
  })

  const result = await signer.sign(unsigned)

  assert(!result.success)
  assertEquals(result.error.tag, "SigningError")
})
