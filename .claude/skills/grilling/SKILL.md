---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview me relentlessly about every aspect of this until we reach a shared understanding. Walk down each branch of the decision tree, resolving dependencies between decisions.

**Ask via the AskUserQuestion tool — never as prose questions in chat.** Every question goes through AskUserQuestion so I get the interactive picker UI.

**Batch questions — do not ask one at a time.** AskUserQuestion takes up to 4 questions per call, so:

- Gather every independent question you have and fire them in batches of 4 per call until the backlog is empty. Do not wait for an answer before asking a question that doesn't depend on it.
- Only defer a question to a later round when it genuinely depends on an earlier answer (a real decision-tree branch). Then ask the follow-up round — again batched.
- Keep rounds to a minimum: prefer 1–3 big rounds over a long back-and-forth.

For each question, provide your recommended answer as the **first option**, labeled with "(Recommended)". Give each option a short label and a description explaining the trade-off. Use `multiSelect` when choices aren't mutually exclusive.

If a *fact* can be found by exploring the environment (filesystem, tools, etc.), look it up rather than asking me. The *decisions*, though, are mine — put each one to me and wait for my answer.

Do not act on it until I confirm we have reached a shared understanding.
