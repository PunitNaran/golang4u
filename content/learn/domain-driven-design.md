---

title: "The Golang4U Domain Bible: Structs, Validation & Rich Models"
date: 2026-02-14T13:00:00+08:00
lastmod: 2026-02-14T13:00:00+08:00
author: "Punit Naran"
authorLink: ""
description: "How to organize business logic. We explore the 'Rich Model' pattern in Golang4U, contrasting the `User` domain entity with the `Store` persistence wrapper, and deep dive into the Referral Code generation algorithms."
tags: ["Go", "DDD", "Structs", "DomainDrivenDesign", "Validation", "Mongo"]
categories: ["Architecture", "Engineering Handbook"]
featuredImage: ""
---

# Preface: Where does logic belong?

In architecture, there is a concept called "Anemic Domain Model".
This is when your structs are just data bags:
```go
type User struct { Name string }
```
And all your logic is in `Service`:
```go
func (s *Service) IsAdult(u *User) bool { return u.Age >= 18 }
```

**Golang4U** prefers a **Rich Domain Model**.
We put logic *on the struct itself* when it applies to the entity.
```go
func (u *User) IsAdult() bool { return u.Age >= 18 }
```

This guide explores `libs/user/user.go`.

---

# Chapter 1: The Great Store/User Split

We do not map our Database Document 1:1 to our User representation.
This is a critical separation.

### 1.1 The `User` (The Person)
This struct represents the "Business Entity". It has a Profile, Initials, Bio. It is what we think of when we say "User".

```go
type User struct {
    Profile Profile `json:"profile"`
    Country string  `json:"country"`
    // ...
}
```

### 1.2 The `Store` (The Record)
This struct represents "How we save it". It wraps the User with System Metadata.

```go
type Store struct {
    User         User          `bson:"user"`          // Embedded Domain Entity
    Disable      bool          `bson:"disable"`       // System Flag (Banned?)
    Lifetime     time.Time     `bson:"lifetime"`      // TTL (Delete after 1 hour?)
    ReferalCodes []ReferalCode `bson:"referal_codes"` // Private Data
}
```

**Why?**
The `User` struct is often sent to the Frontend (serialized to JSON).
The `Store` struct is NEVER sent to the Frontend.
This prevents us from accidentally leaking `ReferalCodes` or `Disable` status in an API response. The types themselves enforce security.

---

# Chapter 2: The Referral Algorithm

Golang4U has a Invite-Only system. This is complex domain logic.
It lives in `libs/user/user.go`.

### 2.1 Generating Codes (Collision Avoidance)

```go
func (*Store) CreateReferalCodes(user *User, numOfCodes int) []ReferalCode {
    codes := []ReferalCode{}
    
    for i := 0; i < numOfCodes; i++ {
        // Generating a unique hash based on User + Counter + Random
        temp := randomHasherForCodes(user, i)[0:8]
        
        // Internal Collision Check
        // (Ensure we didn't generate the same code twice in this batch)
        for j := 0; j < len(codes)-1; j++ {
             if collision { regenerate() }
        }
        
        codes = append(codes, ReferalCode{
            Code: user.AvatarName + "-" + temp, 
            Lifetime: time.Now().Unix(),
        })
    }
    return codes
}
```

This logic belongs on the `Store` struct because it manipulates the internal state of the Record. It doesn't need a Database connection or an HTTP request; it is pure logic.

### 2.2 Reclaiming Space
We also have logic to remove codes:
```go
func (*User) RemoveReferal(s []ReferalCode, r string) []ReferalCode {
    // Slice manipulation logic
    // ... return append(s[:i], s[i+1:]...)
}
```

By keeping this slice math in `libs/user`, the `Service` layer remains clean.
`Service`: "User, remove code X."
`User`: "Done."

---

# Chapter 3: Struct Tags (The Rosetta Stone)

Go structs often have to talk to multiple languages (JSON, BSON, YAML, Validation).
We use **Struct Tags** to define these translations.

```go
AvatarName string `yaml:"avatar_name" json:"avatar_name" validate:"required,alphanum" bson:"avatar_name"`
```

1.  **`json`**: For the Frontend API.
2.  **`bson`**: For MongoDB.
3.  **`yaml`**: For Config files (in some cases).
4.  **`validate`**: For the Validator library.

**The Power of Centralization:**
We define validation rules ("Required, Alphanumeric") *right next to the field data*.
We don't write `if len(name) == 0` checks in handlers. The request binds to the struct, the validator reads the tag, and it auto-rejects invalid data.

---

# Conclusion

A codebase is manageable only when logic lives where it belongs.
1.  **Persistence Logic**: In `Store`.
2.  **Entity Logic**: In `User`.
3.  **Orchestration Logic**: In `Service`.

By treating `libs/user` as a "Rich Model", `Golang4U` keeps its Services thin and its Data structures smart.
