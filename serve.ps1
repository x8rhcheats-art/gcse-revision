# serve.ps1 — zero-dependency local server for the revision app.
# Serves the site/ folder on http://localhost:8123 and opens the browser.
# If the port is already in use (server already running), just opens the browser.
# Close this window to stop the server.

$ErrorActionPreference = 'Stop'
$port = 8123
$root = Join-Path $PSScriptRoot 'site'
$url = "http://localhost:$port/"

$mime = @{
  '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'
  '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8'
  '.json'='application/json; charset=utf-8'; '.svg'='image/svg+xml'
  '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg'; '.gif'='image/gif'
  '.woff'='font/woff'; '.woff2'='font/woff2'; '.md'='text/plain; charset=utf-8'
  '.ico'='image/x-icon'; '.pdf'='application/pdf'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
try {
  $listener.Start()
} catch {
  Write-Host "Port $port already in use - assuming the server is already running."
  Start-Process "$($url)app.html"
  exit 0
}

Start-Process "$($url)app.html"
$host.UI.RawUI.WindowTitle = "Revision app - keep this window open"
Write-Host ""
Write-Host "  Revision app running at $($url)app.html"
Write-Host "  Keep this window open while using the app. Close it to stop."
Write-Host ""

while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'app.html' }

    # progress mirror: the app POSTs {subject, state} here after every change,
    # so a copy always lives on disk (survives cleared browser data; committable).
    # One file per subject; a legacy body with no subject field is physics.
    if ($req.HttpMethod -eq 'POST' -and $rel -eq 'save-progress') {
      $reader = New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)
      $body = $reader.ReadToEnd(); $reader.Close()
      if ($body.Length -gt 2 -and $body.Length -lt 10485760 -and $body.StartsWith('{')) {
        $subject = 'physics'
        $m = [regex]::Match($body.Substring(0, [Math]::Min(200, $body.Length)), '"subject"\s*:\s*"([a-z][a-z0-9-]{0,30})"')
        if ($m.Success) { $subject = $m.Groups[1].Value }
        $pdir = Join-Path $root 'progress'
        New-Item -ItemType Directory -Force $pdir | Out-Null
        [IO.File]::WriteAllText((Join-Path $pdir "$subject-progress-backup.json"), $body)
        $res.StatusCode = 204
      } else { $res.StatusCode = 400 }
      $res.OutputStream.Close()
      continue
    }
    $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $file.StartsWith([IO.Path]::GetFullPath($root))) { throw 'traversal' }
    if (Test-Path $file -PathType Container) { $file = Join-Path $file 'index.html' }
    if ($rel -eq 'favicon.ico' -and -not (Test-Path $file -PathType Leaf)) {
      $res.StatusCode = 204
      $bytes = [byte[]]@()
    } elseif (-not (Test-Path $file -PathType Leaf)) {
      $res.StatusCode = 404
      $bytes = [Text.Encoding]::UTF8.GetBytes("404 - not found: /$rel")
    } else {
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.KeepAlive = $false   # an aborted large download must not wedge the loop
      $bytes = [IO.File]::ReadAllBytes($file)
    }
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    try { $res.StatusCode = 500 } catch {}
  } finally {
    try { $res.OutputStream.Close() } catch {}
  }
}
