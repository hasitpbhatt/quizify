param(
  [Parameter(Mandatory, Position=0)]
  [string]$Subcommand,

  [Parameter(Mandatory, Position=1)]
  [string]$JsonSelector,

  [Parameter(Mandatory, Position=2)]
  [string]$JqFilter
)

<#
.SYNOPSIS
  gh wrapper that passes jq filter safely — no PowerShell pipe conflicts.
.DESCRIPTION
  `gh --jq` filters often contain `|` (jq pipe), which PowerShell interprets
  as its own pipeline operator, mangling the argument. This helper writes the
  filter to a temp file, reads it back as a variable (safe from parsing), and
  passes it to gh.

  Usage: .\scripts\ghjq.ps1 "pr view 69" "statusCheckRollup" '.statusCheckRollup[] | .name + " " + .conclusion'
#>

$tmp = [System.IO.Path]::GetTempFileName()
try {
  $JqFilter | Out-File -FilePath $tmp -Encoding ascii -NoNewline
  $filter = Get-Content -Path $tmp -Raw -Encoding ascii
  gh --jq $filter $Subcommand --json $JsonSelector
} finally {
  if (Test-Path $tmp) { Remove-Item $tmp -Force }
}
