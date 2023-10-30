# Stage 1: Build the Go application
FROM golang:1.19 AS builder

# Set the working directory inside the container
WORKDIR /go/src/app

# Copy the Go source code into the container
COPY . .

# Build the Go application
RUN go get -d -v ./...
RUN GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -v -o /go/bin/app

# Stage 2: Use an official Alpine Linux-based image
FROM alpine:latest

# Install ClamAV and necessary utilities
RUN apk --no-cache add clamav

# Copy ClamAV configuration (if needed) and update virus definitions
RUN freshclam

# Create a directory for your Go application
RUN mkdir /app

# Copy the Go application binary from the "builder" stage to the current stage
COPY --from=builder /go/bin/app /app/

# Set the working directory to your Go application directory
WORKDIR /app

# Expose the port your Go application will run on
EXPOSE 8080

# Define the command to start both ClamAV and your Go server
CMD ./app