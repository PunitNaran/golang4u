---

title: "The Golang4U Cryptography Bible: E2EE, ECIES & Blind Indexing"
date: 2026-02-10T16:00:00+08:00
lastmod: 2026-02-10T16:00:00+08:00
author: "Punit Naran"
authorLink: ""
description: "Going beyond HTTPS. A technical deep dive into how `golang4u` implements application-layer encryption using ECIES (Elliptic Curve Integrated Encryption Scheme) to protect sensitive user payload from the browser to the database."
tags: ["Go", "Cryptography", "ECIES", "AES", "Security", "ECDH", "WebCrypto", "HMAC"]
categories: ["Security", "Engineering Handbook"]
featuredImage: ""
---

# Preface: Why TLS is Not Enough

HTTPS (TLS 1.3) protects data "In Transit."
It prevents the Hacker in the Coffee Shop from reading your password.
But it does **not** protect against:
1.  **Malicious Proxies**: A corporate proxy (MITM) that terminates TLS.
2.  **The Server Itself**: If our logs accidentally print `req.Body`.
3.  **Memory Dumps**: If the server crashes and dumps RAM.

To fix this, we implement **End-to-End Encryption (E2EE)** at the Application Layer.
The password is encrypted *in the browser* and only decrypted *inside the Service function*.

---

# Chapter 1: The Cryptographic Suite

We chose standard, NIST-approved algorithms to ensure broad compatibility (especially with browser WebCrypto API).

### 1.1 Asymmetric: ECDH (P-256)
*   **Algorithm**: Elliptic Curve Diffie-Hellman.
*   **Curve**: NIST P-256 (also known as `prime256v1`).
*   **Why?**: Native hardware acceleration on x86/ARM. Built-in to Chrome/Firefox/Safari.

### 1.2 Symmetric: AES-GCM (256-bit)
*   **Algorithm**: Advanced Encryption Standard.
*   **Mode**: Galois/Counter Mode (GCM).
*   **Why?**: Authenticated Encryption (AEAD). It protects both **Secrecy** (Reading) and **Integrity** (Tampering). If you flip a bit in the ciphertext, decryption fails; it doesn't just produce garbage.

---

# Chapter 2: ECIES (Elliptic Curve Integrated Encryption Scheme)

Public Key crypto (ECC) is slow. You can't encrypt a 1MB file with it.
Symmetric crypto (AES) is fast. But you can't share the key safely.

**ECIES** is the "Hybrid" answer.

### 2.1 The Handshake (The Math)

Let's assume **Alice** (Browser) sends data to **Bob** (Server).

1.  **Bob** has a static keypair: $(b, B)$ where $B = b \times G$.
2.  **Alice** generates ephemeral keypair: $(a, A)$ where $A = a \times G$.
3.  **Alice** computes Shared Secret $S$:
    $$S = a \times B = a \times (b \times G)$$
4.  **Bob** computes Shared Secret $S$:
    $$S = b \times A = b \times (a \times G)$$
    $$(ab)G = (ba)G$$

They now share the secret $S$ (the coordinate on the curve) without ever transmitting it.
5.  **Alice** derives key $K = KDF(S)$.
6.  **Alice** encrypts message $C = AES_{GCM}(M, K)$.
7.  **Alice** sends: $[A] + [Nonce] + [C]$.

---

# Chapter 3: The Implementation (`internal/security`)

### 3.1 Backend Key Loading (`LoadOrGenerateKey`)

We need a persistent identity.
In `internal/security/keys.go`:

```go
func LoadOrGenerateKey(path string) (*ecdh.PrivateKey, error) {
    // 1. Try Read PEM from Disk
    // ...
    
    // 2. Generate New (P-256)
    priv, err := ecdh.P256().GenerateKey(rand.Reader)
    
    // 3. Save to Disk (PEM encoded)
    // ...
    return priv, nil
}
```

This Key is the "Server Identity".

### 3.2 The Decryption Function (`DecryptECIES`)

When the server receives the payload, it must unpack it.
Our format is critical: `Uncompressed_Pub_Key (65 bytes) || Nonce (12 bytes) || Ciphertext`.

```go
func DecryptECIES(serverPriv *ecdh.PrivateKey, payloadHex string) ([]byte, error) {
    // 1. Decode Hex
    data, _ := hex.DecodeString(payloadHex)
    
    // 2. Extract Parts
    clientPubBytes := data[:65]
    nonce := data[65:77]
    ciphertext := data[77:]
    
    // 3. Parse Client Ephemeral Public Key
    clientPub, _ := ecdh.P256().NewPublicKey(clientPubBytes)
    
    // 4. ECDH (Perform the math)
    sharedSecret, _ := serverPriv.ECDH(clientPub)
    
    // 5. Decrypt using Shared Secret as AES Key
    // (Note: In production we use HKDF on sharedSecret, 
    // strictly, P-256 x coordinate is 32 bytes, fits AES-256)
    block, _ := aes.NewCipher(sharedSecret)
    gcm, _ := cipher.NewGCM(block)
    
    plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
    return plaintext, err
}
```

---

# Chapter 4: Privacy & The Blind Index

We treat user data (Email) as toxic waste. We encrypt it at rest.
`User.EncryptedEmail` = `a8d29f...`.

However, we have a problem: **Uniqueness**.
We need to ensure `bob@gmail.com` doesn't sign up twice.
But `Encrypt("bob@gmail.com")` produces a *different* ciphertext every time (because of the random Nonce).
We cannot query `WHERE email = '...'`.

### 4.1 The Solution: HMAC Blind Indexing

We create a separate field: `BlindIndex`.
This is a deterministic hash.
$$Index = HMAC_{SHA256}(Email, Server\_Secret\_Search\_Key)$$

*   We store:
    *   `EncryptedEmail`: Use for sending emails (Decryptable).
    *   `BlindIndex`: Use for searching/uniqueness (Not Decryptable).

### 4.2 Why HMAC? Why not SHA256?
Plain `SHA256(email)` is vulnerable to **Rainbow Tables**. An attacker can pre-calculate the hash of every email on earth.
`HMAC` requires a Secret Key. If the database leaks, the attacker has the hashes, but not the Secret Key. They cannot reverse the hashes (because hashes are one-way), and they cannot brute-force them (because they don't have the key).

In `internal/service/user_service.go`:

```go
// Calculate Blind Index
hash := hmac.New(sha256.New, []byte(os.Getenv("SEARCH_KEY")))
hash.Write([]byte(plainEmail))
index := hex.EncodeToString(hash.Sum(nil))

// Check DB
if s.db.Exists("idx_email_" + index) {
    return Error("Email Taken")
}
```

This guarantees **k-anonymity** and **uniqueness** simultaneously.

---

# Chapter 5: Frontend Integration (Web Crypto)

The backend is only half the story. The browser must do the encryption.
We use the native `window.crypto.subtle` API. No `npm install`.

1.  **ImportKey**: Browser imports Server Public Key (SPKI).
2.  **GenerateKey**: Browser makes ephemeral EC Keypair.
3.  **DeriveKey**: ECDH + AES-GCM context.
4.  **Encrypt**: AES-GCM Encrypt password.
5.  **Export**: Pack bytes and Hex encode.

This ensures that the plaintext password **never** travels over the network.

---

# Conclusion

We have built a system where:
1.  **Secrecy**: Only the Server can read the data (ECIES).
2.  **Privacy**: Even the DB admin cannot read the data (AES-GCM at rest).
3.  **Integrity**: No one can tamper with the data (GCM Tags).
4.  **Searchability**: We can still enforce rules (Blind Indexing).

This is cryptographic engineering at its finest.
