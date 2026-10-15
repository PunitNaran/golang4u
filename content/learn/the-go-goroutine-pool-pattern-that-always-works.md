---

title: "The Go Goroutine Pool Pattern That Always Works"
date: 2026-10-15T09:00:00+00:00
author: "Punit Naran"
description: "The Go Goroutine Pool Pattern That Always Works"
tags: ["Go"]
draft: true
---


The goroutine pool is the *most over-engineered* pattern in the Go
standard library, and the *most under-engineered* one in production. The
standard library gives you `sync.WaitGroup` (a *barrier*, not a pool) and
`sync.Once` (a *one-shot*, not a pool). Everything else —
`errgroup`, `golang.org/x/sync/errgroup`, the 40-line `WorkerPool` on
StackOverflow — is a *re-implementation* of the same 50-line pattern,
each with a slightly different *name* for the "slot" and a slightly
different *condition* for "slot free". This post is the *one* pattern
that *always* works, and the *one* condition that *always* breaks it.

## The 50-line pattern (the only one you need)

```go
type Pool struct {
    jobs    chan func()
    wg      sync.WaitGroup
    size    int
}

func NewPool(size int) *Pool {
    p := &Pool{jobs: make(chan func(), size), size: size}
    for i := 0; i < size; i++ {
        p.wg.Add(1)
        go p.worker()
    }
    return p
}

func (p *Pool) worker() {
    defer p.wg.Done()
    for fn := range p.jobs {
        fn()
    }
}

func (p *Pool) Submit(fn func()) {
    p.jobs <- fn
}

func (p *Pool) Wait() {
    close(p.jobs)
    p.wg.Wait()
}
```

That's the whole thing. A `chan func()` is the pool. A `sync.WaitGroup`
is the *barrier* that tells you when the pool is *drained*. The `Submit`
method is the *only* way to add work. The `Wait` method is the *only*
way to drain. There is no `acquire`, no `release`, no `Lock`, no
`Unlock`. The *chan* *is* the mutex. The *range* *is* the lock.

## The one condition that *always* breaks it

The pattern above is *correct* **as long as the workers never block on
the caller**. The *one* thing that breaks it is a worker that *calls
back* into the pool (e.g. a worker that `Submit`s a new job). That
creates a *cycle* in the work graph, and the `chan` (which is a *FIFO*
with *no* priority) will *deadlock* the moment the *last* slot in the
channel is *occupied* by a job that's *waiting* on a slot that's *waiting
on it*. The *symptom* is "the pool stops making progress and the CPU is
at 0%". The *fix* is *never* to `Submit` from inside a worker *that*
*blocks on* the pool. If you need to, *spawn a new goroutine* inside the
worker and `Submit` from *that* (the new goroutine is *not* a *worker*,
so it doesn't hold a slot, so the cycle is *broken*).

```go
// The broken version (deadlock):
func (p *Pool) worker() {
    defer p.wg.Done()
    for fn := range p.jobs {
        fn()
        p.Submit(fn) // <-- if fn blocks on the pool, deadlock
    }
}

// The fixed version (spawn a new goroutine):
func (p *Pool) worker() {
    defer p.wg.Done()
    for fn := range p.jobs {
        go func(f func()) {
            f()
            p.Submit(f) // safe: this goroutine is not a worker
        }(fn)
    }
}
```

## The 3 rules that keep the pool *boring*

1. **The pool is a *chan*.** No `mutex`, no `cond`, no `atomic`. The
   `chan` *is* the synchronization primitive. If you find yourself adding
   a `sync.Mutex` *around* the `chan`, you've *re-implemented* the
   `chan`.
2. **The worker is a *goroutine*.** Not a `thread`, not a `task`, not a
   `coroutine`. A *goroutine* is the *only* thing the `chan` *blocks*
   on. If you try to make the "worker" a *thread* (e.g. a `C` thread via
   cgo), the `chan` *blocks* on the *goroutine* that *wraps* the *thread*,
   and you've *re-implemented* the *scheduler*.
3. **The `Wait` is a *barrier*.** The *only* thing `Wait` does is *close*
   the `jobs` channel and *wait* for the *wg* to *drain*. It *does not*
   *cancel* anything, *does not* *interrupt* anything, *does not* *time
   out*. If you need *any* of those, you've *left* the *pool* and
   *entered* the *scheduler*.

## The 50-line rule

If your pool is more than 50 lines, you've *added* a *scheduler*. The
*50-line pool* is the *only* pool that *always* works. Everything else is
a *scheduler* in a *trench coat*.
