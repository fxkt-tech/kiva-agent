# Frontend Development Guidelines

> Best practices for frontend development in this project.

---

## Overview

This directory records the web package's component boundaries, presentation contracts and resource behavior.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Documented |
| [Component Guidelines](./component-guidelines.md) | Controlled fields, Base UI overlays, shared compositions and browser verification | Documented |
| [Hook Guidelines](./hook-guidelines.md) | Custom hooks, data fetching patterns | To fill |
| [State Management](./state-management.md) | Local state, global state, server state | To fill |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, forbidden patterns | To fill |
| [Type Safety](./type-safety.md) | Type patterns, validation | To fill |
| [Workspace Visual System](./visual-system.md) | Codex-style tokens, local Geist typography, responsive layout, Markdown and UI verification | Documented |
| [Appearance and Theme System](./theme-system.md) | Independent color mode/visual style, compatible preference lifecycle, material tokens and browser verification | Documented |
| [Scoped Workspace Resources](./workspace-routing.md) | URL identity, passive reads, isolated session execution, scoped events/drafts and safe cleanup | Documented |
| [Workspace Directory Reads](./workspace-files-performance.md) | Lightweight metadata, async bounded listings, in-flight sharing and stable tree inputs | Documented |
| [Global Web Settings](./global-settings.md) | Browser preferences/shortcuts, settings modal, safe provider credentials, installation endpoints and runtime refresh | Documented |
| [OpenAI Authorization](./openai-authorization.md) | Explicit ChatGPT login, bounded attempts, guarded credential commit/sign-out and passive-read boundaries | Documented |
| [Web Process Lifecycle](./web-process-lifecycle.md) | Installation-scoped clear-web command, positive process identity and bounded graceful shutdown | Documented |

---

## How to Fill These Guidelines

For each guideline file:

1. Document your project's **actual conventions** (not ideals)
2. Include **code examples** from your codebase
3. List **forbidden patterns** and why
4. Add **common mistakes** your team has made

The goal is to help AI assistants and new team members understand how YOUR project works.

---

**Language**: All documentation should be written in **English**.
