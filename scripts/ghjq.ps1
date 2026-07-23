param(
  [Parameter(Mandatory, Position=0)]
  [string]$PrNumber
)

<#
.SYNOPSIS
  Quick PR status summary — green/red per check, no shell quoting issues.
.DESCRIPTION
  PowerShell 5.1 misparses `|` inside `gh --jq` filters (treats it as its own
  pipe operator). `gh pr checks` avoids this entirely because it doesn't need
  a jq filter.

  Usage: .\scripts\ghjq.ps1 69
  Equivalent to: gh pr checks 69
#>

gh pr checks $PrNumber
