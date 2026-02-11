# The Evolution of Authentication: JWT, PASETO, and PASERK


# Introduction

Authentication is the bedrock of modern application security. For years, developers have reached for **JWT (JSON Web Tokens)** as the default tool for stateless authentication.

But standards evolve. Vulnerabilities are found. Better tools are built.

In this deep dive, we will trace the evolution of token security:
1.  **Generation 1: JWT (RFC 7519)** - The Standard with Footguns.
2.  **Generation 2: PASETO (Platform-Agnostic Security Tokens)** - The Secure Replacement.
3.  **Generation 3: PASERK (Platform-Agnostic SERialized Keys)** - The Key Management Layer.

We will strictly analyze *why* Golang4U moved to PASETO and how it prepares us for a PASERK future.

---

# Part 1: The JWT Era (and its Cracks)

JWTs are flexible. Too flexible. A JWT header looks like this:

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

The `alg` field tells the server *how* to verify the token. This design choice—letting the client specify the crypto—led to catastrophic vulnerabilities.

### 1.1 The "None" Algorithm
The spec defined `alg: none` for debugging.
*   **Attack**: An attacker sends a token with `{"alg": "none"}` and removes the signature.
*   **Result**: Naive libraries see "none", skip verification, and accept the token as valid.

### 1.2 Algorithm Confusion (The RSA -> HMAC Attack)
This is a classic cryptographic downgrade attack.
*   **Scenario**: Server supports `RS256` (Public/Private key) but also `HS256` (Shared secret).
*   **Attack**: 
    1.  Attacker gets the Server's **Public Key** (it's public!).
    2.  Attacker creates a malicious token.
    3.  Attacker sets header to `{"alg": "HS256"}`.
    4.  Attacker signs the token using the **Public Key** as the HMAC secret.
*   **Result**: The server sees `HS256`, looks up its verification key (which it thinks is the Public Key), treats it as an HMAC secret, hashes the token, and... **IT MATCHES**. The attacker has forged a valid token using only public data.

---

# Part 2: PASETO (The Fix)

**PASETO** (Platform-Agnostic Security Tokens) was designed by security experts to eliminate these choices. It is **versioned**, not negotiated.

### 2.1 The Format
`v4.public.payload.footer`

*   **v4**: Defines the *exact* cipher suite. No choices. No implementation errors.
*   **public**: Defines the purpose (Public Key Signatures).

### 2.2 Why v4?
Golang4U uses **PASETO v4** because it uses state-of-the-art cryptography:
*   **Signatures**: **Ed25519**. Fast, constant-time, and resistant to side-channel attacks.
*   **Encryption**: **XChaCha20-Poly1305**. A stream cipher that is faster than AES on mobile devices and doesn't require hardware acceleration to be secure.

### 2.3 Implementation in Go

In `Golang4U`, we use `aidantwoods/go-paseto`. Here is how we enforce strict security rules.

```go
// internal/token/paseto_maker.go

func (maker *PasetoMaker) VerifyToken(token string) (*PasetoPayload, error) {
    parser := paseto.NewParser()
    
    // Rule 1: Must not be expired
    parser.AddRule(paseto.NotExpired())
    
    // Rule 2: Must be issued by US
    parser.AddRule(paseto.IssuedBy("Golang4U"))
    
    // Rule 3: Must be intended for 'access' (not refresh)
    parser.AddRule(paseto.Subject("access_token"))
    
    parsedToken, err := parser.ParseV4Public(maker.publicKey, token, nil)
    if err != nil {
        return nil, ErrInvalidToken
    }
    
    return payloadFromToken(parsedToken), nil
}
```

---

# Part 3: PASERK (The Future of Keys)

So we have secure tokens. But how do we manage the **Keys**?
If I send you a string `d8291...`, is it a Public Key? A Private Key? An AES key? Algorithm specific?

This is where **PASERK (Platform-Agnostic SERialized Keys)** comes in. It is to Keys what PASETO is to Tokens.

### 3.1 The Problem PASERK Solves
"Key Confusion" is as dangerous as Token Algorithm confusion. If you accidentally paste a Private Key into a Public Key configuration field, you might expose your secrets.

### 3.2 The Format
PASERK wraps keys in a type-safe, versioned string format.

*   `k4.public.d82...` -> This is clearly a v4 Public Key.
*   `k4.secret.a19...` -> This is clearly a v4 Secret Key.
*   `k4.lid...` -> Local Key ID.

### 3.3 Wrapping Keys (Key Wrapping)
PASERK also defines standard ways to **encrypt keys** for transport.
Example: `k4.seal...`
This allows us to store our Ed25519 private keys in the database, *encrypted by a Master Key*, in a standard format that any PASERK-aware library can decrypt.

**Theoretical Implementation:**

```go
// Future-proofing Golang4U with PASERK

func RotateKeys() string {
    // Generate new Keypair
    secretKey := paseto.NewV4AsymmetricSecretKey()
    
    // Serialize to PASERK for safe storage
    paserkString := secretKey.ExportPaserk() // "k4.secret....."
    
    // In the future, we might wrap this with a master key
    // wrapped := paserk.Wrap(masterKey, secretKey)
    
    return paserkString
}
```

---

# Part 4: Beyond the Token (mTLS & Hitless TLS)

Secure authentication is only one layer correctly. As we scale Golang4U, we look at the transport layer itself.

### 4.1 mTLS (Mutual TLS)
Standard TLS proves the **Server's** identity to the Client ("You are really google.com").
**mTLS** proves the **Client's** identity to the Server ("You are really valid-service-A").

In a microservices architecture (e.g., if we split `Golang4U` into `AuthService` and `PostService`), we would use mTLS.
1.  **PostService** presents a Client Certificate signed by our internal CA.
2.  **AuthService** verifies the certificate.
3.  If valid, the connection is allowed.
This happens *before* any PASETO token is even sent. It is "Zero Trust" networking.

### 4.2 Hitless TLS (Session Resumption)
Establishing a TLS handshake is expensive (multiple round-trips).
**Hitless TLS** (or Session Resumption) allows a client to reconnect quickly without a full handshake, using a **Session Ticket**.
*   **Danger**: If the "Ticket Key" on the server is compromised, *all* previous sessions can be decrypted (Forward Secrecy violation).
*   **Golang4U Key Rotation**: We configure our `tls.Config` to rotate Session Ticket Keys hourly, preserving Forward Secrecy while maintaining performance.

---

# Conclusion

Security is a moving target.
1.  **JWT** served us well but showed its age with cryptographic footguns.
2.  **PASETO** fixes the protocol level, giving us versioned, secure-by-default tokens.
3.  **PASERK** simplifies the management of the keys themselves.

By choosing PASETO v4 (`Ed25519`) today, Golang4U is well-positioned to adopt PASERK and mTLS strategies as we scale from a monolith to a distributed system.

