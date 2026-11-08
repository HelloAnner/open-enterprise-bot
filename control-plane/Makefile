.PHONY: build test
build:
	go build -trimpath -o dist/control-plane ./src/cmd/control-plane
test:
	go test -race ./...
