param(
    [Parameter(Position=0)]
    [ValidateSet("claude", "deepseek", "status", "")]
    [string]$Mode = "",

    [ValidateSet("flash", "pro")]
    [string]$Model = "flash",

    [switch]$NoLaunch
)

$DeepSeekApiKey    = $env:DEEPSEEK_API_KEY
if ([string]::IsNullOrEmpty($DeepSeekApiKey) -and $Mode -eq "deepseek") {
    Write-Host ""
    Write-Host " [ERROR] DEEPSEEK_API_KEY environment variable is not set." -ForegroundColor Red
    Write-Host " Set it first:"                                              -ForegroundColor Red
    Write-Host '   $env:DEEPSEEK_API_KEY = "sk-your-key-here"'             -ForegroundColor Yellow
    Write-Host " Or add it permanently via Windows Environment Variables."  -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

$DeepSeekBaseUrl   = "https://api.deepseek.com/anthropic"
$DeepSeekConfigDir = "$env:USERPROFILE\.claude-deepseek"

$DeepSeekModels = @{
    "flash" = "deepseek-v4-flash"
    "pro"   = "deepseek-v4-pro"
}

function Set-EnvBoth($Name, $Value) {
    # Apply to current session immediately
    [System.Environment]::SetEnvironmentVariable($Name, $Value, "Process")
    # Persist for future terminals
    [System.Environment]::SetEnvironmentVariable($Name, $Value, "User")
}

function Remove-EnvBoth($Name) {
    [System.Environment]::SetEnvironmentVariable($Name, $null, "Process")
    [System.Environment]::SetEnvironmentVariable($Name, $null, "User")
}

function Set-DeepSeekMode {
    $modelId = $DeepSeekModels[$Model]

    if (-not (Test-Path $DeepSeekConfigDir)) {
        New-Item -ItemType Directory -Path $DeepSeekConfigDir -Force | Out-Null
    }

    Set-EnvBoth "CLAUDE_CONFIG_DIR"  $DeepSeekConfigDir
    Set-EnvBoth "ANTHROPIC_API_KEY"  $DeepSeekApiKey
    Set-EnvBoth "ANTHROPIC_BASE_URL" $DeepSeekBaseUrl
    Set-EnvBoth "ANTHROPIC_MODEL"    $modelId

    # Map /model aliases to DeepSeek models
    # /model sonnet -> deepseek-v4-flash  (fast)
    # /model opus   -> deepseek-v4-pro    (powerful)
    Set-EnvBoth "ANTHROPIC_DEFAULT_SONNET_MODEL"             $DeepSeekModels["flash"]
    Set-EnvBoth "ANTHROPIC_DEFAULT_SONNET_MODEL_NAME"        "DeepSeek V4 Flash"
    Set-EnvBoth "ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION" "Fast and economical"
    Set-EnvBoth "ANTHROPIC_DEFAULT_OPUS_MODEL"               $DeepSeekModels["pro"]
    Set-EnvBoth "ANTHROPIC_DEFAULT_OPUS_MODEL_NAME"          "DeepSeek V4 Pro"
    Set-EnvBoth "ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION"   "Most capable"

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host " [OK] DeepSeek mode activated"           -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host " Starting model: $modelId"
    Write-Host ""
    Write-Host " Inside Claude Code /model you will see:" -ForegroundColor DarkGray
    Write-Host "   sonnet -> deepseek-v4-flash (fast)"    -ForegroundColor DarkGray
    Write-Host "   opus   -> deepseek-v4-pro   (powerful)" -ForegroundColor DarkGray
    Write-Host ""

    if (-not $NoLaunch) {
        Write-Host " Starting Claude Code with DeepSeek..." -ForegroundColor Cyan
        Write-Host ""
        & claude
    }
}

function Set-ClaudeMode {
    Remove-EnvBoth "CLAUDE_CONFIG_DIR"
    Remove-EnvBoth "ANTHROPIC_API_KEY"
    Remove-EnvBoth "ANTHROPIC_BASE_URL"
    Remove-EnvBoth "ANTHROPIC_MODEL"
    Remove-EnvBoth "ANTHROPIC_DEFAULT_SONNET_MODEL"
    Remove-EnvBoth "ANTHROPIC_DEFAULT_SONNET_MODEL_NAME"
    Remove-EnvBoth "ANTHROPIC_DEFAULT_SONNET_MODEL_DESCRIPTION"
    Remove-EnvBoth "ANTHROPIC_DEFAULT_OPUS_MODEL"
    Remove-EnvBoth "ANTHROPIC_DEFAULT_OPUS_MODEL_NAME"
    Remove-EnvBoth "ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION"

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host " [OK] Claude mode activated (OAuth)"     -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host " Variables removed. Claude Code will use"
    Write-Host " ~/.claude (your claude.ai account)."
    Write-Host ""

    if (-not $NoLaunch) {
        Write-Host " Starting Claude Code..." -ForegroundColor Cyan
        Write-Host ""
        & claude
    }
}

function Show-Status {
    $baseUrl = $env:ANTHROPIC_BASE_URL
    $model   = $env:ANTHROPIC_MODEL
    $apiKey  = $env:ANTHROPIC_API_KEY

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host " Current status (session)"               -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    if ([string]::IsNullOrEmpty($apiKey) -and [string]::IsNullOrEmpty($baseUrl)) {
        Write-Host " Mode: Claude (OAuth)" -ForegroundColor Green
    } elseif ($baseUrl -eq $DeepSeekBaseUrl) {
        Write-Host " Mode: DeepSeek"       -ForegroundColor Green
        Write-Host " Active model: $model"
        Write-Host " /model sonnet -> $($env:ANTHROPIC_DEFAULT_SONNET_MODEL)"
        Write-Host " /model opus   -> $($env:ANTHROPIC_DEFAULT_OPUS_MODEL)"
    } else {
        Write-Host " Mode: Custom"         -ForegroundColor Yellow
        Write-Host " Base URL: $baseUrl"
        Write-Host " Model:    $model"
    }
    Write-Host ""
}

function Show-Help {
    Write-Host ""
    Write-Host " Usage: .\claude-switch.ps1 [claude|deepseek|status] [-Model flash|pro] [-NoLaunch]" -ForegroundColor Cyan
    Write-Host ""
    Write-Host " Available DeepSeek models:"
    Write-Host "   flash -> deepseek-v4-flash  (fast, economical) [default]" -ForegroundColor DarkGray
    Write-Host "   pro   -> deepseek-v4-pro    (most capable)"               -ForegroundColor DarkGray
    Write-Host ""
    Write-Host " Examples:"
    Write-Host "   .\claude-switch.ps1 deepseek              " -NoNewline; Write-Host "(flash, launches claude)"        -ForegroundColor DarkGray
    Write-Host "   .\claude-switch.ps1 deepseek -Model pro   " -NoNewline; Write-Host "(pro, launches claude)"          -ForegroundColor DarkGray
    Write-Host "   .\claude-switch.ps1 deepseek -NoLaunch    " -NoNewline; Write-Host "(set variables only)"            -ForegroundColor DarkGray
    Write-Host "   .\claude-switch.ps1 claude                " -NoNewline; Write-Host "(switch back to OAuth)"          -ForegroundColor DarkGray
    Write-Host "   .\claude-switch.ps1 status                " -NoNewline; Write-Host "(show current mode)"             -ForegroundColor DarkGray
    Write-Host ""
    Write-Host " To switch back to Claude from inside Claude Code:" -ForegroundColor Yellow
    Write-Host "   1. Exit with /quit or Ctrl+C"                   -ForegroundColor Yellow
    Write-Host "   2. Run: .\claude-switch.ps1 claude"             -ForegroundColor Yellow
    Write-Host ""
}

switch ($Mode) {
    "deepseek" { Set-DeepSeekMode }
    "claude"   { Set-ClaudeMode }
    "status"   { Show-Status }
    default    { Show-Help }
}
