# Clears the single-device login lock on every account.
#
# The app allows one active session per user (see AuthService.LoginAsync). That
# session row is only cleared by an explicit logout, so it strands whenever a
# session ends any other way — a closed tab, a hard refresh, or a backend
# restart — and blocks the next login with:
#
#   "The <role> account is already logged in on another device."
#
# Nothing clears it automatically until the 12-hour JWT window expires. Run this
# to free every seat immediately.
#
# Usage:
#   .\clear-sessions.ps1              # clear all accounts
#   .\clear-sessions.ps1 salesteam    # clear one account
#   .\clear-sessions.ps1 -List        # just show who's logged in

param(
    [string]$Username,
    [switch]$List
)

$ErrorActionPreference = 'Stop'

$appSettings = Join-Path $PSScriptRoot 'converge_server\appsettings.json'
if (-not (Test-Path $appSettings)) {
    Write-Error "Cannot find $appSettings"
    exit 1
}

# Pull the connection string out of appsettings rather than hard-coding
# credentials into this script.
$cfg = Get-Content $appSettings -Raw | ConvertFrom-Json
$parts = @{}
foreach ($segment in $cfg.ConnectionStrings.DefaultConnection -split ';') {
    $i = $segment.IndexOf('=')
    if ($i -gt 0) {
        $parts[$segment.Substring(0, $i).Trim().ToLower()] = $segment.Substring($i + 1).Trim()
    }
}

$dbHost = $parts['host']
$dbPort = if ($parts['port']) { $parts['port'] } else { '5432' }
$dbName = $parts['database']
$dbUser = if ($parts['username']) { $parts['username'] } else { $parts['user id'] }
$env:PGPASSWORD = $parts['password']

# psql is not on PATH in this environment; find it under Program Files.
$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) {
    $psql = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending |
            Select-Object -First 1 -ExpandProperty FullName
}
if (-not $psql) {
    Write-Error 'Could not find psql.exe. Install the PostgreSQL client tools or add psql to PATH.'
    exit 1
}

# The SQL goes through a temp file rather than psql -c on purpose: the table and
# column names are quoted PascalCase ("Users", "ActiveSessionId"), and PowerShell
# strips those embedded double quotes when building the argument list for a
# native exe — psql then sees bare `Users` and fails with
# `relation "users" does not exist`.
$sqlFile = Join-Path ([System.IO.Path]::GetTempPath()) "converge-clear-sessions-$PID.sql"

$statements = @()
if (-not $List) {
    $where = if ($Username) { "WHERE ""Username"" = '$Username'" } else { 'WHERE "ActiveSessionId" IS NOT NULL' }
    $statements += "UPDATE ""Users"" SET ""ActiveSessionId"" = NULL, ""ActiveSessionIssuedAt"" = NULL $where;"
}
$statements += 'SELECT "Username", "Role", COALESCE("ActiveSessionId"::text, ''(free)'') AS session FROM "Users" ORDER BY "Id";'

try {
    Set-Content -Path $sqlFile -Value ($statements -join "`n") -Encoding utf8
    & $psql -w -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $sqlFile
}
finally {
    Remove-Item $sqlFile -ErrorAction SilentlyContinue
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
