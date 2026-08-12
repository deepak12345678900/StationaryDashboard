# Stationary Dashboard

This is a static HTML/CSS/JS dashboard for entering product sales and tracking transactions.

## Local preview

Open `index.html` directly in your browser, or run a simple HTTP server:

Windows PowerShell:

```powershell
cd "c:\Users\DEEPAK SANTHOSH\StationaryDashboard"
python -m http.server 8000
```

Then open:

```
http://localhost:8000
```

## Deploy options

### 1. GitHub Pages

1. Initialize git and commit the project.

```powershell
git init
git add .
git commit -m "Initial deployment"
```

2. Create a GitHub repository and add it as a remote.

```powershell
git remote add origin https://github.com/<your-username>/StationaryDashboard.git
git push -u origin main
```

3. Enable GitHub Pages in the repository settings:
   - Source: `main` branch
   - Folder: `/ (root)`

Your site will be available at:

```
https://<your-username>.github.io/StationaryDashboard
```

### 2. Netlify

1. Push this project to a GitHub repository.
2. Sign in to Netlify and import the repo.
3. For a static site, no build command is required.
4. Deploy from the root folder.

### 3. Vercel

1. Push this project to GitHub.
2. Create a new Vercel project and import the repo.
3. Select "Framework Preset: Other".
4. Set the output directory to `/` and deploy.

## Notes

- No build step is required; this is a plain static website.
- The code already includes responsive mobile layout support.

## Optional: Enable multi-user sync with Firebase

To make transactions share between phones and show who is using the site, use Firebase Firestore.

1. Create a Firebase project at https://console.firebase.google.com
2. Add a Web app and copy the config values.
3. Paste the config into `firebase-config.js` as `window.FIREBASE_CONFIG = { ... }`.
4. The site will automatically initialize Firestore and start syncing records and presence.

Notes:
- If `firebase-config.js` is empty the site will continue to work with localStorage only.
- Presence is implemented by updating a `users` collection document every ~25s; active users (last 5 minutes) are shown in the header.

If you want, I can also help you create a GitHub Pages workflow or set up the repo automatically using Git commands.