---
title: "Docker, K8s, and Terraform: The Go Ops Triad That Actually Ships"
date: 2026-10-15T09:00:00+00:00
author: "Punit Naran"
description: "Docker, K8s, and Terraform: The Go Ops Triad That Actually Ships"
tags: ["Go", "DevOps", "Kubernetes", "Docker", "Terraform"]
draft: true
---


The *Go* *ops* *triad* is *the* *only* *ops* *triad* *that* *ships*:
*Docker* *builds* *the* *image*, *Kubernetes* *runs* *the* *image*,
*Terraform* *provisions* *the* *infra* *the* *image* *runs* *on*.
The *rest* (*Ansible*, *Chef*, *Puppet*, *Salt*) are *config* *push*
*frameworks*; *the* *triad* *is* *a* *`build`* *->* *`run`* *->*
*`provision`* *pipeline*, *and* *each* *step* *is* *a* *`go`* *binary*.
This post is the *30-line* *`Makefile`* that *runs* *the* *whole*
*triad*, *and* *the* *3* *gotchas* *that* *kill* *it*.

## The *30-line* *`Makefile`* (the *whole* *triad*)

```make
.PHONY: build deploy provision
build:
    docker build -t registry.local/golang4u:$(shell git rev-parse --short HEAD) .
    docker push registry.local/golang4u:$(shell git rev-parse --short HEAD)

deploy:
    kubectl set image deployment/golang4u golang4u=registry.local/golang4u:$(shell git rev-parse --short HEAD)
    kubectl rollout status deployment/golang4u --timeout=60s

provision:
    terraform -chdir=infra apply -auto-approve

all: provision build deploy
```

That's *the* *triad*. *Three* *lines* *each*, *one* *`Makefile`*, *no*
*CI* *framework*, *no* *`ops`* *service*. The *`build`* *is* *a*
*`docker`* *call*; the *`deploy`* *is* *a* *`kubectl`* *call*; the
*`provision`* *is* *a* *`terraform`* *call*. *The* *`Makefile`* *is*
the *orchestrator*.

## The *3* *gotchas* *that* *kill* *the* *triad*

1. **The *image* *tag* *is* *a** `*git rev*`, *not** `*latest**.**
   `*latest**` *is* *a** *`*pull**`* *race**:** *two** *`deploy**`*
   *runs** *at* *once** *pull** *two** *different** *`latest**`*
   *images** *and** *the** *`rollout**`* *succeeds** *with** *the*
   *wrong** *one**.** *The** *`git rev**`* *tag** *is** *the** *only*
   *tag** *that** *is** *`*deterministic**`**.**
2. **The *`rollout status**`* *must** *have** *a** *`--timeout**`**.**
   Without it, a *`deploy**`* *that** *hangs** *on** *a** *`readiness
   check**`* *hangs** *forever** *and** *the** *`make**`* *hangs**
   *forever** *and** *the** *`CI**`* *times** *out** *with** *no*
   *signal** *about** *which** *step** *failed**.**
3. **The *`terraform**`* *`apply**`* *must** *run** *before** *the*
   *`deploy**`**,** *not** *after**.** If *the** *`deploy**`* *lands*
   *on** *a** *`node**`* *that** *the** *`terraform**`* *hasn't*
   *provisioned** *yet**, *the** *`pod**`* *`pending**`* *forever**
   *and** *the** *`deploy**`* *`succeeds**`* *anyway** *because** *the*
   *`rollout**`* *only** *checks** *the** *`replicas**`**,** *not**
   *the** *`node**`* *readiness**.** The *`make**`* *`all**`* *target*
   *enforces** *the** *order**.**

## The *30-line* *rule* *for* *the* *triad*

If *your* *`Makefile**`* *is* *more** *than** *30 lines** *of*
*`docker**`* *+** *`kubectl**`* *+** *`terraform**`* *calls,** *you've*
*built** *a** *`CI**`* *framework** *and** *the** *triad** *isn't*
*the** *point** *anymore**.** The *30-line** *`Makefile**`* *is*
*the** *whole** *triad**.**
