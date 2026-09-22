// Command queue drives one branch through the spike merge queue.
//
//	go run ./cmd/queue [-verify CMD] [-target main] [-confirm] [-resolve PATH=FILE] <repo> <branch>
//
// MUSTER_QUEUE_CRASH_AFTER=<point> makes it os.Exit(3) at that point (restart-safety tests).
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	"muster-spike-queue/queue"
)

func main() {
	verify := flag.String("verify", "", "verify command (sh -c); default from git config muster.verify")
	target := flag.String("target", "main", "target branch")
	confirm := flag.Bool("confirm", false, "confirm an awaiting-confirm entry before running")
	resolve := flag.String("resolve", "", "PATH=FILE: store FILE as the resolution for conflicted PATH")
	flag.Parse()
	if flag.NArg() != 2 {
		flag.Usage()
		os.Exit(2)
	}
	repo, branch := flag.Arg(0), flag.Arg(1)
	q, err := queue.Open(&queue.Queue{
		Repo: repo, Target: *target, VerifyCmd: *verify,
		CrashAfter: os.Getenv("MUSTER_QUEUE_CRASH_AFTER"),
		Logf:       log.New(os.Stderr, "queue: ", 0).Printf,
	})
	if err != nil {
		log.Fatal(err)
	}
	if *resolve != "" {
		path, file, ok := strings.Cut(*resolve, "=")
		if !ok {
			log.Fatal("-resolve wants PATH=FILE")
		}
		b, err := os.ReadFile(file)
		if err != nil {
			log.Fatal(err)
		}
		if err := q.Resolve(branch, path, b); err != nil {
			log.Fatal(err)
		}
	}
	if *confirm {
		if err := q.Confirm(branch); err != nil {
			log.Fatal(err)
		}
	}
	e, err := q.Run(branch)
	if e != nil {
		b, _ := json.MarshalIndent(e, "", "  ")
		fmt.Println(string(b))
	}
	if err != nil {
		log.Fatal(err)
	}
	if e.State == queue.Failed {
		os.Exit(1)
	}
}
