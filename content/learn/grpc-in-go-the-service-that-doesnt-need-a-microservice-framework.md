---
title: "gRPC in Go: The Service That Doesn't Need a Microservice Framework"
date: 2026-10-15T09:00:00+00:00
author: "Punit Naran"
description: "gRPC in Go: The Service That Doesn't Need a Microservice Framework"
tags: ["Go", "gRPC", "Networking"]
draft: true
---


The *Golang* *gRPC* *ecosystem* is *the* *opposite* of the *Java*
*ecosystem*: in *Java*, *gRPC* *is* a *framework* (a *`@Grpc`*
*annotation*, a *`Service`* *base class*, a *`Client`* *interface*);
in *Go*, *gRPC* *is* a *`conn`* + a *`client`* + a *`stub`*. There's
*no* *`GrpcClient`* *base class*; the *client* is a *struct* with *one
method* and *one* *`conn`* field. This post is the *30-line* *gRPC
service* in *Go*, the *30-line* *client*, and the *one* *thing* you
*have to get right*: the *`streaming`* *call* *must* *`Send`* *before*
*`Recv`* *in the same goroutine* (or you *deadlock* on the *`stream`*
*buffer*).

## The *30-line* *service*

```go
type Svc struct {
    proto.UnimplementedEchoServer
    store map[string]string
}

func (s *Svc) Echo(ctx context.Context, req *proto.EchoRequest) (*proto.EchoResponse, error) {
    s.store[req.GetMsg()] = req.GetMsg()
    return &proto.EchoResponse{Msg: req.GetMsg()}, nil
}

func (s *Svc) Stream(req *proto.EchoRequest, stream proto.Echo_StreamServer) error {
    for {
        if req.GetMsg() == "END" {
            return nil
        }
        if err := stream.Send(&proto.EchoResponse{Msg: req.GetMsg()}); err != nil {
            return err
        }
        if _, err := stream.Recv(); err == io.EOF {
            return nil
        }
    }
}

func serve() {
    lis, _ := net.Listen("tcp", ":50051")
    s := grpc.NewServer()
    proto.RegisterEchoServer(s, &Svc{store: map[string]string{}})
    log.Fatal(s.Serve(lis))
}
```

The *client* is *10 lines*: *`grpc.Dial`* + *`NewEchoClient`* + *`client.Echo`*.
There's *no* *framework*; *there's* *no* *`GrpcClient`* *class*; *the*
*`client`* *is* *the* *client*.

## The *one* *thing* *you* *have* *to* *get* *right*

The *`streaming`* *call*. In *Java*, *the* *`@Streaming`* *annotation*
*handles* the *`Send`/`Recv`* *pairing* *for* *you*. In *Go*, *you*
*pair* *them*. The *rule*: *a* *`Send`* *must* *be* *followed* *by* *a*
*`Recv`* *in* *the* *same* *goroutine*, *or* *the* *`stream`* *buffer*
*fills* *and* *the* *`Send`* *blocks*. The *`Recv`* *that* *matches* *a*
*`Send`* *is* *the* *`Recv`* *at* *the* *top* *of* *the* *`for`*
*loop*, *not* *a* *separate* *`Recv`* *call* *outside* *the* *loop*.
This *is* *the* *only* *gRPC* *gotcha* *in* *Go*; *everything* *else*
is *the* *`proto`* *buffer* *and* *the* *`conn`* *lifecycle*, *and*
*those* *are* *stdlib* *idioms*.

## The *30-line* *rule* *for* *gRPC* *in* *Go*

If *your* *gRPC* *service* *is* *more* *than* *30 lines* *of*
*`Send`/`Recv`* *pairing*, *you've* *built* *a* *framework*. *The*
*30-line* *service* *is* *the* *whole* *gRPC* *story* *in* *Go*.
