. (Join-Path $PSScriptRoot 'common.ps1')
Read-DotEnv
$baseUrl = if ($env:LLAMA_SERVER_URL) { $env:LLAMA_SERVER_URL.TrimEnd('/') } else { 'http://127.0.0.1:8080/v1' }
$body = @{
    model = 'aura-local'
    messages = @(@{ role = 'user'; content = 'Reply with exactly: Aura smoke test passed' })
    max_tokens = 32
    stream = $false
} | ConvertTo-Json -Depth 8
$response = Invoke-RestMethod -Uri "$baseUrl/chat/completions" -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 120
if (-not $response.choices[0].message.content) { throw 'Text smoke test failed.' }

$toolBody = @{
    model = 'aura-local'
    messages = @(@{ role = 'user'; content = 'Check the current weather in Taipei' })
    tools = @(@{ type = 'function'; function = @{ name = 'get_weather'; description = 'Get current weather'; parameters = @{ type = 'object'; properties = @{ location = @{ type = 'string' } }; required = @('location'); additionalProperties = $false } } })
    tool_choice = 'auto'
    max_tokens = 256
    stream = $false
} | ConvertTo-Json -Depth 12
$toolResponse = Invoke-RestMethod -Uri "$baseUrl/chat/completions" -Method Post -ContentType 'application/json' -Body $toolBody -TimeoutSec 120
if (-not $toolResponse.choices[0].message.tool_calls) { throw 'Tool Calling smoke test failed; mark this model as chat-only.' }
Write-Host 'Text and Tool Calling smoke tests passed.'
