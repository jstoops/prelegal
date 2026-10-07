# Build the Prelegal image and (re)start it at http://localhost:8000.
# Each start is a new container, so the database starts empty.
# Checks $LASTEXITCODE rather than using $ErrorActionPreference = "Stop", which
# in Windows PowerShell 5.1 turns docker's progress output on stderr into errors.

$Root = Split-Path -Parent $PSScriptRoot
$Name = "prelegal"

docker build -t $Name $Root
if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

docker rm -f $Name 2>$null | Out-Null

# Pass secrets such as OPENROUTER_API_KEY from the repo's .env, if present.
$EnvFile = Join-Path $Root ".env"
$RunArgs = @("run", "-d", "--name", $Name, "-p", "8000:8000")
if (Test-Path $EnvFile) { $RunArgs += @("--env-file", $EnvFile) }
docker @RunArgs $Name | Out-Null
if ($LASTEXITCODE -ne 0) { throw "docker run failed" }

Write-Host -NoNewline "Waiting for Prelegal to start"
for ($i = 0; $i -lt 30; $i++) {
    if ((docker inspect -f "{{.State.Health.Status}}" $Name) -eq "healthy") {
        Write-Host ""
        Write-Host "Prelegal is running at http://localhost:8000"
        exit 0
    }
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 1
}
Write-Host ""
Write-Error "Prelegal did not become healthy. Logs:`n$(docker logs $Name 2>&1 | Out-String)"
exit 1
