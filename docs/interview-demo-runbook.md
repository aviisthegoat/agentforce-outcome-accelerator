# Interview Demo Runbook

## One-command startup

```bash
npm run interview:demo
```

This starts frontend and backend together.

## Demo flow (5-7 minutes)

1. Open `samples/interview/scenario-1-stalled-opportunity.json`.
2. Paste the `coach_context` values into simulation inputs.
3. Send the `user_message` in the simulation chat.
4. Show the structured coaching output:
   - diagnosis
   - top issues
   - recommended talk track
   - next question
   - risk flags
   - confidence
5. Repeat quickly for scenario 2 or 3 to show consistency.

## 60-second narrative

This product turns generic persona chat into an applied AI coach. We capture deal context, run a retrieval-grounded agent, enforce a structured coaching output contract, and validate response quality against an enterprise rubric for context fidelity, actionability, sales-method alignment, and safety.

## If model output is noisy

- Re-run the same prompt once (the validator loop attempts repair automatically).
- Explicitly restate the desired outcome in one sentence.
- Point to the output schema and note that the service enforces deterministic structure.
