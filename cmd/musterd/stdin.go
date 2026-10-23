package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"strings"
	"sync"
)

type lineInput struct {
	tty     bool
	reader  *bufio.Reader
	mu      sync.Mutex
	pending chan string
}

func newLineInput(r io.Reader, tty bool) *lineInput {
	return &lineInput{tty: tty, reader: bufio.NewReader(r)}
}

func (in *lineInput) readLine(ctx context.Context) (string, bool) {
	in.mu.Lock()
	if in.pending == nil {
		pending := make(chan string, 1)
		in.pending = pending
		go func() {
			line, _ := in.reader.ReadString('\n')
			pending <- line
		}()
	}
	pending := in.pending
	in.mu.Unlock()

	select {
	case line := <-pending:
		return in.take(pending, line)
	case <-ctx.Done():
		select {
		case line := <-pending:
			return in.take(pending, line)
		default:
			return "", false
		}
	}
}

func (in *lineInput) take(pending chan string, line string) (string, bool) {
	in.mu.Lock()
	if in.pending == pending {
		in.pending = nil
	}
	in.mu.Unlock()
	return strings.TrimSpace(line), true
}

func (in *lineInput) confirm(ctx context.Context, stderr io.Writer, prompt string) bool {
	fmt.Fprint(stderr, prompt)
	line, ok := in.readLine(ctx)
	if !ok {
		fmt.Fprintln(stderr)
		return false
	}
	switch strings.ToLower(line) {
	case "y", "yes":
		return true
	default:
		return false
	}
}
