Set-Location $PSScriptRoot

# Grab the first 192.168.x.x address (local LAN IP)
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' } | Select-Object -First 1).IPAddress
if (-not $ip) {
    Write-Warning "Could not detect a 192.168.x.x LAN IP — EXPO_PUBLIC_API_URL not updated"
} else {
    $envLine = "EXPO_PUBLIC_API_URL=http://${ip}:8000"
    $envFile = "$PSScriptRoot\.env"
    $content = Get-Content $envFile -Raw
    $updated = $content -replace 'EXPO_PUBLIC_API_URL=http://[^\r\n]+', $envLine
    Set-Content $envFile $updated -Encoding utf8 -NoNewline
    Write-Host "EXPO_PUBLIC_API_URL set to http://${ip}:8000"
}

npx expo start --clear
