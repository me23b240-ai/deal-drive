function Write-File {
  param([string]$Path, [string]$Content)
  $full = Join-Path (Get-Location).Path $Path
  $dir = Split-Path $full
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($full, $Content, (New-Object System.Text.UTF8Encoding $false))
  Write-Host "wrote $Path"
}
function Write-FileIfMissing {
  param([string]$Path, [string]$Content)
  if (Test-Path (Join-Path (Get-Location).Path $Path)) { Write-Host "kept $Path"; return }
  Write-File $Path $Content
}
function New-Bundle {
  param([string]$Out, [string[]]$Patterns)
  $root = (Get-Location).Path
  $items = foreach ($p in $Patterns) { Get-ChildItem -Path $p -File -Recurse -ErrorAction SilentlyContinue }
  $items = $items | Where-Object { $_.FullName -notmatch '\\(node_modules|\.next|\.git)\\' } | Sort-Object FullName -Unique
  $sb = New-Object System.Text.StringBuilder
  foreach ($f in $items) {
    $rel = $f.FullName.Substring($root.Length + 1)
    [void]$sb.AppendLine("===== FILE: $rel =====")
    [void]$sb.AppendLine([System.IO.File]::ReadAllText($f.FullName))
  }
  [System.IO.File]::WriteAllText((Join-Path $root $Out), $sb.ToString(), (New-Object System.Text.UTF8Encoding $false))
  Write-Host ("{0}: {1} files, {2} KB" -f $Out, $items.Count, [math]::Round($sb.Length / 1KB))
}
