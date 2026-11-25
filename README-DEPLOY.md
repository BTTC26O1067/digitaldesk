# DigitalDesk — Deployment package

This package excludes `node_modules`. The hosting service installs dependencies from `package.json`.

## Deploy on Render

1. Create a GitHub repository named `digitaldesk` and upload the contents of this folder (not the enclosing folder).
2. In Render, choose **New → Web Service**, connect the repository, and select the Node runtime.
3. Use:
   - Build command: `npm install`
   - Start command: `npm start`
   - Health check path: `/health`
4. Deploy. Render assigns a public `onrender.com` URL.
5. Open the URL and test the logic gate tester, circuit workbench, truth table, Save/Restore, JSON import/export.

The server uses `process.env.PORT` for hosting and serves `digital.html` at `/` as well as `/digital.html`.

## Important

- Do not upload `node_modules`.
- Do not commit passwords, API keys, or private credentials.
- This app currently stores saved circuits in the browser's localStorage. Saved circuits are browser/device-specific; they are not shared between visitors or synced to a server.
- Keep your original local project and launcher as a backup.
