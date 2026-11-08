.PHONY: build test
build:
	go build -trimpath -o dist/desktop-gateway ./src/cmd/desktop-gateway
	go build -trimpath -o dist/compute-agent ./src/cmd/compute-agent
	go build -trimpath -o dist/node-runtime ./src/cmd/node-runtime
test:
	go test -race ./...
