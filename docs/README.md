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

## Documentation language

Repository documentation is written in English, and [`README.ko.md`](../README.ko.md) translates the
English README. The website and the app UI are written in English first and translated into Korean.
The one exception is the [release procedure](./RELEASE.md), a Korean runbook for the maintainers
who publish releases. Korean text uses the terms of the app's Korean UI in
[`ko.ts`](../src/renderer/src/i18n/locales/ko.ts), for example 릴리스 for "release".

## Historical records

- [PRD in Git history](https://github.com/hwantage/CanvaSlide/blob/683a03ba8c6a009a08822de14573a9c5df632141/docs/PRD.md): original product plan with subsequent edits; its milestones and exclusions are historical.
- [Implementation report in Git history](https://github.com/hwantage/CanvaSlide/blob/683a03ba8c6a009a08822de14573a9c5df632141/docs/REPORT.md): accumulated implementation notes, bug fixes and old validation results.

The PRD and implementation report are no longer maintained; their complete content remains available
at the fixed commit above. These records contain superseded claims and are not prerequisites for
routine work. Current design constraints extracted from them live in the architecture
guide; completed features are not a roadmap for future implementation.
