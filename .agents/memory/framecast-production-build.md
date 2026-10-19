---
name: FrameCast production QueryClient dedupe
description: Prevent duplicate React Query contexts in the production Vite bundle.
---

FrameCast's Vite production build must deduplicate `@tanstack/react-query` alongside React and React DOM. Workspace resolution can give the app and generated API client different peer paths, bundling separate QueryClient contexts even when development preview appears healthy.

**Why:** The published bundle then throws “No QueryClient set” because the API hooks cannot see the provider.

**How to apply:** When adding workspace-linked React Query hooks or changing Vite resolution, keep the package in `resolve.dedupe` and test the built bundle in a browser.
