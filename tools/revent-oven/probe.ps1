# Read one Revent oven and save its raw answers. READ-ONLY.
#
# Run on a Windows PC that can reach the oven (the one running Revent Oven Manager):
#   powershell -ExecutionPolicy Bypass -File probe.ps1 -Ip 192.168.0.100
#
# It sends the oven exactly three requests, all of which only read:
#   status   (exchangeStrings "status")   -> raw_status.bin
#   settings (getSettings)                -> raw_settings.bin
#   logs     (getLogs)                    -> raw_logs.bin
# and puts them in a zip next to this script. Send that zip back; revent_oven.py
# decodes it (--raw-dir). Nothing is ever written to the oven.

param(
    [Parameter(Mandatory = $true)][string]$Ip,
    [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'
$envelope = '<?xml version="1.0" encoding="UTF-8"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:ns="urn:MCPtoPC"><SOAP-ENV:Body>{0}</SOAP-ENV:Body></SOAP-ENV:Envelope>'
$ops = [ordered]@{
    status   = '<ns:exchangeStrings><srcStrings xsi:type="SOAP-ENC:Array" SOAP-ENC:arrayType="xsd:string[1]"><item>status</item></srcStrings></ns:exchangeStrings>'
    settings = '<ns:getSettings></ns:getSettings>'
    logs     = '<ns:getLogs></ns:getLogs>'
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here ("oven_" + ($Ip -replace '[^0-9A-Za-z.]', '_') + "_" + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $out -Force | Out-Null
$url = "http://${Ip}:${Port}/MCPtoPCinterface.cgi"
$notes = @("oven $url", "at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")

foreach ($op in $ops.Keys) {
    $body = [System.Text.Encoding]::UTF8.GetBytes(($envelope -f $ops[$op]))
    $file = Join-Path $out "raw_$op.bin"
    try {
        $r = Invoke-WebRequest -Uri $url -Method Post -Body $body -UseBasicParsing -TimeoutSec 60 `
            -ContentType 'text/xml; charset=utf-8' -Headers @{ SOAPAction = '""' } -OutFile $file -PassThru
        $size = (Get-Item $file).Length
        $notes += "$op OK: HTTP $($r.StatusCode), $($r.Headers['Content-Type']), $size bytes"
        Write-Host "$op OK ($size bytes)"
    } catch {
        # A SOAP fault comes back as HTTP 500: keep its body, it says why.
        $resp = $_.Exception.Response
        if ($resp) {
            try {
                $fs = [System.IO.File]::Create($file)
                $resp.GetResponseStream().CopyTo($fs)
                $fs.Close()
            } catch { }
        }
        $notes += "$op FAILED: $($_.Exception.Message)"
        Write-Host "$op FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
}

$notes | Set-Content -Path (Join-Path $out 'notes.txt') -Encoding UTF8
Compress-Archive -Path (Join-Path $out '*') -DestinationPath "$out.zip" -Force
Write-Host "Saved: $out.zip"
