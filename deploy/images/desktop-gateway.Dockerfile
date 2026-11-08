# Build context is desktop-gateway/ only. Host/Guest binaries are exports, not extra business Pods.
FROM golang:1.25.4-alpine AS build
ARG GOPROXY=https://proxy.golang.org,direct
ENV GOPROXY=$GOPROXY GOMAXPROCS=2
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY src ./src
RUN CGO_ENABLED=0 go test ./... && mkdir /out && CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/desktop-gateway ./src/cmd/desktop-gateway && \
    CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/node-runtime ./src/cmd/node-runtime && \
    CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /out/compute-agent ./src/cmd/compute-agent
FROM scratch AS binaries
COPY --from=build /out/ /
FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
USER 65532:65532
COPY --from=build /out/desktop-gateway /desktop-gateway
EXPOSE 8080
ENTRYPOINT ["/desktop-gateway"]
