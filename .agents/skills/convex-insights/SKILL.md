---
name: convex-insights
description: Inspect authorized Convex deployment logs and health to investigate a specific operational question.
---

Read `convex/_generated/ai/guidelines.md`. Identify the authorized deployment and name it before reading logs. Production access requires the user's explicit authorization under the repository instructions.

Discover the actual tools, request schemas, and function names. MCP request objects and CLI flags are different interfaces. For CLI use, inspect the installed command's help; for MCP, use its declared parameters. Never paste CLI flags into a structured request.

Fetch a bounded sample relevant to the reported failure or time window. Use supported server filters, then filter locally where necessary and disclose sampling limits. Correlate failures with deployment times without treating correlation alone as proof.

Report counts, a redacted representative error, and the implicated function. This workflow is read-only. Do not run mutations, change monitoring configuration, or deploy as part of log inspection.
