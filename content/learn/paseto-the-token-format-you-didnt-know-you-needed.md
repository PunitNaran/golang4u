---

title: "PASETO: The Token Format You Didn't Know You Needed"
date: 2026-10-15T09:00:00+00:00
author: "Punit Naran"
description: "PASETO: The Token Format You Didn't Know You Needed"
tags: ["Go", "Auth", "Cryptography"]
draft: true
---


JWT has been the default for 10 years, and the default is the problem:
every JWT deployment is *its own* crypto stack, and 80% of them get at
least one of `alg`, `aud`, `kid`, or the signature **wrong**. PASETO
(Pawn's Authenticated Secure Token Encoding, v2) is the "boring"
alternative: one format, no `alg` field, no `kid`, no header/body
confusion, and the *entire* crypto story is a single call to
`paseto.Create(v2.Public, payload, key)`. This post is the Go story:
why PASETO is the right default for a Go service that does its own
tokens, and the *exact* 30-line wrapper you'd write.

## The four types, and why you only need two

| Type | Purpose | Go call |
|------|---------|---------|
| v1 public | symmetric (HMAC-SHA256) | `paseto.CreateV1Public(payload, key)` |
| v1 private | symmetric (AES-256-CTR + HMAC-SHA256) | `paseto.CreateV1Private(payload, key)` |
| v2 public | asymmetric (X25519 + ChaCha20Poly1305) | `paseto.CreateV2Public(payload, privKey)` |
| v2 private | asymmetric (ECDSA-P256 + Ed25519) | `paseto.CreateV2Private(payload, privKey)` |

For a service that issues *short-lived* tokens (15 min) and *long-lived*
refresh tokens (30 days), the right split is:

- **v2 public (X25519)** for the access token: *public* means the
  recipient (any node) can verify with just the *public* key; the
  *issuer* (only one machine) signs with the *private* key. No shared
  secret, no HSM, no "who has the key" class of bug.
- **v1 private (AES-256)** for the refresh token: symmetric, one key
  shared between the two ends, and the *recipient* can revoke by just
  deleting the token (a JWT can't be revoked without a blacklist).

## The 30-line wrapper (the whole service)

```go
type PasetoMaker struct {
    v2Priv *ed25519.PrivateKey  // sign: v2 public (access tokens)
    v1Key  [32]byte              // encrypt: v1 private (refresh tokens)
}

func (m *PasetoMaker) Access(p Payload) (string, error) {
    tok, err := paseto.CreateV2Public(p.JWTClaims, m.v2Priv)
    return string(tok), err
}

func (m *PasetoMaker) Refresh(p Payload) (string, error) {
    tok, err := paseto.CreateV1Private(p.JWTClaims, m.v1Key)
    return string(tok), err
}

func (m *PasetoMaker) Verify(s string) (Payload, bool) {
    t, err := paseto.ParseV2Public(s, m.v2Pub)
    if err != nil {
        return Payload{}, false
    }
    return t.Claims(), true
}
```

That's the entire *token* layer of a Go service. The `paseto` package
([github.com/davidgfhe/paseto-go](https://github.com/davidgfhe/paseto-go))
is a single import, zero config, no `alg`/`kid` fields to get wrong. The
*only* thing you manage is the 32-byte private key (in an HSM / env /
env-var, *not* in code) and the 256-bit symmetric key (in the same place).

## The 3 mistakes JWT makes that PASETO doesn't

1. **No `alg: "none"`**: a JWT with `alg: "none"` is a *bug*; a PASETO
   with no public key is *impossible*. The `alg` field doesn't exist.
2. **No `kid`/`jku`/`jwks`**: a PASETO is *self-contained*; the verifier
   needs exactly one public key. A JWT with `kid: "k1"` and a JWKS URL
   is a *network round-trip* on every verify; a PASETO is a *function
   call*.
3. **No `aud` mismatch class of bug**: a PASETO has *one* audience, the
   one that *issued* it. There's no "the token was issued for service A
   but is being used for service B" class of bug, because there's no
   *separate* audience field to set.

## The one-line summary

If your Go service issues tokens and you haven't picked a format yet,
**pick PASETO**. The 30-line wrapper above is the *entire* token layer;
the `paseto` package does the crypto; your job is just to *not* store
the private key in a `.env` file that gets committed.
