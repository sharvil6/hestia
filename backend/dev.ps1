Set-Location $PSScriptRoot
& "$PSScriptRoot\backend\.venv\Scripts\uvicorn.exe" main:app --reload --host 0.0.0.0
