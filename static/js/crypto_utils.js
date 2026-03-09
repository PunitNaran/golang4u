// ECIES Encryption for GoLang4u (P-256 + AES-GCM-256)
// Corresponds to backend implementation in internal/security/ecies.go

var CryptoUtils = (function () {
    // Import PEM Public Key
    // Backend returns standard PEM. We need to strip headers and decode base64 to get SPKI DER.
    function pemToArrayBuffer(pem) {
        const b64 = pem.replace(/-----BEGIN PUBLIC KEY-----/g, "")
            .replace(/-----END PUBLIC KEY-----/g, "")
            .replace(/\n/g, "");
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    // Convert ArrayBuffer to Base64
    function arrayBufferToBase64(buffer) {
        var binary = '';
        var bytes = new Uint8Array(buffer);
        var len = bytes.byteLength;
        for (var i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    async function encryptData(plaintext) {
        try {
            // 1. Fetch Backend Public Key
            const API_URL = window.GO4U_API_URL;
            // Add cache busting to ensure we always get the current server key
            const response = await fetch(`${API_URL}/public-key?t=${new Date().getTime()}`, {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });
            if (!response.ok) throw new Error("Failed to fetch public key");
            const json = await response.json();
            const pem = json.public_key;

            // 2. Import Backend Public Key
            const spki = pemToArrayBuffer(pem);
            const backendKey = await window.crypto.subtle.importKey(
                "spki",
                spki,
                { name: "ECDH", namedCurve: "P-256" },
                false,
                []
            );

            // 3. Generate Ephemeral Key Pair
            const ephemeralKeyPair = await window.crypto.subtle.generateKey(
                { name: "ECDH", namedCurve: "P-256" },
                true,
                ["deriveBits"]
            );

            // 4. Derive Shared Secret (Bits)
            const sharedBits = await window.crypto.subtle.deriveBits(
                { name: "ECDH", public: backendKey },
                ephemeralKeyPair.privateKey,
                256 // AES-256
            );

            // 5. Import Shared Secret as AES-GCM Key
            const aesKey = await window.crypto.subtle.importKey(
                "raw",
                sharedBits,
                { name: "AES-GCM" },
                false,
                ["encrypt"]
            );

            // 6. Encrypt Data
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encodedText = new TextEncoder().encode(plaintext);
            const ciphertext = await window.crypto.subtle.encrypt(
                { name: "AES-GCM", iv: iv },
                aesKey,
                encodedText
            );

            // 7. Pack Payload: [EphemeralPubKey (65 bytes)] + [IV (12 bytes)] + [Ciphertext]
            const ephemeralPubRaw = await window.crypto.subtle.exportKey("raw", ephemeralKeyPair.publicKey);
            // Backend expects: Base64(PubKey + IV + Ciphertext)
            const payloadLength = ephemeralPubRaw.byteLength + iv.byteLength + ciphertext.byteLength;
            const payload = new Uint8Array(payloadLength);

            payload.set(new Uint8Array(ephemeralPubRaw), 0);
            payload.set(iv, ephemeralPubRaw.byteLength);
            payload.set(new Uint8Array(ciphertext), ephemeralPubRaw.byteLength + iv.byteLength);

            const b64 = arrayBufferToBase64(payload.buffer);
            return b64;
        } catch (e) {
            console.error("Encryption Failed:", e);
            throw e;
        }
    }

    return {
        encrypt: encryptData
    };
})();

window.CryptoUtils = CryptoUtils;
