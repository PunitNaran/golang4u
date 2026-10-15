---

title: "The Golang4U Hardening Bible: DDoS-Proofing & OOM Prevention"
date: 2026-02-14T15:00:00+08:00
lastmod: 2026-02-14T15:00:00+08:00
author: "Punit Naran"
authorLink: ""
description: "Your code is correct, but your server is vulnerable. We explore the critical runtime tunings: GOMEMLIMIT, Slowloris Timeouts, and Database Connection Pooling to prevent OOM kills and DDoS attacks."
tags: ["Go", "DevOps", "DDoS", "OOM", "GOMEMLIMIT", "Production", "Docker", "Kubernetes"]
categories: ["DevOps", "Engineering Handbook"]
featuredImage: ""
---

# Preface: The "Correct" Code that Crashes

You can write perfect algorithms, but if you deploy them with default settings, you will crash.
*   **Default HTTP Server**: Vulnerable to Slowloris.
*   **Default GC**: Vulnerable to OOM Killers.
*   **Default DB Driver**: Vulnerable to Connection Storms.

This guide is about **Runtime Hardening**.

---

# Chapter 1: The Slowloris Attack (Timeouts)

**The Attack**:
A hacker opens 1,000 connections to your server.
They send: `G`... wait 10s ... `E` ... wait 10s ... `T` ...
The default Go `http.Server` has **NO Timeout**. It will wait forever.
Your RAM fills up with open connections. The server hangs.

**The Fix**: Explicit Timeouts in `internal/server/server.go`.

```go
func (s *Server) BeginServer() {
    srv := &http.Server{
        Addr:         ":8080",
        Handler:      s.e, // Echo instance
        // 1. ReadTimeout: How long to wait for the Request Body
        ReadTimeout:  5 * time.Second,
        // 2. WriteTimeout: How long to write the Response
        WriteTimeout: 10 * time.Second,
        // 3. IdleTimeout: How long to keep Keep-Alive connections open
        IdleTimeout:  120 * time.Second,
    }
    
    // 4. HeaderTimeout (Go 1.18+): Prevent Slowloris on Headers
    srv.ReadHeaderTimeout = 2 * time.Second

    srv.ListenAndServe()
}
```

Now, if a hacker pauses for more than 2 seconds while typing `GET /`, we cut the connection.
**Golang4U is now Slowloris-proof.**

---

# Chapter 2: The memory Killer (OOM)

Go is a Garbage Collected language.
By default, the GC triggers when the heap doubles in size (`GOGC=100`).

**The Scenario**:
1.  Your container has **1GB RAM**.
2.  Your app uses **600MB**.
3.  A request comes in.
4.  Heap grows to **700MB**.
5.  GC Target is $600MB \times 2 = 1.2GB$.
6.  The App tries to allocate up to 1.2GB.
7.  **Linux OOM Killer** sees usage > 1GB.
8.  `KILL -9`. App crashes.

**The Fix**: `GOMEMLIMIT` (Go 1.19+).
We tell the Go runtime exactly how much RAM it has.

In `cmd/server/main.go` (or Docker env):
```sh
export GOMEMLIMIT=450MiB
```

Now, if usage hits 450MB, the GC becomes **aggressive**. It runs continuously to stay under 450MB. It sacrifices CPU to save RAM.
**The App slows down, but it does NOT crash.**

---

# Chapter 3: The Connection Storm (DB Pooling)

By default, the Mongo driver might open 100+ connections if load spikes.
If you have 10 instances of your app, that's 1,000 connections to Mongo.
Mongo crashes.

**The Fix**: Explicit Pooling in `internal/database/mongo_database.go` (Configurable).

```go
func NewMongoDatabase(..., maxPoolSize uint64, maxConnIdleTime string) {
    opts := options.Client().ApplyURI(uri)
    
    // 1. MaxPoolSize: Hard limit on active connections
    opts.SetMaxPoolSize(maxPoolSize)
    
    // 2. MaxConnIdleTime: Close unused connections
    dur, _ := time.ParseDuration(maxConnIdleTime)
    opts.SetMaxConnIdleTime(dur)
    
    client, _ := mongo.Connect(opts)
}
```

**Configuration (`config.yaml` or ENV):**
```yaml
db_max_pool_size: 50
db_max_conn_idle_time: "5m"
```

This acts as a "Circuit Breaker". It adapts to your infrastructure size.

---

# Chapter 4: Docker Resource Limits

Finally, we enforce these limits at the Kernel level.

`docker-compose.yml`:
```yaml
services:
  app:
    # 1. CPU Quota: Prevents one container from eating the whole server
    cpus: "1.0"
    
    # 2. Hard Memory Limit: The wall (OOM Killer triggers here)
    mem_limit: 1024m
    
    # 3. Soft Memory Limit: Warns the OS
    mem_reservation: 512m
    
    environment:
      - GOMEMLIMIT=900MiB # 90% of Hard Limit
```

**Why 90%?**
Go runtime needs RAM. But the OS also needs RAM (stacks, pointers, file descriptors).
Allow 10-15% headroom for "Non-Heap" memory.

---

# Conclusion

A Production-Ready service is:
1.  **Impatient**: It drops slow connections (`ReadTimeout`).
2.  **Self-Aware**: It knows its memory limits (`GOMEMLIMIT`).
3.  **Polite**: It doesn't overwhelm the DB (`MaxPoolSize`).

These "Expert Control Measures" are the difference between a 3AM page and a good night's sleep.
