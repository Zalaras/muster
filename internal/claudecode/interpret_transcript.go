package claudecode

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"
	"strings"
)

// interruptTextPrefix starts the text block Claude Code appends to the transcript when the
// developer interrupts a turn: "[Request interrupted by user]" or "[Request interrupted by
// user for tool use]" (kb:fact/interrupt-recorded-in-transcript). An interrupt emits no hook
// (kb:fact/interrupt-emits-no-turn-end), so this line is the only trace of it.
const interruptTextPrefix = "[Request interrupted by user"

// PromptInterrupted reports whether the transcript at path records an interrupt of the
// prompt promptID. It reads only the file's tail (the interrupt line is the last line of
// its prompt, so transcriptTailBytes is enough). A missing file is (false, nil): a
// session that has not written a transcript yet has not been interrupted.
func PromptInterrupted(transcriptPath, promptID string) (bool, error) {
	tail, err := readTail(transcriptPath, transcriptTailBytes)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return scanInterrupt(bytes.NewReader(tail), promptID), nil
}

// scanInterrupt reports whether r holds a JSONL `user` line for promptID carrying a text
// block that starts with interruptTextPrefix. Lines that are not JSON (a tail read can
// begin mid-line) and lines of any other shape are skipped. A plan-feedback rejection
// writes a tool_result block only, never this text, so it never matches.
//
// It reads with bufio.Reader, not the bufio.Scanner of transcriptScan.scanChunk
// (launchtranscripts.go): Scanner caps a line (1 MiB there) and stops the whole scan on
// an over-long one, and a tail holding one huge tool_result line ahead of the interrupt
// line must not hide the interrupt. ReadBytes has no cap.
func scanInterrupt(r io.Reader, promptID string) bool {
	br := bufio.NewReader(r)
	for {
		line, err := br.ReadBytes('\n')
		if lineInterrupts(line, promptID) {
			return true
		}
		if err != nil {
			return false
		}
	}
}

func lineInterrupts(line []byte, promptID string) bool {
	var l struct {
		Type     string `json:"type"`
		PromptID string `json:"promptId"`
		Message  struct {
			Content json.RawMessage `json:"content"`
		} `json:"message"`
	}
	if json.Unmarshal(line, &l) != nil || l.Type != "user" || l.PromptID != promptID {
		return false
	}
	var blocks []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if json.Unmarshal(l.Message.Content, &blocks) != nil {
		return false // a plain-string content is a typed prompt, never the interrupt marker
	}
	for _, b := range blocks {
		if b.Type == "text" && strings.HasPrefix(b.Text, interruptTextPrefix) {
			return true
		}
	}
	return false
}
