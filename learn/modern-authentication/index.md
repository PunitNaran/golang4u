# The Golang4U Authentication Bible: PASETO, Usage & Design


# Preface: Authentication vs Authorization

First, a distinction.
*   **Authentication (AuthN)**: "Who are you?" (I am User 123).
*   **Authorization (AuthZ)**: "What can you do?" (I can delete posts).

This, guide focuses on **AuthN**. specifically, how we securely identify a user across stateless HTTP requests.

---

# Chapter 1: The Fall of JWT (JSON Web Tokens)

For a decade, JWT (RFC 7519) was the king. But heavy lies the crown.
A JWT is a string: `header.payload.signature`.

### The Design Flaw: Cipher Agility
The header tells the server how to verify the token.
```json
{ "alg": "HS256", "typ": "JWT" }
```
This "Cipher Agility" is a disaster.
1.  **Alg="None" Attack**: Attackers change `HS256` to `None` and strip the signature. Many libraries defaulted to trusting the header.
2.  **Algorithm Confusion**: Attackers change `RS256` (Asymmetric) to `HS256` (Symmetric). They sign the token using the Public Key (which they have) as the "Secret Key". The server verifies it using the Public Key (thinking it's the Secret Key). It matches. hacked.

### The PASETO Solution
**PASETO** (Platform-Agnostic Security Tokens) removes the choice.
Format: `v4.public.payload.footer`

*   **v4**: This Version implies exactly `Ed25519` for signatures. No negotiation.
*   **public**: This Purpose implies Asymmetric crypto.

If you send a `v2` token, the server rejects it. If you send a `local` token to a `public` endpoint, the server rejects it. The protocol is strict.

---

# Chapter 2: The Key Standard (PASERK)

Managing keys is hard. Is this 32-byte string an AES key? An Ed25519 Seed? A Curve25519 Point?
We use **PASERK** (Platform-Agnostic SERialized Keys).

### 2.1 The Format
`k4.local.A8F92...`

*   **k4**: Version 4.
*   **local**: Symmetric Key type.
*   **Data**: Base64URL encoded key.

### 2.2 Parsing Logic (`internal/token/paseto.go`)
We enforce this format in our code.

```go
func getV4SymmetricKey(keyStr string) (paseto.V4SymmetricKey, error) {
    // 1. Check Prefix (Type Safety)
    if !strings.HasPrefix(keyStr, "k4.local.") {
         return paseto.V4SymmetricKey{}, fmt.Errorf("invalid key format")
    }

    // 2. Decode Payload
    encoded := strings.TrimPrefix(keyStr, "k4.local.")
    bytes, _ := base64.RawURLEncoding.DecodeString(encoded)
    
    // 3. Import Key
    return paseto.V4SymmetricKeyFromBytes(bytes)
}
```

This prevents "Key Confusion" at the configuration level. You cannot accidentally use a `v2` key.

---

# Chapter 3: The Token Maker (`PasetoMaker`)

In `internal/token/paseto.go`, we define the `Maker` interface.

```go
type Maker interface {
    CreateToken(username string, duration time.Duration) (string, *Payload, error)
    VerifyToken(token string) (*Payload, error)
}
```

### 3.1 Creating the Token
When `CreateUser` or `Login` succeeds, we mint a token:

```go
func (maker *PasetoMaker) CreateToken(username string, duration time.Duration) (string, *Payload, error) {
    tokenObj := paseto.NewToken()
    
    // Standard Claims (RFC 7519 mapping)
    tokenObj.SetJti(uuid.NewString())     // Unique ID
    tokenObj.SetIssuedAt(time.Now())      // iat
    tokenObj.SetNotBefore(time.Now())     // nbf
    tokenObj.SetExpiration(time.Now().Add(duration)) // exp
    
    // Custom Claims
    tokenObj.Set("username", username)
    tokenObj.Set("role", "user")

    // Encrypt (Symmetric V4 Local)
    encrypted := tokenObj.V4Encrypt(maker.symmetricKey, nil)
    return encrypted, payload, nil
}
```

**Why specific timestamps?**
*   `IssuedAt`: Good for audit logs.
*   `NotBefore`: Prevents a token from being used if "created in the future" (Clock Skew protection).
*   `Expiration`: Mandatory.

### 3.2 Verifying the Token
This is the most critical function in the system.

```go
func (maker *PasetoMaker) VerifyToken(token string) (*Payload, error) {
    parser := paseto.NewParser()
    
    // 1. Rule: Must not be expired
    parser.AddRule(paseto.NotExpired())
    
    // 2. Rule: Must NOT have a footer (Anti-Tamper)
    // Attackers sometimes hide data in unencrypted footers.
    // We enforce a "Closed System".
    // (Note: library specific implementation varies, manual check below)
    
    tokenObj, err := parser.ParseV4Local(maker.symmetricKey, token, nil)
    if err != nil {
        return nil, ErrInvalidToken
    }
    
    // 3. Manual Footer Check
    if len(tokenObj.Footer()) > 0 {
        return nil, fmt.Errorf("footer not allowed")
    }

    return payloadFromToken(tokenObj), nil
}
```

---

# Chapter 4: The Middleware (`PasetoMW`)

How do we protect routes?
In `internal/paseto_middleware/paseto.go`.

### 4.1 Lookup Strategy
We support multiple clients (Web, CLI, Mobile).
We look for the token in this order:
1.  **Cookie**: `access_token` (Web Browser, prevents XSS reading).
2.  **Header**: `Authorization: Bearer ...` (CLI/Mobile/Postman).

```go
func createTokenExtractor(lookup "cookie:access_token,header:Authorization") {
    // splits string and returns a function that checks cookie then header
}
```

### 4.2 The Interceptor
```go
func (pmw *PasetoMW) Paseto(next echo.HandlerFunc) echo.HandlerFunc {
    return func(c echo.Context) error {
        // 1. Extract Token
        tokenStr := extractToken(c)
        if tokenStr == "" {
             return c.JSON(401, "Missing Token")
        }

        // 2. Verify Crypto
        payload, err := pmw.maker.VerifyToken(tokenStr)
        if err != nil {
             return c.JSON(401, "Invalid Token")
        }

        // 3. Inject into Context
        // This is why handlers can do: user := c.Get("user")
        c.Set("user", payload)

        return next(c)
    }
}
```

---

# Chapter 5: Access vs Refresh Strategy

We use a **Dual Token System**.

### 5.1 Access Token (The "Wristband")
*   **Type**: PASETO v4 Local.
*   **Lifetime**: 15 Minutes.
*   **Storage**: **HttpOnly** Cookie.
*   **Logic**: Stateless. If the signature is valid, you are in.

### 5.2 Refresh Token (The "Ticket Stub")
*   **Type**: PASETO v4 Local (Different Key!).
*   **Lifetime**: 7 Days.
*   **Storage**: **HttpOnly** Cookie (Path=`/refresh`).
*   **Logic**: **Stateful**.

**The Refresh Flow**:
1.  Access Token expires (401).
2.  Frontend calls `POST /refresh` (Browser sends Refresh Cookie automatically).
3.  Server verifies Refresh Token signature.
4.  **Critical Step**: Server checks DB: "Is User 123 Banned? Is Version matches?"
5.  If OK, Server issues NEW Access Token (15 mins) and NEW Refresh Token (7 days).

**Why Rotate Refresh Tokens?**
If a hacker steals your Refresh Token, they have 7 days of access.
By Rotating it (issuing a new one on every use), we detect theft.
*   If the Hacker uses the Old Token -> We detect reuse -> We invalid the entire family of tokens. (Reuse Detection).

---

# Conclusion

Golang4U's Auth system is not just "import a library."
It is a carefully designed machine:
1.  **Strict Crypto**: PASETO v4 + PASERK.
2.  **Strict Middleware**: Order of operations (Cookie -> Header -> Verify).
3.  **Strict Lifecycle**: Access (15m) / Refresh (7d) Rotation.

This provides the speed of stateless architecture with the security controls of stateful sessions.

