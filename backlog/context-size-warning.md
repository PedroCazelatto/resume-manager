---
title: Warn when a model call won't fit the context window
id: F40
version: next version
reported: 2026-11-15
---

## Problem

If the prompt, the model's thinking and the reply together exceed `OLLAMA_NUM_CTX`, the step fails only after a long wait.

## What to build

- Before each model call, estimate the prompt's size against the context window and say up front when it is too close to the limit.
- The message names the setting to raise.

## Notes

- The size of the thinking can't be known in advance, so this is an estimate with a margin, not a guarantee.
