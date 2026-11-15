---
title: Profile schemas and validation
id: F01
version: implemented
---

## What it does

Every profile file's frontmatter is checked against a schema when it is read. A file with a problem is listed on the home page with its path and the reason, and generation is blocked until the profile is valid.
