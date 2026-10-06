package commentpass

import (
	"fmt"
	"go/scanner"
	"go/token"
)

// token is one comment as the language scanner saw it: byte offsets into the source and
// the raw text including its delimiters.
type ctoken struct {
	start, end int
	text       string
}

// scanGo uses go/scanner, so a "//" inside a string or rune literal is never a comment.
// Offsets come from the file set, never Position.Line, which a //line directive skews.
func scanGo(src []byte) ([]ctoken, error) {
	fset := token.NewFileSet()
	file := fset.AddFile("", -1, len(src))
	var firstErr error
	var s scanner.Scanner
	s.Init(file, src, func(pos token.Position, msg string) {
		if firstErr == nil {
			firstErr = fmt.Errorf("%d:%d: %s", pos.Line, pos.Column, msg)
		}
	}, scanner.ScanComments)
	var out []ctoken
	for {
		pos, tok, lit := s.Scan()
		if tok == token.EOF {
			break
		}
		if tok == token.COMMENT {
			start := file.Offset(pos)
			out = append(out, ctoken{start: start, end: start + len(lit), text: lit})
		}
	}
	if firstErr != nil {
		return nil, firstErr
	}
	return out, nil
}
