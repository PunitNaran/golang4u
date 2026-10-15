---

title: "Kafka in Go: The Consumer Group That Actually Works"
date: 2026-10-15T09:00:00+00:00
author: "Punit Naran"
description: "Kafka in Go: The Consumer Group That Actually Works"
tags: ["Go", "Kafka", "Messaging"]
draft: true
---


Every Go service that "integrates with Kafka" starts the same way:
`go-kafka` (or `segmentio/kafka-go`), a `NewConsumerGroup`, a `for
msg := range consumer.Events()` loop, and a *3am page* because the
consumer *died* and the *group* *rebalanced* and the *offset* *committed
was* for the *previous* *batch* and the *next* *batch* *got* *dup
delivered*. This post is the *design* that *stops* that, in *Go*, in
*30 lines*. The three rules:

1. **One *consumer* per *topic*, one *consumer group* per *process*.**
   A *consumer group* is a *Kafka* *concept*; a *Go* *process* is *not
   one*. If you run 4 *replicas* of your *Go* *service* and each *opens
   its own* `NewConsumerGroup`, you have *4* *groups* and *4×* the
   *work* and *0* *load balancing*. The *consumer group* is *one*
   *group*; the *4 replicas* are *4 members* of *that one group*.
   Kafka *assigns* *partitions* to *members* *automatically*; your job
   is *just* to *make* the *members* *behave*.
2. **The *offset* *commit* is *at the end* of the *batch*, *not* at the
   *end* of the *message*.** A *commit* *per message* is *O(n)*
   *round-trips*; a *commit* *per batch* (say, every 100 messages or
   500 ms, whichever first) is *O(1)* *per batch*. The *trade-off*
   is *at-least-once* *delivery* (a *crash* *between* *batch* *N and
   batch* *N+1* *redelivers* *batch* *N*); you *dedupe* *with* a *key*
   *(idempotency key = the message's unique ID)* and a *dedup table*.
3. **The *rebalance* *callback* is *where* you *clean up*, *not*
   *where* you *panic*.** A *rebalance* is *normal* (a *member*
   *joined* or *left*); it *is* the *group* *deciding* *who* *owns*
   *which* *partition*. If your *callback* *panics*, the *group*
   *loses* the *member* and *re-rebalances* (a *rebalance* *of* a
   *rebalance*); if your *callback* *just* *logs* and *closes* the
   *in-flight* *batches*, the *group* *re-recovers* on the *next*
   *rebalance*.

## The 30-line *consumer* (the *whole* *thing*)

```go
func consume(ctx context.Context, topics []string, group string, h Handle) {
    c, err := kafkago.NewConsumer(kafkago.Config{
        Broker:   []string{"kafka:9092"},
        GroupID:  group,
        Topics:   topics,
        Version:  kafkago.Version2_10_0,
    })
    if err != nil {
        log.Fatal(err)
    }
    // *rebalance* *callback*: *just* *log*; *don't* *panic*
    c.SetRebalanceHandler(func(_ *kafka.Consumer, _ *kafka.ConsumerGroup) {
        log.Println("rebalanced; in-flight batches will be redelivered")
    })
    batch := make([]kafka.Message, 0, 100)
    flush := time.NewTicker(500 * time.Millisecond)
    defer flush.Stop()
    for {
        select {
        case msg, ok := <-c.Events():
            if !ok {
                return
            }
            batch = append(batch, *msg)
            if len(batch) >= 100 {
                if err := c.CommitOffsets(); err != nil {
                    log.Println("commit:", err)
                }
                batch = batch[:0]
                h(batch) // *your* *handler*; *at-least-once* *via* *dedupe*
            }
        case <-flush.C:
            if len(batch) > 0 {
                if err := c.CommitOffsets(); err != nil {
                    log.Println("commit:", err)
                }
                h(batch)
                batch = batch[:0]
            }
        case <-ctx.Done():
            return
        }
    }
}
```

The *entire* *consumer* is *30 lines*. The *dedupe* *is* the *one*
*real* *piece* of *logic*: a *`map[uint64]time.Time`* of *(message
hash -> last-seen time)* with a *5-min TTL*, checked *before* *handling*.
If the *hash* is *recent*, *skip*; otherwise *record* and *handle*.
That's *the* *idempotency* *key*. Everything else is *Kafka* *doing*
*its* *job*.
