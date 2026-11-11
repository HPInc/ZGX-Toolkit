# SSH Algorithm Policies

For `HostKeyAlgorithms`, `Ciphers`, `KexAlgorithms`, and `MACs`, an explicit comma-separated list replaces the algorithm selection. A leading `^` places the named algorithms before the defaults, `+` appends them after the defaults, and `-` removes exact algorithm names from the defaults. Prepending moves an existing default to the requested position without duplicates.

Modifiers operate on the bundled `ssh2` client's defaults, restricted to toolkit-permitted algorithms available in the extension's runtime. They do not inherit the native OpenSSH client's defaults. Runtime-unavailable permitted preferences are skipped, retaining usable defaults; a policy leaving no usable algorithms is rejected. For example, `Ciphers ^aes128-gcm@openssh.com,aes256-gcm@openssh.com` prefers AES-GCM while retaining other permitted runtime defaults.

Wildcard patterns and embedded modifiers are not supported. Explicit, appended, or prepended legacy algorithms and host-key certificates remain rejected. Removing an algorithm that is not in the permitted defaults has no effect.
