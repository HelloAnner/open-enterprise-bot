.PHONY: build test
build:
	go build -trimpath -o dist/api-gateway ./src/cmd/api-gateway
test:
	go test -race ./...
