# Documentation map

CanvaSlide is a canvas presentation app: arrange editable content freely, frame the views you want to
show, and move between them with continuous zoom/pan. macOS and Windows are first-class desktop
targets; the browser editor, exported HTML player and product website have different platform capabilities.

## Maintained guides

| Task                                                       | Start here                                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Understand features, get started, use shortcuts            | [English README](../README.md), [한국어 README](../README.ko.md)                                  |
| Check which features are core or experimental              | [Feature status](../README.md#feature-status)                                                     |
| Follow a step-by-step user guide                           | [Website documentation](https://hwantage.github.io/CanvaSlide/docs/)                              |
| Set up, contribute, verify a change                        | [CONTRIBUTING](../CONTRIBUTING.md), [code rules and checks](../AGENTS.md)                         |
| Change rendering, history, presentation or document IO     | [Architecture and constraints](./ARCHITECTURE.md)                                                 |
| Import a local Figma file                                  | [Figma import](./FIGMA-IMPORT.md)                                                                 |
| See what the app sends over the network                    | [Network and privacy](../README.md#network-and-privacy)                                           |
| Use or host cloud snapshot sharing                         | [Cloud share](./CLOUD-SHARE.md)                                                                   |
| Check the hosted share service's terms, privacy and limits | [Hosted service](./CLOUD-SHARE.md#hosted-service)                                                 |
| Change how unsaved work is copied and offered back         | [Crash recovery](./CRASH-RECOVERY.md)                                                             |
| Edit or author a sample document                           | [Examples](../examples/README.md)                                                                 |
| Create a presentation with an AI assistant                 | [Authoring guide](../examples/README.md#authoring-with-ai), [portable skill](../skills/README.md) |
| Maintain the website and its user guide                    | [Website contributor guide](../website/README.md)                                                 |
| Build and publish a release                                | [Release procedure](./RELEASE.md) (Korean maintainer runbook)                                     |
| Report a security vulnerability                            | [Security policy](../SECURITY.md)                                                                 |

## Using this map

Read the guide relevant to the task; this list is not a reading checklist. Product summaries describe
supported workflows, while feature guides hold limitations and reproduction instructions. Verify
implementation details in the current checkout's code and tests; commands/dependencies come from
[`package.json`](../package.json), automated checks from [workflows](../.github/workflows/).
The package version identifies the app build; use [published releases](https://github.com/hwantage/CanvaSlide/releases)
to determine what has shipped, since a checkout can contain changes since that release.

## Maintaining documentation

Track proposed work in [issues](https://github.com/hwantage/CanvaSlide/issues). The rules for keeping
guides current are in [AGENTS.md](../AGENTS.md#documentation).

Maintain feature behavior, transmitted data and user-facing file compatibility guarantees in the
[English README](../README.md) (and its Korean translation), user instructions in the
[website guide](https://hwantage.github.io/CanvaSlide/docs/), and operational rules in [RELEASE.md](./RELEASE.md).
Contributor rules for format changes belong in [AGENTS.md](../AGENTS.md#code).
Other guides link to the owning section instead of copying the same facts.

## Documentation language

Repository documentation is written in English, and [`README.ko.md`](../README.ko.md) translates the
English README. The website and the app UI are written in English first and translated into Korean.
The one exception is the [release procedure](./RELEASE.md), a Korean runbook for the maintainers
who publish releases. Korean text uses the terms of the app's Korean UI in
[`ko.ts`](../src/renderer/src/i18n/locales/ko.ts), for example 릴리스 for "release".
