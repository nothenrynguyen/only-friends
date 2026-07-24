# Only Friends

A privacy-first Instagram followers/following comparison tool. Users import
their official Instagram export files and all processing happens locally in the
browser.

## What it does

- Accepts separate Followers and Following folders
- Recursively discovers the HTML or JSON file inside each folder
- Asks the user which file to use when a folder contains multiple ambiguous files
- Supports split follower exports such as `followers_1.json`
- Shows all unique accounts, mutuals, accounts that do not follow back, and
  accounts the user does not follow back
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
