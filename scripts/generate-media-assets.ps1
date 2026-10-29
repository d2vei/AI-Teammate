param([ValidateSet('media-pilot-v1','voice-diagnostic-v1')][string]$Purpose = 'media-pilot-v1')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
Add-Type -AssemblyName System.Drawing
$fixtureRoot = Join-Path (Get-Location).Path ".local/$Purpose"
if (-not (Test-Path -LiteralPath $fixtureRoot -PathType Container)) { throw 'Run the offline preparation wrapper first' }
function New-FixtureCard([string]$Name, [string[]]$Lines) {
    $cardPath = Join-Path $fixtureRoot $Name
    if (Test-Path -LiteralPath $cardPath) { throw 'Existing fixture preserved' }
    $bitmap = New-Object System.Drawing.Bitmap(960, 540)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $font = New-Object System.Drawing.Font('Arial', 27)
    try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        $graphics.DrawRectangle([System.Drawing.Pens]::DarkBlue, 18, 18, 923, 503)
        $lineY = 45
        foreach ($line in $Lines) {
            $graphics.DrawString($line, $font, [System.Drawing.Brushes]::Black, 40, $lineY)
            $lineY += 75
        }
        $bitmap.Save($cardPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $font.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
}
if ($Purpose -eq 'media-pilot-v1') {
New-FixtureCard 'together.png' @('SYNTHETIC QUEUE - Party Q7', 'Ada - Room Cedar', 'Bo - Room Cedar', 'Cy - Room Cedar', '3 players - one room')
New-FixtureCard 'split.png' @('SYNTHETIC ERROR - QUEUE_SPLIT', 'Party Q8 - Count 5', 'Ada - Room Cedar', 'Bo - Room Maple')
New-FixtureCard 'step-1.png' @('SYNTHETIC QUEUE 17', 'WAITING', 'No room assigned')
New-FixtureCard 'step-2.png' @('SYNTHETIC QUEUE 17', 'ASSIGNED', 'ROOM CEDAR')
New-FixtureCard 'review.png' @('SYNTHETIC RELEASE REVIEW', 'NO APPROVAL RECORDED', 'Investigation only')
}
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $englishVoice = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo } | Where-Object { $_.Culture.Name -like 'en-*' } | Select-Object -First 1
    if (-not $englishVoice) { throw 'An installed English synthesis voice is required for these synthetic fixtures' }
    $synth.SelectVoice($englishVoice.Name)
    $synth.Rate = 0
    $speechItems = if ($Purpose -eq 'voice-diagnostic-v1') { @(@{ Name='probe.wav'; Text='The next review is on Tuesday. It has not been approved.' }) } else { @(
        @{ Name='party.wav'; Text='Please keep all party members in one room. The next check is a three person queue.' },
        @{ Name='review.wav'; Text='We have not approved a fix. Save only an investigation brief after confirmation.' }
    ) }
    foreach ($item in $speechItems) {
        $wavePath = Join-Path $fixtureRoot $item.Name
        if (Test-Path -LiteralPath $wavePath) { throw 'Existing fixture preserved' }
        $synth.SetOutputToWaveFile($wavePath)
        $synth.Speak($item.Text)
        $synth.SetOutputToNull()
    }
    Write-Output 'PASS: generated only synthetic cards and local text-to-speech recordings; no microphone, model call or external service'
} finally { $synth.Dispose() }
