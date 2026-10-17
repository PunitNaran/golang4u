---
title: "[$] Safe self-referential data structures in kernel Rust"
date: 2026-10-17T09:00:00+00:00
author: "Punit Naran"
description: "Self-referential structures that can be used without unsafe code have posed a problem for Rust for years. There are many cases where a self-referential data structure is the elegan"
tags: ["Go", "Community"]
draft: true
---

Self-referential structures that can be used without unsafe code have posed a problem for Rust for years. There are many cases where a self-referential data structure is the elegant algorithmic choice, but implementing it in accordance with Rust's lifetime rules is all but impossible. At Kangrejos 2026, Gary Guo presented a clever solution to the problem in the context of the kernel's pin_init crate , which helps with the creation of immovable data structures, typically for interoperability with

[Read on the source site](https://lwn.net/Articles/1099224/)
