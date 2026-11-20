# Cat Planet · 喵星

Every cat that left us went to Cat Planet.

- **English (primary):** Cat Planet  
- **Chinese:** 喵星  
- **Domain:** [catplanet.online](https://catplanet.online)

## Local

```bash
cd web
npm install
python3 scripts/serve.py 5173
```

API routes (`/api/*`) need Vercel (Blob token). Local static preview works for the town; auth/slug checks require `vercel dev` or a deploy.

## Deploy

Static + serverless APIs from `web/`, hosted on Vercel.
