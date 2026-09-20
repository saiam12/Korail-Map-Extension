param(
  [string]$OutputPath = ".\dist\korail-map-panel.zip"
)

$ErrorActionPreference = "Stop"

$relativeFiles = @(
  "manifest.json",
  "src/background/background.js",
  "src/background/background-config.js",
  "src/content/content.js",
  "src/page/injected.js",
  "src/page/booking-map.js",
  "src/page/home-panel.js",
  "src/page/map-panel.js",
  "src/page/station-popup.js",
  "src/page/support-widget.js",
  "src/data/station-data.js",
  "src/data/station-translations.js",
  "src/page/map-config.js",
  "assets/vendor/leaflet/leaflet.js",
  "assets/vendor/leaflet/leaflet.css",
  "assets/styles/panel.css",
  "assets/icons/icon-16.png",
  "assets/icons/icon-32.png",
  "assets/icons/icon-48.png",
  "assets/icons/icon-128.png",
  "assets/vendor/leaflet/leaflet-images/layers.png",
  "assets/vendor/leaflet/leaflet-images/layers-2x.png",
  "assets/vendor/leaflet/leaflet-images/marker-icon.png",
  "assets/vendor/leaflet/leaflet-images/marker-icon-2x.png",
  "assets/vendor/leaflet/leaflet-images/marker-shadow.png"
)

$sourceFiles = $relativeFiles | ForEach-Object { Join-Path $PSScriptRoot $_ }
$missingFiles = $sourceFiles | Where-Object { -not (Test-Path -LiteralPath $_ -PathType Leaf) }
if ($missingFiles) {
  throw "Missing package file(s): $($missingFiles -join ', ')"
}

$destination = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
  [System.IO.Path]::GetFullPath($OutputPath)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot $OutputPath))
}
$destinationDirectory = Split-Path -Parent $destination
New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null

$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$stagingDirectory = Join-Path $tempRoot "korail-map-package-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $stagingDirectory | Out-Null

try {
  for ($index = 0; $index -lt $relativeFiles.Count; $index++) {
    $target = Join-Path $stagingDirectory $relativeFiles[$index]
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath $sourceFiles[$index] -Destination $target
  }

  Compress-Archive -Path (Join-Path $stagingDirectory "*") -DestinationPath $destination -Force

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($destination)
  try {
    $entryNames = @($archive.Entries | ForEach-Object { $_.FullName.Replace("\", "/") })
    if ($entryNames -notcontains "manifest.json") {
      throw "Generated archive does not contain manifest.json at its root."
    }
    $missingEntries = $relativeFiles | Where-Object {
      $entryNames -notcontains $_.Replace("\", "/")
    }
    if ($missingEntries) {
      throw "Generated archive is missing: $($missingEntries -join ', ')"
    }
  } finally {
    $archive.Dispose()
  }
} finally {
  if (Test-Path -LiteralPath $stagingDirectory) {
    $resolvedStaging = [System.IO.Path]::GetFullPath($stagingDirectory)
    if (-not $resolvedStaging.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove an unexpected staging path: $resolvedStaging"
    }
    Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
  }
}

Write-Output "Created $destination"
