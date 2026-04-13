Run the unit tests for the "$ARGUMENTS" block.

Execute:

```bash
npx wtr "test/unit/blocks/$ARGUMENTS/$ARGUMENTS.test.js" --node-resolve --port=2000
```

If $ARGUMENTS is empty or "all", run the full suite instead:

```bash
npm test
```

After the run:
- Report which tests passed and which failed
- For any failure, read the test file and the block source, identify the root cause, and fix it
- If the test file doesn't exist yet, say so and suggest running `/new-block $ARGUMENTS`
