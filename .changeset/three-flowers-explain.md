---
"@callstack/repack": major
---

BREAKING CHANGE: Added a strict configuration cascade system (CLI Flags -> Config Values -> Command Defaults -> Webpack/Rspack Defaults) to provide clear and predictable configuration resolution.

CLI arguments now always take highest precedence and cannot be overridden by config files, ensuring consistent behavior across all commands.
