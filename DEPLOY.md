# How to Deploy Ad Maker to the Web

This is a complete, step-by-step guide. No prior experience needed.

---

## What You Need Before Starting

1. **A GitHub account** (free) — https://github.com
2. **Your code pushed to GitHub** (we'll do this below)
3. **A Railway account** (free $5 trial) — https://railway.com
4. **Your API keys** (you already have these in your `.env.local` file)

---

## Step 1: Push Your Code to GitHub

Your code is already in a Git repo locally. Now you need to put it on GitHub so Railway can grab it.

### 1a. Create a GitHub repository

1. Go to https://github.com/new
2. **Repository name:** `ad-maker` (or whatever you want)
3. **Visibility:** Private (keeps your code private)
4. **DO NOT** tick "Add a README" or ".gitignore" — you already have these
5. Click **"Create repository"**

### 1b. Connect your local code to GitHub

GitHub will show you a page with commands. Open your Terminal, make sure you're in the `Ad App` folder, and run these commands (replace YOUR-USERNAME with your actual GitHub username):

```bash
cd ~/Ad\ App
git remote add origin https://github.com/YOUR-USERNAME/ad-maker.git
git add -A
git commit -m "Prepare for deployment"
git branch -M main
git push -u origin main
```

If it asks for a password, you'll need a **Personal Access Token** instead:
1. Go to https://github.com/settings/tokens
2. Click **"Generate new token (classic)"**
3. Give it a name like "Ad App deploy"
4. Tick the **"repo"** scope
5. Click **"Generate token"**
6. Copy the token and use it as your password when Git asks

Your code is now on GitHub.

---

## Step 2: Create a Railway Account

1. Go to https://railway.com
2. Click **"Login"** → **"Login with GitHub"**
3. Authorize Railway to access your GitHub

---

## Step 3: Deploy on Railway

### 3a. Create a new project

1. Once logged in, click **"New Project"**
2. Click **"Deploy from GitHub Repo"**
3. Find and select your `ad-maker` repository
4. Railway will detect the Dockerfile and start building — **let it build but it will fail** because it doesn't have your API keys yet. That's fine.

### 3b. Add your environment variables (API keys)

1. Click on your service (the purple box that appeared)
2. Go to the **"Variables"** tab
3. Click **"New Variable"** and add each of these:

| Variable Name        | Value                                      |
|---------------------|--------------------------------------------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (starts with `sk-ant-`) |
| `GOOGLE_API_KEY`    | Your Google API key (for Veo video generation), if you have one |
| `PORT`              | `3000`                                     |

To find your current keys, look in your `.env.local` file on your computer.

### 3c. Redeploy

1. After adding the variables, Railway will automatically redeploy
2. Wait for the build to finish (2-5 minutes) — you'll see logs scrolling
3. When it says **"Deployed"** with a green checkmark, you're live!

### 3d. Get your website URL

1. Click on your service (the purple box)
2. Go to the **"Settings"** tab
3. Scroll down to **"Networking"**
4. Under **"Public Networking"**, click **"Generate Domain"**
5. Railway will give you a URL like `ad-maker-production-abc123.up.railway.app`
6. **That's your website!** Open it in a browser.

---

## Step 4: Use Your App

Open the Railway URL in any browser and use the app exactly like you do locally. Upload videos, generate ads, render — it all works the same way.

---

## Updating Your App Later

Whenever you make changes locally and want to update the live website:

```bash
cd ~/Ad\ App
git add -A
git commit -m "Description of what you changed"
git push
```

Railway automatically detects the push and redeploys. Takes about 2-5 minutes.

---

## Costs

- **Railway:** ~$5-10/month for light usage. You get a $5 free trial. After that it's pay-as-you-go based on CPU/memory usage. A hobby project typically costs $5-10/month.
- **Anthropic API:** You already pay for this based on usage
- **Google Veo API:** You already pay for this based on usage

---

## Troubleshooting

### "Build failed"
- Click on the deployment and read the build logs
- Most common cause: missing environment variable. Double check you added them all.

### "Application failed to respond"
- Check the **"Logs"** tab on your Railway service for error messages
- Usually means an API key is wrong or missing

### "503 Service Unavailable" right after deploying
- The app is still starting up. Wait 30 seconds and refresh.

### App is slow
- Railway free trial has limited resources. If you upgrade to the Hobby plan ($5/month), performance improves.

### Uploaded files disappear after redeployment
- Railway's filesystem resets on each deploy. For a production app, you'd want to add cloud storage (like AWS S3), but for personal use this is fine — just re-upload files after deploying new code.

---

## Optional: Custom Domain (e.g., yourdomain.com)

If you buy a domain name (from Namecheap, Google Domains, etc.):

1. In Railway, go to your service → **Settings** → **Networking**
2. Click **"Custom Domain"**
3. Type your domain (e.g., `ads.yourdomain.com`)
4. Railway will give you a CNAME record
5. Go to your domain provider's DNS settings
6. Add a CNAME record pointing to what Railway gave you
7. Wait 5-30 minutes for DNS to propagate
8. Done — your app is now at your custom domain with HTTPS included
