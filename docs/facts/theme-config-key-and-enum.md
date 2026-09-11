---
id: theme-config-key-and-enum
type: fact
status: active
date: 2026-09-11
summary: Claude Code's theme is the global-config key theme with a six-value enum; family is startsWith("light"); default dark.
features: [theme]
tags: [claude-code-format]
files: [internal/claudecode/theme.go]
tests: [TestInstalledBinaryCarriesInterfaceStrings, TestReadThemeFamily_PrefixMapping, TestReadThemeFamily_KeyAbsentIsDark]
refs: [plan:new-ui-design-colors]
verified: 2.1.258..canary
guard: TestThemeConfigParses
---
Claude Code's theme setting is the key `theme` in its global config file (the file's basename
is recorded only in `internal/claudecode/theme.go`). The value enum in the bundle is
`["dark", "light", "light-daltonized", "dark-daltonized", "light-ansi", "dark-ansi"]`; the
bundle's own family test is `startsWith("light")`; the default when the key is absent is
`dark` (`resolveSetting("theme", "dark")`). Damian's live file has no `theme` key.

Evidence: static inspection of the installed 2.1.258 bundle plus a read-only look at the real
file, 2026-09-02. Since 2026-09-10 the static tier asserts the four non-default enum members
as byte strings and the live guard asserts `ReadThemeFamily(DefaultConfigPath())` parses the
real file. String presence is not semantics: glance at the `resolveSetting("theme", …)` site on
a canary run.
