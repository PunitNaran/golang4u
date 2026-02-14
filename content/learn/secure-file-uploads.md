---
title: "The Golang4U File Upload Bible: Streaming to ClamAV"
date: 2026-02-14T09:00:00+08:00
lastmod: 2026-02-14T09:00:00+08:00
author: "Punit Naran"
authorLink: ""
description: "How to handle file uploads without getting hacked. We explore Magic Byte detection, Streaming Virus Scanning (ClamAV), and how to block malware at the network edge before it hits your disk."
tags: ["Go", "Security", "ClamAV", "FileUploads", "Streaming", "Malware"]
categories: ["Security", "Engineering Handbook"]
featuredImage: ""
---

# Preface: The Upload Vulnerability

Accepting user content is necessary but dangerous.
A "Profile Picture" upload form is often a backdoor for:
1.  **Shell Uploads**: Uploading `shell.php` to execute code.
2.  **Malware Distribution**: Hosting a standard Windows virus on your domain.
3.  **DoS Attacks**: Uploading a 50GB file to fill your disk.

In **Golang4U**, we treat every file as a potential bomb.
This guide explains how we defuse them using **Streaming** and **ClamAV**.

---

# Chapter 1: The Magic Bytes (Trust Nothing)

First rule: **Never trust the file extension.**
A file named `cute_cat.jpg` might actually be a `.exe`.
A file named `report.pdf` might be a shell script.

### 1.1 Content-Type Sniffing
Browser headers (`Content-Type: image/jpeg`) are sent by the user. They are easily faked.
We must look at the **first 512 bytes** of the file (The Header).

In `internal/handler/handler.go`:

```go
func isImageFile(b []byte) bool {
    // 1. Read the first 512 bytes
    // (http.DetectContentType needs at most 512)
    if len(b) < 512 {
        return false // Too small to be a valid image
    }
    
    // 2. Sniff
    contentType := http.DetectContentType(b[:512])
    
    // 3. Validation
    return strings.HasPrefix(contentType, "image/")
}
```

This function looks for "Magic Bytes" (Signatures).
*   **JPEG**: `FF D8 FF`
*   **PNG**: `89 50 4E 47`
*   **GIF**: `47 49 46 38`

If a user uploads `malware.exe` renamed to `image.png`, `DetectContentType` will see the `MZ` header of the executable and return `application/octet-stream`. We reject it.

---

# Chapter 2: The ClamAV Integration

Checking extensions is not enough. A valid PDF can contain a malicious script. A valid JPEG can contain an exploit.
We need an Antivirus. We use **ClamAV**, the open-source industry standard.

### 2.1 The Architecture
We do not run ClamAV inside our Go binary. That would be slow.
We run `clamd` as a separate microservice (Docker container).
Our Go app talks to it over **TCP**.

### 2.2 Streaming vs Buffering
**The naive way:**
1.  User uploads 10MB file.
2.  Server saves to `/tmp/upload.jpg`.
3.  Server calls `clamscan /tmp/upload.jpg`.
4.  Server deletes if bad.

**Problem**: You just saved malware to your disk. What if the clamscan process crashes? The malware sits there.

**The Golang4U Streaming Way:**
1.  User starts upload.
2.  Server opens a **Pipe** to ClamAV.
3.  As bytes arrive from User, we copy them directly to ClamAV.
4.  We never save the full file until ClamAV says "OK".

### 2.3 The Code (`internal/fileScan/filescan.go`)

```go
func (fs *FileScan) ScanData(c echo.Context, b []byte) error {
    // 1. Connect to ClamAV
    cld := clamd.NewClamd(fs.clamdUrl)
    if err := cld.Ping(); err != nil {
         // Fail Secure: If AV is down, no uploads allowed.
         return Error("AV Service Unavailable")
    }

    // 2. The Multi-Reader Trick
    // We need to read the body TWICE. 
    // Once for ClamAV, and (if clean) once for the actual Application.
    // So we read it into a buffer.
    bodyBytes, _ := io.ReadAll(c.Request().Body)
    
    // Restore the body for the next handler
    c.Request().Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

    // 3. Stream to ClamAV
    // We create a Reader from our bytes and pipe it to ClamAV
    response, err := cld.ScanStream(bytes.NewReader(bodyBytes), make(chan bool))
    
    // 4. Process Result
    for res := range response {
        if res.Status == "FOUND" {
             // MALWARE DETECTED!
             return fs.BlockUser(c)
        }
    }
    
    return nil // Clean
}
```

---

# Chapter 3: Automated Response (The IP Ban)

If someone uploads a virus, it wasn't an accident. It was an attack.
We don't just say "Upload Failed." We strike back.

```go
func (fs *FileScan) BlockUser(c echo.Context) error {
    ip := c.RealIP()
    
    fmt.Printf("Malware detected from IP: %s. BANNING.\n", ip)
    
    // Call our Locking IPFilter
    fs.ipBlockList.BlockIP(ip)
    
    return c.String(403, "Malware Detected. You have been banned.")
}
```

This effectively turns our File Upload endpoint into a **Honeypot**.
1.  Attacker tries a test upload.
2.  We detect it.
3.  We ban their IP instantly.
4.  They cannot try a second payload.

---

# Chapter 4: Defense in Depth (Docker Limit)

What if they try to upload a 50GB file to exhaust our RAM?
ClamAV streaming handles memory well, but `io.ReadAll` puts it in RAM.

We configure **Echo** to limit body size.

```go
// internal/server/server.go
e.Use(middleware.BodyLimit("10M"))
```

And in **Docker-Compose**:
```yaml
services:
  app:
    mem_limit: 512m
```

If a request exceeds 10MB, the connection is severed before it hits our handler.

---

# Conclusion

Secure file handling is about **Distrust**.
1.  **Distrust Headers**: We check Magic Bytes.
2.  **Distrust Content**: We stream to ClamAV.
3.  **Distrust Intent**: We auto-ban users who fail the scan.

This "Paranoid Architecture" keeps the server clean.
