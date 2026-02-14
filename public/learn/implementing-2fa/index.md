# The Golang4U 2FA Bible: TOTP, QR Codes & State Machines


# Preface: The 3 Factors of Auth

Authentication is proving you are who you say you are. There are 3 ways to do this:
1.  **Something you Know (Knowledge)**: Password, PIN, Mother's Maiden Name.
2.  **Something you Have (Possession)**: Phone, YubiKey, RSA Token.
3.  **Something you Are (Inherence)**: Fingerprint, FaceID, Retina.

A Password alone is weak because it can be phished.
**2FA (Two-Factor)** combines #1 and #2. Even if a hacker phishes your password, they cannot physically steal your phone over the internet.

---

# Chapter 1: The TOTP Standard (RFC 6238)

We use **TOTP** (Time-based One-Time Password).
This is the standard used by Google Authenticator, Authy, etc.

### 1.1 The Math
It is a function of Time ($T$) and a Secret Keys ($K$).

$$OTP = Truncate(HMAC_{SHA1}(K, \lfloor \frac{CurrentTime}{30} \rfloor))$$

*   **Step 1**: Get Unix Epoch Time (seconds since 1970).
*   **Step 2**: Divide by 30 (floor). This creates a "Time Step". The code is valid for 30 seconds.
*   **Step 3**: Hash the Step with the Secret Key ($K$).
*   **Step 4**: Take the last 4 bits of the hash to find an offset.
*   **Step 5**: Extract 4 bytes from the hash at that offset.
*   **Step 6**: Modulo 1,000,000 to get a 6-digit number.

### 1.2 The "Shared Secret"
The magic is that both the Server and your Phone perform this same math independently.
They only need to share $K$ once (via the QR Code).

---

# Chapter 2: The Implementation (`internal/service`)

The biggest risk in 2FA is **User Lockout**.
If we enable 2FA on the account *before* the user has successfully scanned the QR code, and their camera breaks... they are locked out forever.

We implement a **3-Phase Commit Protocol**.

### Phase 1: Setup (The Proposal)

User visits `/2fa/setup`.
We generate the secret, but we DO NOT save it to the user profile yet.

```go
// internal/service/user_service.go

func (s *UserService) Setup2FA(username string) ([]byte, error) {
    // 1. Generate Random Secret (20 bytes)
    otp, _ := twofactor.NewTOTP(username, "Golang4U", crypto.SHA1, 6)
    
    // 2. Serialize Secret
    secretBytes, _ := otp.ToBytes() // This is "K"
    
    // 3. Store in TTL Cache (Temporary!)
    // We store it for 10 minutes. If they don't finish setup, it vanishes.
    s.ttlDB.Set(username+"_2fa_pending", secretBytes, 10*time.Minute)
    
    // 4. Return QR Code (PNG)
    return otp.QR()
}
```

### Phase 2: Activation (The Proof)

User scans QR, types `123456`. Sends to `/2fa/activate`.

```go
func (s *UserService) Activate2FA(username, pin string) error {
    // 1. Retrieve Pending Secret from Cache
    item := s.ttlDB.Get(username + "_2fa_pending")
    if item == nil {
        return Error("Setup Expired. Start over.")
    }
    
    // 2. Validate The PIN
    // Does math(Secret, Time) == pin?
    secret := item.Value().([]byte)
    valid := twofactor.Validate(secret, pin) 
    
    if !valid {
         return Error("Wrong Code")
    }
    
    // 3. COMMIT (Persistence)
    // NOW we save it to the DB.
    user.Profile.TwoFactorSecret = secret
    s.repo.Save(user)
    
    // 4. Cleanup
    s.ttlDB.Delete(username + "_2fa_pending")
    
    return nil
}
```

This guarantees that 2FA is only enabled if the user has proved they can generate codes.

### Phase 3: Verification (The Login)

In `internal/handler/login.go`:

```go
func (h *Handler) Login(...) {
    // Check Password... OK.
    
    if len(user.TwoFactorSecret) > 0 {
        // 2FA is Enabled.
        // DO NOT return Access Token.
        // Return a "Temporary Auth Token".
        return c.JSON(200, {
            "status": "2fa_required",
            "temp_token": "..." // Only valid for /verify-2fa endpoint
        })
    }
}
```

---

# Chapter 3: Time Drift & Windowing

Clocks are not perfect. The user's phone might be 5 seconds fast. The server might be 2 seconds slow.
If we only check the exact 30-second window, valid codes might fail at the boundary (e.g., at 12:00:29 vs 12:00:30).

**The Solution: Windowing.**
We verify the Current Window ($T$), the Previous Window ($T-1$), and the Next Window ($T+1$).
This gives a $\pm 30$ second tolerance.

```go
// twofactor library does this automatically
otp.Validate(pin) // Checks T, T-1, T+1
```

---

# Chapter 4: Recovery (The "Bus Factor")

Phones break. Users lose them.
A robust system MUST provide **Recovery Codes**.

1.  **Generation**: When 2FA is activated, we generate 10 random strings: `A1B2-C3D4`.
2.  **Storage**: We Hash them (bcrypt). We treat them like 10 one-time passwords.
3.  **Usage**:
    *   User enters code.
    *   We check hashes.
    *   Match? Log them in AND **Delete** that code.

This ensures that even if someone sees your printed recovery sheet, they can only use each code once (though they shouldn't see it at all!).

---

# Conclusion

Implementing 2FA is a responsibility.
It adds friction to the user experience in exchange for massive security gains.
Our implementation focuses on **Availability**:
*   TTL Cache prevents "Ghost" setups.
*   Windowing prevents "My code was right!" frustration.
*   Recovery codes prevents "I lost my phone" support tickets.

This completes the Auth lifecycle for Golang4U.

