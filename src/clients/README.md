# Clients

This folder holds the data layer.

`getJobSource()` in `index.ts` returns the active `JobSource`. Right now that is
`stub.source.ts`, which serves fixtures so the pipeline is runnable before any
capture exists.

## Adding a real source

1. Capture the target career page with `reverse-api-engineer`
   (`Work Studio/The Forge/tools/reverse-api-engineer`).
2. Generate the client in **TypeScript**.
3. Drop the generated file in this folder.
4. Write a thin wrapper implementing `JobSource`:

```ts
import type { JobSource } from "./types.js";
import { fetchJobs as generatedFetch } from "./<generated>.js";

export const targetSource: JobSource = {
  name: "target",
  async fetchJobs() {
    const raw = await generatedFetch();
    return raw.map((j: any) => ({
      id: String(j.id),
      title: j.title,
      company: j.company,
      location: j.location,
      url: j.url,
      description: j.description,
      postedAt: j.postedAt,
      source: "target",
    }));
  },
};
```

5. Return it from `getJobSource()`.
6. Run `npm run test:fetch` to verify, then `npm run dev`.

Never commit cookies, tokens, or HAR files. Public career pages normally need no
auth; if the generated client contains one, delete it before committing.
