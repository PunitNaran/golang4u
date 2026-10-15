---

title: "The Jailer in My Codebase: In-Memory Jail and Why It Became a Library"
date: 2026-10-15T09:00:00+00:00
author: "Punit Naran"
description: "The Jailer in My Codebase: In-Memory Jail and Why It Became a Library"
tags: ["Go", "Security", "Jail"]
draft: true
---


The *jailer* in a Go service is the part that takes a *user* (or *API
client*, or *K8s pod*) and *imprisons* them: rate limits, IP
blocklists, action budgets, "you have N tries per minute". In my codebase
it started as a `map[string]*User` and a `map[string]int` (count of
failed logins) and *grew* into a small library because the **rules** of
the jail (what counts as a "try", what "exceeding" a budget means, who
gets *jailed* and *when*) kept *changing* every sprint. The *data*
stayed the same; the *rules* were the whole thing.

This post is the **design** of that library: the one `Jailer` interface,
the two *rules* (a *try* and a *budget*), and the *exact* code for the
three things that matter in production: (1) the *atomic* increment,
(2) the *sliding* window, (3) the *exponential* backoff on a *jailed*
principal. All of it is *stdlib + one small in-memory store*; no Redis,
no Kafka, no "jailer service". The *library* pattern is the
`type Jailer interface` + a `type MemoryJailer` impl + the *rules* as
*separate* functions, so a test can swap the *rules* without touching the
*store*.

## The 40-line `Jailer` (the entire library)

```go
// Jailer: the *interface* every caller talks to.
// The *rules* (what counts as a try, when a principal is jailed)
// are *separate* from the *store* (where the counts live), so a
// test can swap either independently.
type Jailer interface {
    // Record a *try* for `principal` on `action`.
    // Returns the *current* count and a *jailed* flag.
    Try(principal, action string) (count int, jailed bool)
    // Clear a principal (e.g. after a successful login).
    Clear(principal string)
    // Is this principal currently jailed?
    IsJailed(principal string) bool
}

// MemoryJailer: the *store*. A plain `map` with a `sync.Mutex`.
// ponytail: in-memory, single-process. Swap for a Redis impl when
// you go multi-replica; the *interface* doesn't change.
type MemoryJailer struct {
    mu     sync.Mutex
    counts map[string]int
    jailed map[string]time.Time
}

func (j *MemoryJailer) Try(p, a string) (int, bool) {
    j.mu.Lock()
    defer j.mu.Unlock()
    j.counts[p]++
    if j.counts[p] > 5 {   // ponytail: hard cap 5, tune per action
        j.jailed[p] = time.Now().Add(5 * time.Minute)
    }
    return j.counts[p], j.isJailedLocked(p)
}

func (j *MemoryJailer) isJailedLocked(p string) bool {
    until, ok := j.jailed[p]
    return ok && time.Now().Before(until)
}
```

That's the *entire* jail. The *rules* (5 tries, 5-minute jail) are *in*
the impl, *not* in the interface. A test that wants to check "what
happens at 6 tries" just calls `Try` 6 times; a test that wants to
check "the jail *expires*" just calls `Try` once, sleeps 6 min (or
*rewinds the clock* via an injected `now func()`), and calls `Try` again.

## The 3 rules that make it *boring*

1. **One *try* = one *atomic* increment.** No `read-modify-write` across
   two calls; the `sync.Mutex` (or a Redis `INCR`) *is* the atomicity.
   If you find yourself doing `if j.counts[p] < 5 { j.counts[p]++ }`,
   you've *lost* the atomicity and the jail is *racy* under concurrency.
2. **The *jailed* flag is a *state*, not a *return value*.** A jailed
   principal *stays* jailed for the duration; the *count* is *not* reset
   by a failed *verify*. This is the difference between a *counter*
   (resets on success) and a *jail* (persists across the *window*).
   The *counter* is the *try* count; the *jail* is the *consequence*.
   Keeping them separate is what makes the *rules* *composable*.
3. **The *exponential* backoff is a *policy*, not a *property*.** The
   *backoff* (5 min, then 30 min, then 6 hours) is a *policy* you apply
   to the *jailed* flag; it's *not* a property of the *principal*. A
   *principal* is *jailed*; a *policy* decides *how long*. This is
   the same *rules-vs-state* split as the *try/budget* above: the
   *policy* is a *function*, the *jail* is a *state*.

## The one-line summary

A *jailer* in a Go service is a *40-line* `interface` + an *in-memory*
`map` + a *policy* function. The *interface* is the *only* thing your
callers see; the *rules* are *in* the *impl* and *swappable* for tests.
That's the *entire* library. Everything else (Redis, Kafka, a *jailer
service*) is *scale*, not *design*.
