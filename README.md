# marketo-challenge
Programming challenge for Marketo.

## Use
Run `index.js` with `node` and pass it a path to the JSON data to be deduplicated:

```bash
node index.js ./leads.json
```

The deduplicated JSON gets written to `deduped.json` in the same directory as `index.js`.

The object changelog gets written to `deduped.log` in the same directory as `index.js`.
