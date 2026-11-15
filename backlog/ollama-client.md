---
title: Local model through Ollama
id: F29
version: implemented
---

## What it does

Every model call goes to the local Ollama with a JSON schema for the reply, and the reply is validated against it. Model, context size, thinking mode and timeout come from `.env`.
