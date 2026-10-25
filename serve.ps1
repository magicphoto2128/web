# Minimal static file server for the Magic Photo PWA.
# Serves the web/ folder using only built-in .NET (no Python/Node needed).
# Usage:  powershell -ExecutionPolicy Bypass -File serve.ps1
#         powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 5600   (pick another port)
# Stop with Ctrl+C.

param([int]$Port = 5500)

$ErrorActionPreference = 'Stop'
$root = Join-Path $PSScriptRoot 'web'
$prefix = "http://localhost:$Port/"

if (-not (Test-Path $root)) {
    Write-Error "web/ folder not found at $root"
    exit 1
}

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.mjs'  = 'text/javascript; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.svg'  = 'image/svg+xml'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.jpeg' = 'image/jpeg'
    '.gif'  = 'image/gif'
    '.ico'  = 'image/x-icon'
    '.mp4'  = 'video/mp4'
    '.webm' = 'video/webm'
    '.txt'  = 'text/plain; charset=utf-8'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host ""
Write-Host "Magic Photo PWA served at $prefix" -ForegroundColor Green
Write-Host "Open that URL in your browser. Press Ctrl+C to stop." -ForegroundColor Green
Write-Host "Serving folder: $root"
Write-Host ""

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response
        try {
            $relative = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($relative)) { $relative = 'index.html' }
            $path = Join-Path $root $relative

            # SPA fallback: unknown non-file routes serve index.html
            if (-not (Test-Path $path -PathType Leaf)) {
                $path = Join-Path $root 'index.html'
            }

            $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
            $ctype = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }

            $bytes = [System.IO.File]::ReadAllBytes($path)
            $res.ContentType = $ctype
            $res.ContentLength64 = $bytes.Length
            $res.StatusCode = 200
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host ("{0}  {1}  ({2})" -f $req.HttpMethod, $req.Url.AbsolutePath, $ctype)
        } catch {
            $res.StatusCode = 500
            $msg = [System.Text.Encoding]::UTF8.GetBytes("500: $($_.Exception.Message)")
            $res.OutputStream.Write($msg, 0, $msg.Length)
            Write-Host ("ERROR {0}: {1}" -f $req.Url.AbsolutePath, $_.Exception.Message) -ForegroundColor Red
        } finally {
            $res.OutputStream.Close()
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
