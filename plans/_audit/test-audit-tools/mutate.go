// mutate writes one mutant file per mutation of each input Go file:
// operator swaps (comparison boundary, negation, &&/||, +/-, ++/--) and
// statement deletion. Usage: go run mutate.go OUTDIR file.go...
package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
)

var swaps = map[token.Token][]string{
	token.EQL: {"!="}, token.NEQ: {"=="},
	token.LSS: {"<=", ">="}, token.LEQ: {"<", ">"},
	token.GTR: {">=", "<="}, token.GEQ: {">", "<"},
	token.LAND: {"||"}, token.LOR: {"&&"},
	token.ADD: {"-"}, token.SUB: {"+"},
}

func main() {
	out := os.Args[1]
	n := 0
	manifest, _ := os.Create(filepath.Join(out, "manifest.tsv"))
	for _, path := range os.Args[2:] {
		src, _ := os.ReadFile(path)
		fset := token.NewFileSet()
		f, err := parser.ParseFile(fset, path, src, 0)
		if err != nil {
			panic(err)
		}
		emit := func(start, end int, repl, desc string) {
			n++
			m := string(src[:start]) + repl + string(src[end:])
			name := fmt.Sprintf("m%03d.go", n)
			os.WriteFile(filepath.Join(out, name), []byte(m), 0o644)
			line := fset.Position(token.Pos(fset.File(f.Pos()).Base() + start)).Line
			fmt.Fprintf(manifest, "%s\t%s\t%s:%d\t%s\n", name, path, filepath.Base(path), line, desc)
		}
		ast.Inspect(f, func(nd ast.Node) bool {
			switch x := nd.(type) {
			case *ast.BinaryExpr:
				if alts, ok := swaps[x.Op]; ok {
					// skip string concatenation
					if x.Op == token.ADD {
						if bl, ok := x.X.(*ast.BasicLit); ok && bl.Kind == token.STRING {
							return true
						}
					}
					off := fset.Position(x.OpPos).Offset
					for _, a := range alts {
						emit(off, off+len(x.Op.String()), a, x.Op.String()+" -> "+a)
					}
				}
			case *ast.IfStmt:
				cs, ce := fset.Position(x.Cond.Pos()).Offset, fset.Position(x.Cond.End()).Offset
				emit(cs, ce, "!("+string(src[cs:ce])+")", "negate if: "+strings.SplitN(string(src[cs:ce]), "\n", 2)[0])
			case *ast.UnaryExpr:
				if x.Op == token.NOT {
					off := fset.Position(x.OpPos).Offset
					emit(off, off+1, "", "drop !")
				}
			case *ast.ImportSpec:
				return false
			case *ast.Field:
				if x.Tag != nil {
					ast.Inspect(x.Type, func(n ast.Node) bool { return true })
					return false
				}
			case *ast.BasicLit:
				s, e := fset.Position(x.Pos()).Offset, fset.Position(x.End()).Offset
				switch x.Kind {
				case token.STRING:
					if x.Value == `""` || x.Value == "``" {
						emit(s, e, `"x"`, "string \"\" -> \"x\"")
					} else {
						emit(s, e, `""`, "string "+strings.SplitN(x.Value, "\n", 2)[0]+" -> \"\"")
					}
				case token.INT:
					if x.Value == "0" {
						emit(s, e, "1", "int 0 -> 1")
					} else {
						emit(s, e, "0", "int "+x.Value+" -> 0")
						emit(s, e, "("+x.Value+"+1)", "int "+x.Value+" -> +1")
					}
				}
			case *ast.Ident:
				if x.Name == "true" || x.Name == "false" {
					s := fset.Position(x.Pos()).Offset
					alt := map[string]string{"true": "false", "false": "true"}[x.Name]
					emit(s, s+len(x.Name), alt, x.Name+" -> "+alt)
				}
			case *ast.IncDecStmt:
				off := fset.Position(x.TokPos).Offset
				alt := map[token.Token]string{token.INC: "--", token.DEC: "++"}[x.Tok]
				emit(off, off+2, alt, x.Tok.String()+" -> "+alt)
			case *ast.BlockStmt:
				for _, st := range x.List {
					switch st.(type) {
					case *ast.DeclStmt, *ast.LabeledStmt:
						continue
					}
					if a, ok := st.(*ast.AssignStmt); ok && a.Tok == token.DEFINE {
						continue
					}
					s, e := fset.Position(st.Pos()).Offset, fset.Position(st.End()).Offset
					txt := strings.SplitN(string(src[s:e]), "\n", 2)[0]
					emit(s, e, "", "delete: "+strings.TrimSpace(txt))
				}
			}
			return true
		})
	}
	fmt.Println(n, "mutants")
}
