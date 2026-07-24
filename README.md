# Mutual Check

A privacy-first Instagram followers/following comparison tool. Users import
their official Instagram export files and all processing happens locally in the
browser.

## What it does

- Accepts folders or individual Instagram JSON/HTML files
- Supports split follower exports such as `followers_1.json`
- Shows accounts that do not follow back, accounts the user does not follow
  back, and mutuals
- Searches results and exports the current list as CSV
- Has no login, backend, database, tracking, or file uploads

## Local development

```sh
npm install
npm run dev
```

## Verification

```sh
npm test
npm run build
```

## Deploying to Vercel

Import the GitHub repository into Vercel. The included `vercel.json` uses the
Vite build and serves the generated `dist` directory.
