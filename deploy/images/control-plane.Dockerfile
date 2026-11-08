# Build context is control-plane/ only.
FROM golang:1.25.4-alpine AS build
ARG GOPROXY=https://proxy.golang.org,direct
ENV GOPROXY=$GOPROXY GOMAXPROCS=2
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY src ./src
RUN CGO_ENABLED=0 go test ./... && CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /control-plane ./src/cmd/control-plane
FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
USER 65532:65532
COPY --from=build /control-plane /control-plane
EXPOSE 8080
ENTRYPOINT ["/control-plane"]
