# Flora installer for Windows.
#
# Install or update Flora in one of your Obsidian vaults:
#   irm https://raw.githubusercontent.com/ParanoaiDev/obsidian-flora/main/install.ps1 | iex
#
# Pick the vault yourself:
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/ParanoaiDev/obsidian-flora/main/install.ps1))) -Vault "C:\path\to\vault"
#
# The script downloads main.js, manifest.json and styles.css from the latest GitHub release
# into <vault>\.obsidian\plugins\flora and turns the plugin on. Your Flora settings are kept.

param(
  [string]$Vault = "",
  [string]$Version = "latest"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$Repo = "ParanoaiDev/obsidian-flora"
$PluginId = "flora"
$Files = @("main.js", "manifest.json", "styles.css")
$Utf8 = New-Object System.Text.UTF8Encoding $false

function Say([string]$Text, [string]$Color = "Gray") { Write-Host "  $Text" -ForegroundColor $Color }
function Fail([string]$Text) { Write-Host ""; Say $Text "Red"; Write-Host ""; throw "Flora was not installed." }

Write-Host ""
Say "Flora installer" "Magenta"
Say "A new look for Obsidian, and a graph of your notes that feels alive." "DarkGray"
Write-Host ""

# ---------- 1. choose the vault ----------
if (-not $Vault) {
  $registry = Join-Path $env:APPDATA "obsidian\obsidian.json"
  $vaults = @()
  if (Test-Path -LiteralPath $registry) {
    $data = Get-Content -LiteralPath $registry -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($data.vaults) {
      foreach ($entry in $data.vaults.PSObject.Properties) {
        $v = $entry.Value
        if ($v.path -and (Test-Path -LiteralPath $v.path -PathType Container)) {
          $vaults += [pscustomobject]@{ Path = [string]$v.path; Ts = [double]$v.ts; Open = [bool]$v.open }
        }
      }
    }
    $vaults = @($vaults | Sort-Object -Property @{ Expression = "Open"; Descending = $true }, @{ Expression = "Ts"; Descending = $true })
  }

  if ($vaults.Count -eq 0) {
    Say "No Obsidian vaults found automatically."
    $Vault = Read-Host "  Path to your vault"
  } elseif ($vaults.Count -eq 1) {
    $Vault = $vaults[0].Path
  } else {
    Say "Your vaults:"
    for ($i = 0; $i -lt $vaults.Count; $i++) {
      $mark = ""
      if ($vaults[$i].Open) { $mark = "  (open now)" }
      Say ("  {0}. {1}{2}" -f ($i + 1), $vaults[$i].Path, $mark) "White"
    }
    Write-Host ""
    $answer = Read-Host "  Install into vault number [1]"
    if (-not $answer) { $answer = "1" }
    $n = 0
    if (-not [int]::TryParse($answer, [ref]$n) -or $n -lt 1 -or $n -gt $vaults.Count) { Fail "There is no vault number $answer." }
    $Vault = $vaults[$n - 1].Path
  }
}

$Vault = $Vault.Trim().Trim('"')
if (-not (Test-Path -LiteralPath $Vault -PathType Container)) { Fail "Folder not found: $Vault" }
$config = Join-Path $Vault ".obsidian"
if (-not (Test-Path -LiteralPath $config -PathType Container)) { Fail "This folder is not an Obsidian vault yet (no .obsidian folder): $Vault" }
Say "Vault: $Vault" "White"

# ---------- 2. download the release ----------
if ($Version -eq "latest") { $base = "https://github.com/$Repo/releases/latest/download" }
else { $base = "https://github.com/$Repo/releases/download/$Version" }

$temp = Join-Path ([IO.Path]::GetTempPath()) ("flora-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  foreach ($f in $Files) {
    Say "Downloading $f"
    try { Invoke-WebRequest -UseBasicParsing -Uri "$base/$f" -OutFile (Join-Path $temp $f) }
    catch { Fail "Could not download $f from GitHub. Check your internet connection and try again." }
  }
  $manifest = Get-Content -LiteralPath (Join-Path $temp "manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($manifest.id -ne $PluginId) { Fail "The downloaded files are not Flora." }

  # ---------- 3. install ----------
  $target = Join-Path $config "plugins\$PluginId"
  $previous = $null
  $oldManifest = Join-Path $target "manifest.json"
  if (Test-Path -LiteralPath $oldManifest) { $previous = (Get-Content -LiteralPath $oldManifest -Raw -Encoding UTF8 | ConvertFrom-Json).version }
  New-Item -ItemType Directory -Force -Path $target | Out-Null
  foreach ($f in $Files) { Copy-Item -LiteralPath (Join-Path $temp $f) -Destination (Join-Path $target $f) -Force }
} finally {
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------- 4. turn the plugin on ----------
$enabledFile = Join-Path $config "community-plugins.json"
$enabled = @()
if (Test-Path -LiteralPath $enabledFile) {
  $raw = Get-Content -LiteralPath $enabledFile -Raw -Encoding UTF8
  if ($raw -and $raw.Trim()) { $enabled = @($raw | ConvertFrom-Json) }
}
if ($enabled -notcontains $PluginId) {
  $enabled += $PluginId
  $items = $enabled | ForEach-Object { '  "' + ([string]$_ -replace '\\', '\\' -replace '"', '\"') + '"' }
  [IO.File]::WriteAllText($enabledFile, "[`n" + ($items -join ",`n") + "`n]", $Utf8)
}

# ---------- 5. done ----------
Write-Host ""
if ($previous -and $previous -ne $manifest.version) { Say ("Flora updated from {0} to {1}." -f $previous, $manifest.version) "Green" }
elseif ($previous) { Say ("Flora {0} reinstalled." -f $manifest.version) "Green" }
else { Say ("Flora {0} installed." -f $manifest.version) "Green" }

if (Get-Process -Name "Obsidian" -ErrorAction SilentlyContinue) {
  Say "Obsidian is open: restart it, or turn Flora off and on in Settings > Community plugins." "Yellow"
} else {
  Say "Open the vault in Obsidian and Flora starts right away."
}
Say "If community plugins are off, turn them on in Settings > Community plugins." "DarkGray"
Write-Host ""
