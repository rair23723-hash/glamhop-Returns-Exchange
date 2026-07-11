# GlamHop Local .env Creator Script
# Runs locally to securely prompt for configuration values and create the .env file.

$envPath = Join-Path $PSScriptRoot "..\.env"

Write-Host "--- GlamHop .env Configurator ---" -ForegroundColor Cyan

# 1. Read values from existing environment variables if present, otherwise prompt securely
$apiKey = $env:SHOPIFY_API_KEY
if (-not $apiKey) {
    $apiKey = Read-Host "Enter SHOPIFY_API_KEY"
}

$apiSecret = $env:SHOPIFY_API_SECRET
if (-not $apiSecret) {
    Write-Host "Enter SHOPIFY_API_SECRET (typing hidden): " -NoNewline -ForegroundColor Yellow
    $apiSecret = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host -AsSecureString))
    )
}

$appUrl = $env:SHOPIFY_APP_URL
if (-not $appUrl) {
    $appUrl = Read-Host "Enter SHOPIFY_APP_URL (e.g. https://glamhop-returns-exchange.vercel.app)"
}

$scopes = "write_orders,read_orders,read_customers"

$dbUrl = $env:DATABASE_URL
if (-not $dbUrl) {
    Write-Host "Enter DATABASE_URL (PostgreSQL connection string, typing hidden): " -NoNewline -ForegroundColor Yellow
    $dbUrl = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host -AsSecureString))
    )
}

$directUrl = $env:DIRECT_URL
if (-not $directUrl) {
    Write-Host "Enter DIRECT_URL (Direct connection string, typing hidden, press Enter to match DATABASE_URL): " -NoNewline -ForegroundColor Yellow
    $directUrl = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host -AsSecureString))
    )
    if (-not $directUrl) {
        $directUrl = $dbUrl
    }
}

# 2. Write variables to .env
$envContent = @"
# Shopify App Configurations
SHOPIFY_API_KEY=$apiKey
SHOPIFY_API_SECRET=$apiSecret
SHOPIFY_APP_URL=$appUrl
SCOPES=$scopes

# Database Configuration
DATABASE_URL="$dbUrl"
DIRECT_URL="$directUrl"

# Node settings
PORT=3000
"@

[System.IO.File]::WriteAllText($envPath, $envContent)

Write-Host "Saved local .env successfully!" -ForegroundColor Green
