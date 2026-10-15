---
title: "Design Patterns in Go: The Once-per-Lifetime Patterns That Actually Pay Off"
date: 2026-10-15T09:00:00+00:00
author: "Punit Naran"
description: "Design Patterns in Go: The Once-per-Lifetime Patterns That Actually Pay Off"
tags: ["Go", "DesignPatterns"]
draft: true
---


Every Go developer has read *Design Patterns* (Gang of Four) and thought
"this is C++-ism". The refactoring.guru catalogue is the friendlier
reference, but most of it is *inheritance-based* and Go has no
inheritance. So what's left? This post walks the catalogue and marks
**which patterns Go handles natively** (and the idiom) and **which are
better left to a library**. The rule I use: if the pattern is about
*object identity / polymorphism*, Go's type system already does it with
`interface{}` + generics; if it's about *state machines / lifecycles*,
the pattern is a struct + a `switch`. That's the whole post, really.

## The 23, ranked by "Go does this natively"

| Pattern (Gang of Four) | Go idiom | Native? |
|------------------------|----------|---------|
| **Singleton** | package-level var + `sync.Once` | yes, trivially |
| **Factory** | constructor function `NewFoo(deps...) *Foo` | yes, idiomatic |
| **Builder** | functional options `func WithX(x T) Opt` | yes, idiomatic |
| **Strategy** | `type Strategy interface { Do(ctx) }` | yes, `func(ctx) T` also |
| **Observer** | `chan Event` + a `Subscribe()` method | yes, goroutine-native |
| **Command** | `type Command struct { fn func(ctx) }` | yes |
| **Adapter** | just write the 10-line wrapper func | yes |
| **Facade** | a package that exposes 1 entry, hides 20 files | yes, idiomatic |
| **Decorator** | wrap a `type Handler func(Req) (Resp, error)` | yes, idiomatic |
| **Chain of Responsibility** | `for _, h := range handlers { ... }` | yes, middleware IS this |
| **Proxy** | wrap the real thing in a `struct { inner T }` | yes |
| **Memento** | `snapshot := copy(orig)` (Go has no reference type) | mostly |
| **State** | `type State struct { cur State; next func() }` | yes |
| **Mediator** | a hub `chan` all parts talk to | yes, idiomatic |
| **Prototype** | `clone := orig` (value copy) — no deep clone built-in | partly |
| **Flyweight** | a `sync.Map` of shared payloads + a key struct | yes |
| **Visitor** | `type Visitor interface { Visit(*T) }` + `type T struct { v Visitor }` | mostly |
| **Composite** | `type Node interface { children() []Node }` | yes |
| **Iterator** | `func(f func(T) bool) (bool, error)` (the `Slice` pattern) | yes, idiomatic |
| **Template Method** | **not native** — no inheritance; use a function that takes a `func` | no |
| **Interpreter** | write a real parser (go/parse) — a pattern, not a type | no |
| **Active Object** | a goroutine + a `chan Request` — *this* is Go's native "active object" | yes, it's the goroutine |
| **Bridge** | a `type Bridge interface { Bridge() *Impl }` + two hierarchies | mostly |

The one pattern that's *always* the right answer in Go: **Active Object =
goroutine + channel**. The Gang of Four wrote it in 1994, before
goroutines existed. Every time you'd write an `ActiveObject` in C++, you
write a `go func() { for req := range c { ... } }` in Go. That's not a
pattern; that's a *feature*.

## The concrete idiom: a Strategy + Decorator in 20 lines

The *real* Go idiom for "strategy" is just a function type:

```go
// Strategy: a pricing function. No interface, no *Strategy struct.
type Price = func(order Order) (float64, error)

// Decorator: a tax on top of any Price.
func WithTax(tax float64, base Price) Price {
    return func(o Order) (float64, error) {
        p, err := base(o)
        if err != nil {
            return 0, err
        }
        return p * (1 + tax), nil
    }
}

// Composition: the "pattern" is just `WithTax(0.2, WithVAT(0.2, Flat(5)))`
```

That's the whole post, *in code*. No `PriceStrategy` interface, no
`*Price` pointer, no `NewPriceStrategy()` factory. A function value **is**
the strategy; a closure **is** the decorator; a package **is** the facade.
If you need more than that, you've built a *framework*, not a pattern.

## The 30-line rule for patterns in Go

If your "pattern" needs more than 30 lines of *type definitions* (not
*logic*), you've built a class hierarchy. The 30-line number is the line
between "idiom" and "framework". Under it, idiom. Over it, you've written
a library, and that's fine — just *call* it a library and stop pretending
it's a "pattern".
