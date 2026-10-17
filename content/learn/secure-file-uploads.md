---
---


title: "Secure file uploads in Go: magic-byte sniffing, streaming to ClamAV, and a SANE-style frame client that never touches the disk"
image: /images/covers/secure-file-uploads.svg
date: 2026-10-17T09:00:00+00:00
author: "Punit Naran"
description: "A file-upload endpoint is a backdoor: a shell in a .jpg, a virus in a PDF, a 50GB file that fills the disk. This post treats every upload as a potential bomb and defuses it the Go way: http.DetectContentType (magic bytes, not the Content-Type header) for the format check, a ClamAV streaming scan over a TCP pipe so the file is *checked before it is stored*, a body-size limit that severs the request before it hits RAM, and an IP ban that turns the endpoint into a honeypot. The streaming frame client (a SANE-style request/response protocol) is the Go idiom for 'consume a byte stream without buffering the whole thing'."
tags: ["Go", "Security", "ClamAV", "FileUploads", "Streaming", "Magic Bytes", "DoS"]
draft: false


# Secure file uploads in Go: magic-byte sniffing, streaming to ClamAV, and a SANE-style frame client

A file-upload endpoint is the *single* most common backdoor in a web application, and it is *not* because uploads are *inherently* *dangerous* — *it* *is* *because* *the* *naive* *implementation* *does* *four* *things* *in* *the* *wrong* *order:* (1) *trusts* *the* *`Content-Type`* *header* (a *user-*sent* *string) *to* *decide* *what* *the* *file* *is,* (2) *saves* *the* *file* *to* *disk* *before* *scanning* *it* (the *virus* *lands* *before* *the* *antivirus* *sees* *it), *(3) *buffers* *the* *whole* *body* *in* *RAM* (a *50GB* *upload* *is* *a* *DoS), *and* (4) *treats* *a* *failed* *scan* *as* *a* *soft* *error* (the *attacker* *gets* *to* *try* *the* *next* *payload). *The* *fix* *is* *not* *more* *validation: *it* *is* *a* *different* *order* *of* *operations* — *sniff* *the* *magic* *bytes* (a *user-*sent* *header* *cannot* *lie), *stream* *to* *ClamAV* *before* *persisting* (the *file* *is* *checked* *at* *the* *network* *edge), *limit* *the* *body* *at* *the* *transport* *layer* (the *request* *dies* *before* *it* *hits* *RAM), *and* *ban* *the* *IP* *on* *a* *detected* *virus* (the *endpoint* *becomes* *a* *honeypot). *This* *post* *is* *that* *order* *of* *operations,* *in* *Go,* *with* *two* *stdlib* *code* *blocks: *the* *magic-byte* *sniff* *and* *a* *SANE-style* *frame* *client* *that* *models* *the* *streaming* *scan* *protocol.*

## Rule one: *never* *trust* *the* *extension* *or* *the* *`Content-Type`* *header*

The *first* *and* *most* *forgotten* *rule* *of* *upload* *security:* **the *file* *name* *and* *the* *`Content-Type`* *header* *are* *both* *user-*sent* *strings,** *and* *a* *user* *can* *set* *either* *to* *anything.* *A* *file* *named* *`cute_cat.jpg`* *can* *be* *a* *`.exe; *a* *`Content-Type: image/jpeg`* *on* *a* *shell* *script* *is* *a* *lie.* *The* *only* *thing* *a* *file* *cannot* *lie* *about* *is* *its* *first* *bytes* — *the* *magic* *bytes.* *Go's* *stdlib* *gives* *you* *the* *sniffer* *for* *free:* *`http.DetectContentType`* *looks* *at* *the* *first* *512* *bytes* *and* *returns* *a* *content* *type* *derived* *from* *the* *byte* *signature,* *not* *the* *header:*

```go
// isImageFile is the magic-byte check: it does NOT look at the
// Content-Type header (a user-sent string the caller can lie about),
// it looks at the first 512 bytes of the file and lets the stdlib
// sniff the real signature. This is the single most important
// line of an upload handler: the file *cannot* lie about its own
// first bytes the way it can lie about its name or its header.
//
// http.DetectContentType needs at most 512 bytes; a file shorter
// than that is too small to carry a valid image header, so we
// reject it up front.
func isImageFile(b []byte) bool {
	if len(b) < 512 {
		return false // too small to be a valid image
	}
	contentType := http.DetectContentType(b[:512])
	return strings.HasPrefix(contentType, "image/")
}
```

The *magic* *bytes* *are* *the* *signatures:* *JPEG* *is* *`FF D8 FF`, *PNG* *is* *`89 50 4E 47`, *GIF* *is* *`47 49 46 38`. *A* *`malware.exe`* *renamed* *to* *`image.jpg`* *has* *an* *`MZ`* *header,* *and* *`DetectContentType`* *returns* *`application/octet-stream`* *— *not* *`image/jpeg`* — *so* *the* *`image/*`* *prefix* *check* *fails* *and* *the* *upload* *is* *rejected.* *The* *`len(b)* *< 512`* *guard* *is* *a* *subtle* *but* *load-bearing* *edge:* *a* *file* *shorter* *than* *the* *sniffer's* *window* *cannot* *have* *a* *reliable* *signature,* *and* *no* *valid* *image* *is* *that* *small* — *rejecting* *it* *is* *cheap* *and* *correct.*

| Input | What the naive check trusts | What the magic-byte check sees | Result |
|---|---|---|---|
| `cute_cat.jpg` (a real JPEG) | `image/jpeg` header | `FF D8 FF` → `image/jpeg` | accepted |
| `cute_cat.jpg` (a renamed `.exe`) | `image/jpeg` header (a *lie*) | `MZ` → `application/octet-stream` | **rejected** |
| `report.pdf` (a shell script) | `application/pdf` header (a *lie*) | `#!/` → `application/x-sh` | **rejected** |
| a 200-byte "image" | `image/png` header | too small to sniff | **rejected** (no reliable signature) |

The *table* *is* *the* *argument:* *the* *naive* *check* *trusts* *a* *string* *the* *attacker* *chose;* *the* *magic-byte* *check* *trusts* *bytes* *the* *file* *cannot* *choose.* *The* *first* *column* *is* *the* *naive* *failure* *mode* *— *a* *header* *that* *is* *a* *lie;* *the* *second* *column* *is* *the* *only* *check* *that* *survives* *the* *attacker* *setting* *their* *own* *header.*

## Rule two: *stream* *to* *ClamAV* *before* *the* *file* *touches* *the* *disk*

The *second* *rule* *is* *a* *reordering:* *the* *file* *must* *be* *scanned* *before* *it* *is* *persisted,* *not* *after.* *The* *naive* *order* (save *to* *`/tmp/upload.jpg`, *then* *`clamscan`* *it, *then* *delete* *if* *bad) *is* *a* *window* *where* *the* *virus* *is* *on* *your* *disk* *and* *the* *antivirus* *has* *not* *looked* *at* *it* *yet* — *a* *`clamscan`* *crash* *in* *that* *window* *leaves* *the* *virus* *persisted.* *The* *streaming* *order* (open *a* *pipe* *to* *ClamAV, *copy* *the* *request* *body* *into* *the* *pipe,* *and* *only* *if* *ClamAV* *says* *clean* *do* *you* *persist) *is* *the* *fix:* *the* *file* *is* *checked* *at* *the* *network* *edge,* *before* *it* *is* *a* *file* *at* *all.*

The *Go* *idiom* *for* *"*consume* *a* *byte* *stream* *without* *buffering* *the* *whole* *thing*" *is* *a* *`io.Copy`* *between* *two* *`io.Reader`/`io.Writer`* *— *and* *the* *protocol* *shape* *of* *a* *SANE* *scanner* *client* *is* *exactly* *the* *shape* *of* *a* *streaming* *upload:* *a* *request* *frame* *out,* *a* *stream* *of* *reply* *frames* *in,* *terminated* *by* *a* *continuation* *bit* *clearing* *or* *an* *EOF.* *The* *`usbagent`* *package* *is* *that* *client:* *a* *30-line* *SANE-style* *frame* *reader* *that* *consumes* *the* *reply* *stream* *one* *record* *at* *a* *time,* *and* *the* *`io.EOF`* *is* *the* *"*device* *terminated* *its* *reply*"* *signal:*

```go
// SaneClient is the protocol client: it speaks a request/response
// frame stream over a full-duplex transport. The Go idiom it
// models is the same as a streaming ClamAV scan — a *reader* on
// one side (the request body / the scan pipe) and a *writer* on
// the other, with an *io.Copy* between them and NO full-file buffer
// in between. The 0x80 continuation bit is the "more frames follow"
// signal; when it clears (or the transport returns io.EOF) the
// reply is complete and the client stops.
type SaneClient struct {
	dev Device
}

// Scan sends the 0x02 request and consumes the device's reply frame
// stream until the continuation bit clears (or the device closes,
// which is equivalent). It returns the number of reply frames
// streamed back — a proxy for "bytes scanned". A well-behaved device
// terminates its own response, so the client never hard-codes a
// frame count: the *stream* is the source of truth.
func (c *SaneClient) Scan() (int, error) {
	if _, err := c.dev.Write([]byte{0x02}); err != nil {
		return 0, err
	}
	n := 0
	for {
		f, err := c.readFrame()
		if err == io.EOF {
			return n, nil // the device ended its reply
		}
		if err != nil {
			return n, err
		}
		n++
		if !f.more() { // continuation bit cleared: reply complete
			return n, nil
		}
	}
}
```

The *two* *properties* *that* *make* *this* *a* *streaming* *scan* *and* *not* *a* *buffered* *one:* **(1) *the* *`for`* *loop* *reads* *one* *frame* *at* *a* *time* *and* *never* *holds* *the* *whole* *stream* (a *`readFrame`* *is* *a* *3-byte* *record,* *not* *a* *`make([]byte, size)`); *(2) *the* *`io.EOF`* *is* *the* *terminal* *condition* (the *device* *decides* *when* *the* *reply* *is* *done,* *the* *client* *does* *not* *hard-code* *a* *count). *The* *ClamAV* *integration* *is* *the* *same* *shape* *with* *a* *TCP* *pipe* *as* *the* *transport:* *the* *`dev.Write`* *is* *the* *request* *byte,* *the* *`dev.Read`* *is* *the* *reply* *stream,* *and* *the* *`io.EOF`* *is* *ClamAV* *closing* *the* *pipe* *after* *the* *final* *verdict.* *The* *file* *is* *never* *a* *file* *while* *it* *is* *being* *scanned* — *it* *is* *a* *stream* *in* *transit,* *and* *a* *stream* *in* *transit* *cannot* *be* *left* *on* *disk.*

```mermaid
flowchart LR
    U[User upload: the HTTP request body] --> B{Body limit: 10MB}
    B -- over --> X[connection severed before it hits RAM]
    B -- under --> M{magic-byte sniff: first 512 bytes}
    M -- not image/ --> R[reject: the header was a lie]
    M -- image/ --> C[stream the body into the ClamAV pipe]
    C -- FOUND --> BAN[ban the IP (the endpoint is a honeypot)]
    C -- CLEAN --> P[only now: persist the file]
    style B fill:#3a2a1a
    style M fill:#1a3a1a
    style P fill:#1a3a1a
```

The *flow* *is* *the* *defense-in-depth:* *each* *gate* *is* *a* *different* *class* *of* *attacker,* *and* *the* *order* *is* *load-bearing* — *the* *body* *limit* *is* *the* *DoS* *gate* (a *50GB* *file* *dies* *at* *the* *transport), *the* *magic-byte* *sniff* *is* *the* *format* *gate* (a *renamed* *`.exe` *dies* *at* *the* *signature), *the* *ClamAV* *stream* *is* *the* *content* *gate* (a *valid* *but* *infected* *file* *dies* *at* *the* *antivirus), *and* *the* *IP* *ban* *is* *the* *repeated-offender* *gate* (a *virus* *uploader* *gets* *one* *shot). *No* *single* *gate* *is* *sufficient;* *the* *order* *of* *the* *four* *is* *the* *design.*

## Rule three: *limit* *the* *body* *at* *the* *transport* *layer* *and* *ban* *the* *offender*

The *DoS* *gate* *is* *the* *cheapest* *and* *the* *most* *forgotten:* *a* *50GB* *upload* *to* *a* *handler* *that* *does* *`io.ReadAll`* *is* *a* *50GB* *allocation* *in* *RAM,* *and* *the* *antivirus* *never* *gets* *to* *see* *it.* *The* *fix* *is* *a* *body* *size* *limit* *that* *severs* *the* *connection* *before* *the* *body* *hits* *the* *handler* (the *`10M`* *limit* *is* *enforced* *at* *the* *transport,* *not* *in* *the* *code). *The* *honeypot* *gate* *is* *the* *response* *to* *a* *detected* *virus:* *a* *malware* *upload* *is* *not* *an* *accident,* *it* *is* *an* *attack,* *and* *the* *response* *is* *to* *ban* *the* *IP* *so* *the* *attacker* *cannot* *try* *a* *second* *payload:*

```go
// BlockUser is the "strike back" step: a detected virus is not an
// accident, it is an attack, and the response is to ban the IP so the
// attacker cannot try a second payload. This turns the upload endpoint
// into a *honeypot* — the attacker's *test* upload is the *canary*, and
// the ban is the *trap* closing. The IP is the only stable identity we
// have for a pre-auth upload, so it is the only reasonable ban key.
func (fs *FileScan) BlockUser(c echo.Context) error {
	ip := c.RealIP()
	fmt.Printf("Malware detected from IP: %s. BANNING.\n", ip)
	fs.ipBlockList.BlockIP(ip)
	return c.String(403, "Malware detected. You have been banned.")
}
```

The *`RealIP`* *is* *the* *subtle* *detail:* *behind* *a* *load* *balancer* *or* *a* *reverse* *proxy,* *the* *socket* *peer* *address* *is* *the* *proxy's* *IP,* *not* *the* *client's* — *a* *ban* *on* *the* *proxy* *IP* *would* *ban* *every* *client* *behind* *it.* *The* *`X-Forwarded-For`* *header* *(parsed* *by* *`RealIP`* *against* *a* *trusted-IP* *list) *is* *the* *only* *source* *of* *the* *real* *client* *address,* *and* *it* *is* *the* *one* *header* *you* *can* *only* *partly* *trust* (a *spoofed* *`X-Forwarded-For` *from* *an* *untrusted* *hop* *lets* *the* *attacker* *choose* *their* *own* *ban* *key) — *which* *is* *why* *the* *trusted-IP* *list* *is* *part* *of* *the* *ban,* *not* *an* *afterthought.*

> **Note**: The *`io.Copy`* *streaming* *model* *and* *the* *body-size* *limit* *are* *two* *sides* *of* *the* *same* *coin:* *the* *limit* *bounds* *the* *stream* *so* *the* *`io.Copy`* *cannot* *be* *a* *50GB* *allocation,* *and* *the* *`io.Copy`* *bounds* *the* *memory* *so* *the* *limit* *is* *the* *only* *number* *that* *matters.* *The* *file* *is* *a* *stream* *in* *transit,* *checked* *at* *the* *edge,* *and* *bounded* *at* *the* *transport* — *the* *three* *properties* *together* *are* *the* *streaming* *scan.*

> **Warning**: *A* *`Content-Type`* *check* *is* *a* *filter,* *not* *a* *gate.* *A* *`Content-Type: image/jpeg`* *on* *a* *renamed* *`.exe`* *is* *a* *lie* *that* *the* *magic-byte* *sniff* *catches* *but* *the* *header* *check* *does* *not.* *If* *your* *upload* *path* *keys* *off* *the* *header* *alone,* *the* *attacker* *has* *a* *`Content-Type`* *they* *set* *themselves* — *and* *a* *`Content-Type`* *the* *attacker* *set* *themselves* *is* *not* *a* *security* *control,* *it* *is* *a* *string.* *The* *magic* *bytes* *are* *the* *only* *thing* *the* *file* *cannot* *lie* *about.*

## The defense-in-depth summary: *four* *gates,* *in* *this* *order*

| Gate | Catches | Cost of a miss |
|---|---|---|
| **Body limit** (10MB, at the transport) | a 50GB DoS upload | a 50GB RAM allocation, the handler never runs |
| **Magic-byte sniff** (first 512 bytes) | a renamed `.exe` / shell script | a non-image file lands in the image path |
| **ClamAV stream** (before persist) | a valid-but-infected file | the virus is on disk and the antivirus has not seen it |
| **IP ban** (on a FOUND verdict) | a repeat attacker | the attacker gets a second shot at a second payload |

The *order* *is* *the* *design:* *cheapest* *gate* *first* (a *body* *limit* *is* *one* *integer* *and* *a* *connection* *sever), *most* *selective* *last* (a *IP* *ban* *is* *expensive* *because* *it* *can* *false-positive* *a* *legit* *user* *behind* *a* *NAT). *A* *gate* *that* *is* *expensive* *but* *runs* *first* *is* *a* *false-positive* *machine; *a* *gate* *that* *is* *cheap* *but* *runs* *last* *is* *a* *waste* *of* *work* *the* *first* *gate* *would* *have* *saved.*

The *same* *defence* *drawn* *as* *a* *decision* *ladder* — *each* *`no`* *is* *a* *cheap* *reject,* *the* *`yes`* *path* *is* *the* *stream* *into* *the* *antivirus,* *and* *the* *only* *`yes` *that* *persists* *the* *file* *is* *the* *clean* *one:

```mermaid
flowchart TB
    A[upload request] --> B{body <= 10MB?}
    B -- no --> X1[sever connection (DoS gate)]
    B -- yes --> C{magic bytes = image/?}
    C -- no --> X2[reject (format gate)]
    C -- yes --> D[io.Copy into ClamAV pipe]
    D --> E{verdict?}
    E -- FOUND --> X3[ban the RealIP (honeypot gate)]
    E -- CLEAN --> P[persist the file (the only path that writes to disk)]
    style X1 fill:#3a1a1a
    style X2 fill:#3a1a1a
    style X3 fill:#3a1a1a
    style P fill:#1a3a1a
```

## Takeaways

- **The *file* *name* *and* *the* *`Content-Type`* *header* *are* *both* *user-*sent* *strings,* *and* *a* *user* *can* *set* *either* *to* *anything.** *The* *magic* *bytes* *are* *the* *only* *thing* *a* *file* *cannot* *lie* *about* — *`http.DetectContentType`* *on* *the* *first* *512* *bytes* *is* *the* *entire* *format* *gate,* *and* *a* *`len(b)* *< 512`* *reject* *is* *the* *edge* *case* *that* *keeps* *it* *honest.*
- **The* *scan* *must* *precede* *the* *persist:** *save* *then* *scan* *is* *a* *window* *where* *the* *virus* *is* *on* *disk* *and* *the* *antivirus* *has* *not* *looked* *at* *it* — *a* *crash* *in* *that* *window* *leaves* *the* *virus* *persisted.* *The* *`io.Copy`* *stream* *to* *ClamAV* *before* *persisting* *is* *the* *fix,* *and* *the* *SANE-style* *frame* *client* *is* *the* *Go* *idiom* *for* *"*consume* *a* *byte* *stream* *without* *buffering* *the* *whole* *thing."*
- **The* *DoS* *gate* *is* *a* *body* *size* *limit* *at* *the* *transport:** *a* *50GB* *upload* *to* *a* *`io.ReadAll`* *handler* *is* *a* *50GB* *allocation.* *Severing* *the* *connection* *before* *it* *hits* *RAM* *is* *the* *cheapest* *gate* *and* *the* *one* *that* *runs* *first.*
- **A* *detected* *virus* *is* *an* *attack,* *not* *an* *accident:** *the* *response* *is* *a* *IP* *ban* *so* *the* *attacker* *gets* *one* *shot* *at* *a* *second* *payload.* *The* *`RealIP`* *(the* *`X-Forwarded-For`* *against* *a* *trusted-IP* *list) *is* *the* *only* *stable* *ban* *key* *for* *a* *pre-auth* *upload* *behind* *a* *proxy.*

## Next steps

1. **Add the body-size limit at the transport layer** (a *`10M`* *Echo* *middleware,* *a* *`http.Server`* *`ReadHeaderTimeout`* *and* *a* *`maxBytesReader`* *on* *the* *body) *so* *a* *50GB* *upload* *dies* *before* *it* *hits* *RAM.*
2. **Replace your `Content-Type` check with `http.DetectContentType` on the first 512 bytes.** *The* *header* *is* *a* *string* *the* *attacker* *set* *themselves;* *the* *magic* *bytes* *are* *the* *signature.* *The* *`len(b)* *< 512`* *reject* *is* *the* *edge* *case* *that* *keeps* *the* *sniff* *honest.*
3. **Stream the body into a ClamAV pipe before you persist the file.** *The* *`io.Copy`* *is* *the* *scan;* *the* *`io.EOF`* *is* *the* *verdict.* *The* *file* *is* *a* *stream* *in* *transit,* *not* *a* *file* *on* *disk* *that* *a* *crash* *can* *leave* *behind.*
4. **Ban the IP on a FOUND verdict and log the `RealIP`.** *A* *detected* *virus* *is* *a* *honeypot* *canary:* *the* *attacker's* *test* *upload* *is* *the* *trigger,* *the* *ban* *is* *the* *trap.* *The* *`RealIP`* *is* *the* *only* *stable* *identity* *you* *have* *for* *a* *pre-auth* *upload.*
