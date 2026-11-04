---
id: shared-storage-module-reused-by-second-host
type: lesson
status: active
date: 2026-11-04
summary: The note saver, called reusable as it stands for the note window, stuck at unsaved when the other host re-sent the shared draft first; found in a fix wave.
features: []
tags: [pipeline, store]
roles: [planner, web-impl]
files: []
tests: []
refs: [plan:popped-out-note-enhance, plans/popped-out-note-enhance/web-implementation.md, plans/popped-out-note-enhance/test-specs.md]
---
**What happened.** The plan's hints called `createNoteSaver` and `createDraftStore` "reusable as they
stand" for the note window, with drafts shared through local storage with the dashboard. They were
written for one host: when the other host re-sent and acknowledged the shared draft first, this
host's failed flag was never cleared, so `unsaved, musterd unreachable` stuck, in both orderings.
Review cycle 1's wave 3 found it with one added assertion.

**Cost.** A refold of the cycle (web-impl, web-tests, e2e-specs again: about an hour).

**Lesson.** A module reused by a second host that shares its storage with the first is not
"reusable as it stands" until every ordering of the two hosts writing and acknowledging that storage
has been walked.
