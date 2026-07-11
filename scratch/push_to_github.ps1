# GlamHop Git Push Automation Script
# Run this script to link your remote repository and push changes to GitHub.

$remoteUrl = Read-Host "Please enter your GitHub repository URL (e.g., https://github.com/username/repo-name.git)"

if ([string]::IsNullOrWhiteSpace($remoteUrl)) {
    Write-Error "GitHub Remote URL cannot be empty."
    exit 1
}

Write-Host "Setting main branch..." -ForegroundColor Cyan
git branch -M main

# Check if origin already exists
$existingRemote = git remote get-url origin 2>$null
if ($existingRemote) {
    Write-Host "Updating existing origin remote..." -ForegroundColor Yellow
    git remote set-url origin $remoteUrl
} else {
    Write-Host "Adding remote origin..." -ForegroundColor Cyan
    git remote add origin $remoteUrl
}

Write-Host "Pushing code to GitHub main branch..." -ForegroundColor Cyan
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "GitHub push completed successfully!" -ForegroundColor Green
    $hash = git rev-parse HEAD
    Write-Host "Commit Hash: $hash" -ForegroundColor Green
} else {
    Write-Error "Failed to push code to GitHub. Please check your credentials and repository URL."
}
