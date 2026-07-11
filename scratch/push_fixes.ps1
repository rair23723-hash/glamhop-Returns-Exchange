# GlamHop Push Fixes Script
# Run this script to stage, commit, and push Vercel build fixes to GitHub.

Write-Host "Staging updated route files, typings, configurations, and shopify.app.toml..." -ForegroundColor Cyan
git add package.json vercel.json app/routes/app.tsx prisma/schema.prisma app/routes/_index.tsx app/routes/auth.login.tsx app/shopify.server.ts shopify.app.toml app/routes/app.proxy.tsx

Write-Host "Committing changes..." -ForegroundColor Cyan
git commit -m "fix: resolve typescript compilation typings in app.proxy.tsx"

Write-Host "Pushing fixes to GitHub main branch..." -ForegroundColor Cyan
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "Changes successfully pushed to GitHub!" -ForegroundColor Green
    $hash = git rev-parse HEAD
    Write-Host "Latest Commit Hash: $hash" -ForegroundColor Green
    Write-Host "Ready to redeploy on Vercel!" -ForegroundColor Green
} else {
    Write-Error "Failed to push fixes to GitHub. Please check your network or repository settings."
}
