package commentpass

import (
	"context"
	"fmt"
	"sort"
	"strings"
)

// Verify fails on any comment block the branch added whose latest ledger verdict is not
// keep. With no ledger it passes only when the branch added no comment at all.
func (p *Pass) Verify(ctx context.Context) error {
	if err := p.requireBranch(ctx); err != nil {
		return err
	}
	base, err := p.mergeBase(ctx)
	if err != nil {
		return err
	}
	d, err := p.diff(ctx, base)
	if err != nil {
		return err
	}
	_, added, err := p.collectAdded(ctx, d)
	if err != nil {
		return err
	}
	ledger, exists, err := p.readLedger()
	if err != nil {
		return err
	}
	verdicts := ledger.latestVerdicts()
	paths := make([]string, 0, len(added))
	for path := range added {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	n := 0
	var fails []string
	for _, path := range paths {
		for _, a := range added[path] {
			n++
			if verdicts[KeyOf(path, a.Lines)] != "keep" {
				fails = append(fails, fmt.Sprintf("%s:%d: %s", path, a.StartLine, a.Lines[0]))
			}
		}
	}
	if n == 0 {
		p.printf("verify: no added comment blocks\n")
		return nil
	}
	if !exists {
		return fmt.Errorf("no ledger at %s and %d added comment blocks — run the comment pass:\n  %s", p.ledgerPath(), n, strings.Join(fails, "\n  "))
	}
	if len(fails) > 0 {
		return fmt.Errorf("%d of %d added comment blocks are not ledger keeps — run the comment pass:\n  %s", len(fails), n, strings.Join(fails, "\n  "))
	}
	p.printf("verify: %d added comment blocks, all kept in %s\n", n, p.ledgerPath())
	return nil
}
