# Tambayan Basketball Fantasy PH

Static GitHub Pages site for upcoming recommended matches and contests.

## Publish

Upload this folder to a GitHub repository, then enable GitHub Pages from the repository settings.

Recommended Pages source:

- Branch: `main`
- Folder: `/root`

## Auto update from Google Sheet

This folder already includes:

- `.github/workflows/auto-update-sheet.yml`
- `update_site_data.js`
- `scripts/build-from-sheet.js`

Once this folder is the root of your GitHub repository:

1. Turn on GitHub Pages
2. Keep the Google Sheet viewable by link
3. Turn on GitHub Actions for the repo

Then the site will:

- check the Google Sheet every 30 minutes
- rebuild `index.html`
- commit the updated HTML automatically when something changes

## Manual update

You can also run:

```bash
node update_site_data.js
```
