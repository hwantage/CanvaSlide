# Security policy

## Supported versions

Security fixes go into the next release. Only the
[latest release](https://github.com/hwantage/CanvaSlide/releases/latest) is supported; update to it
before reporting a problem you found in an older build.

The hosted [web editor](https://canvaslide.pages.dev/) and its share API are fixed where they run,
with nothing to install. An HTML export embeds its player when it is created, so a player fix applies
to newly exported files; files exported earlier must be exported again.

## Reporting a vulnerability

Please do not report security problems in public issues, pull requests or comments.

Report them privately through GitHub instead:
[open a private vulnerability report](https://github.com/hwantage/CanvaSlide/security/advisories/new).
The report stays private to you, the maintainers and anyone they add to the advisory.

Include what you can of the following, in English:

- The affected part: desktop app, browser editor, exported HTML player, hosted share API or website
- The CanvaSlide version or commit, your operating system, and the browser if one is involved
- Steps or a minimal `.canvaslide` document that reproduces the problem
- What an attacker could achieve, and any conditions it depends on

When testing the hosted service, use only your own documents and share links, and do not send traffic
that could affect other users.

## What to expect

- We aim to acknowledge a report within 7 days.
- We confirm or decline the report in the advisory, with our reasoning, and keep you updated there
  while we work on a fix.
- Once a fixed release or deployment is available, we publish the advisory and credit you, unless you
  prefer not to be named.

Please keep the details private until the advisory is published. If a fix takes longer than
expected, we will agree on a disclosure date with you in the advisory.

A vulnerability in a dependency belongs with that project. Tell us too if a CanvaSlide release ships
an affected version, so we can update it.
