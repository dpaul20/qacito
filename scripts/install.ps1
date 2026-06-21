#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot

# Node >= 20
try {
    $nodeMajor = node -e "process.stdout.write(process.version.slice(1).split('.')[0])" 2>$null
    if ([int]$nodeMajor -lt 20) {
        Write-Error "Node.js 20+ required. Current: $(node -v)"
        exit 1
    }
} catch {
    Write-Error "Node.js not found. Install from https://nodejs.org"
    exit 1
}

# Install deps (includes @clack/prompts)
Push-Location $Root
npm install --silent
Pop-Location

# Launch TUI wizard
node "$Root\scripts\install.mjs"
