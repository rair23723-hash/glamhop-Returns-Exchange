# GlamHop Build Automation Script
# Run this script to execute Prisma generation and build the project for Vercel.

Write-Host "Generating Prisma Client..." -ForegroundColor Cyan
node "node_modules/prisma/build/index.js" generate

Write-Host "Running Type Checks (tsc)..." -ForegroundColor Cyan
node "node_modules/typescript/bin/tsc" --noEmit

if ($LASTEXITCODE -ne 0) {
    Write-Error "Typechecking failed. Please check files."
    exit 1
}

Write-Host "Building client assets..." -ForegroundColor Cyan
node "node_modules/vite/bin/vite.js" build

Write-Host "Building server assets..." -ForegroundColor Cyan
node "node_modules/vite/bin/vite.js" build --ssr

if ($LASTEXITCODE -eq 0) {
    Write-Host "Production build generated successfully!" -ForegroundColor Green
} else {
    Write-Error "Production build failed."
}
