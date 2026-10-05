# 단어 발음 파일 만들기 (Windows 내장 영어 음성 사용)
# 사용법: powershell -File tools/make_audio.ps1 -List <단어 목록 파일> -Out app/audio
# 목록 파일은 한 줄에 "파일이름<TAB>읽을 말". 이미 있는 파일은 건너뛴다.
param(
  [Parameter(Mandatory = $true)][string]$List,
  [Parameter(Mandatory = $true)][string]$Out
)
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'en-*' } | Select-Object -First 1
if (-not $voice) { Write-Error '영어 음성이 설치되어 있지 않습니다 (설정 > 시간 및 언어 > 음성)'; exit 1 }
$synth.SelectVoice($voice.VoiceInfo.Name)
$synth.Rate = -1
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
New-Item -ItemType Directory -Force -Path $Out | Out-Null
$made = 0
foreach ($line in [System.IO.File]::ReadAllLines($List, [System.Text.Encoding]::UTF8)) {
  if (-not $line.Trim()) { continue }
  $name, $text = $line -split "`t", 2
  $path = Join-Path $Out "$name.wav"
  if (Test-Path $path) { continue }
  $synth.SetOutputToWaveFile($path, $format)
  $synth.Speak($text)
  $made++
}
$synth.SetOutputToNull()
Write-Output "voice=$($voice.VoiceInfo.Name) made=$made"
