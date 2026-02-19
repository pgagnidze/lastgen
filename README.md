<div align="center">

# lastgen

Check if you started coding before or after AI agents.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522.18.0-green)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)]()

</div>

Claude Code shipped publicly on **February 21, 2025**. If your earliest verifiable commit is before that date, you get classified as **Last Gen**. If it's after, **AI Native**.

> [!IMPORTANT]
> This is a novelty tool for fun. It is not a measure of skill or credibility.

## Installation

```bash
npx lastgen <username>
```

> [!TIP]
> Requires Node.js 22.18.0+ (uses native TypeScript execution). No build step needed.

For authenticated requests (5,000 req/hour instead of 60):

```bash
export GITHUB_TOKEN=ghp_your_token_here
npx lastgen <username>
```

## Usage

```bash
# Classify a GitHub user
npx lastgen torvalds

# Save certificate to file
npx lastgen --json torvalds > proof.json

# Verify a saved certificate
npx lastgen verify proof.json

# Get a README badge
npx lastgen --badge torvalds

# JSON output
npx lastgen --json torvalds
```

### Options

```
--token <token>       GitHub personal access token
--json                Output as JSON
--badge               Output as README badge markdown
--no-color            Disable colors
-h, --help            Show help
-v, --version         Show version
```

### Environment

```
GITHUB_TOKEN          GitHub token (alternative to --token)
NO_COLOR              Disable colors (any value)
```

## Certificate

Running `lastgen <username>` generates a certificate like this:

```
+----------------------------------------------------+
|                LASTGEN CERTIFICATE                 |
+----------------------------------------------------+
| Certificate  LGC-3476-525342                       |
| Issued       2026-02-19                            |
|                                                    |
| Developer    torvalds (Linus Torvalds)             |
| Era          Last Generation Coder                 |
|              Wrote code before AI agents shipped   |
|                                                    |
| Proof Commit torvalds/linux                        |
|              319fc77 Merge tag 'bpf-fixes' of git: |
|              //git.kernel.org/pub/scm/linux/kernel |
|              /git/bpf/bpf                          |
| Commit Date  2025-02-21                            |
|                                                    |
| Hash         sha256:347605d01e5e38124b829c59efc116 |
|              6bbf97f888429ff65a3cb0d567e3440b61    |
+----------------------------------------------------+
```

Certificates are deterministic - same username always produces the same hash and certificate number.

## README Badge

```bash
npx lastgen --badge <username>
```

Outputs shields.io markdown you can paste into your README:

[![Last Gen Coder](https://img.shields.io/badge/lastgen-Last%20Gen-blue?style=for-the-badge)](https://github.com/pgagnidze/lastgen)

## Verification

Saved certificates can be verified against the live GitHub API:

```bash
npx lastgen verify proof.json
```

Checks include:

| Check                  | What it does                                              |
| ---------------------- | --------------------------------------------------------- |
| **Hash integrity**     | Recomputes SHA-256 hash to detect tampering               |
| **Era classification** | Confirms era matches the proof date                       |
| **Identity**           | 3-way match: author login, committer login, noreply email |
| **Repo ownership**     | Reports whether commit is in a self-owned or third-party repo |
| **GitHub ID**          | Matches commit author ID against certificate              |
| **Commit date**        | Fetches the commit from GitHub and compares dates         |
| **Date consistency**   | Detects forged author dates via author/committer drift    |

## License

[MIT](LICENSE)

---

> [!NOTE]
> This project was built with assistance from LLMs. Human review and guidance provided throughout.
