# Stop and remove the Prelegal container (its database goes with it).
if (docker ps -aq --filter "name=^prelegal$") {
    docker rm -f prelegal | Out-Null
    Write-Host "Prelegal stopped."
} else {
    Write-Host "Prelegal is not running."
}
