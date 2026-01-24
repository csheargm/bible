# Deployment Instructions for GitHub Pages

## Setup Steps:

### 1. Add GitHub Secret for API Key
1. Go to your repository: https://github.com/csheargm/bible
2. Click on "Settings" tab
3. In the left sidebar, click "Secrets and variables" → "Actions"
4. Click "New repository secret"
5. Add the following secret:
   - Name: `GEMINI_API_KEY`
   - Value: Your Gemini API key

### 2. Enable GitHub Pages
1. In repository Settings
2. Go to "Pages" in the left sidebar
3. Under "Build and deployment":
   - Source: Select "GitHub Actions"

### 3. Deploy
The site will automatically deploy when you push to the master branch.
You can also manually trigger deployment:
1. Go to "Actions" tab
2. Select "Deploy to GitHub Pages"
3. Click "Run workflow"

### 4. Access Your Site
Once deployed, your site will be available at:
https://csheargm.github.io/bible/

## Important Notes:
- The API key is securely stored as a GitHub secret
- It's injected during build time, not exposed in the deployed code
- The vite config has been set up with base: '/bible/' for proper GitHub Pages routing