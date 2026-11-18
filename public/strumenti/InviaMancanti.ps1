<#
  InviaMancanti.ps1 - Kimatic
  Legge da SAM i materiali da prelevare (vista EXT_KIMATIC_MATERIALI_DA_PRELEVARE,
  la stessa del file MANCANTI_SARA.xlsx) e li manda al gestionale
  (modulo Mancanti montaggi). Non serve aprire Excel.

  Primo uso (una volta sola, da PowerShell):
     powershell -ExecutionPolicy Bypass -File InviaMancanti.ps1 -Configura
  Poi, per programmare l'invio all'accensione del PC e alle 13:00:
     powershell -ExecutionPolicy Bypass -File InviaMancanti.ps1 -Installa
  Prova a mano:
     powershell -ExecutionPolicy Bypass -File InviaMancanti.ps1
  Registro degli invii: %APPDATA%\KimaticMancanti\invio.log
#>
param([switch]$Configura, [switch]$Installa, [switch]$Disinstalla)

$ErrorActionPreference = 'Stop'
$Cartella = Join-Path $env:APPDATA 'KimaticMancanti'
$FileConf = Join-Path $Cartella 'config.xml'
$Log      = Join-Path $Cartella 'invio.log'
$Url      = 'https://gestionale-kimatic.vercel.app/api/mancanti'
$Query    = 'SELECT DISTINCT * FROM GSTPIVOT.dbo.EXT_KIMATIC_MATERIALI_DA_PRELEVARE'
$NomeTask = 'Kimatic - invio mancanti al gestionale'
New-Item -ItemType Directory -Force $Cartella | Out-Null

function Scrivi([string]$t) {
  $r = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $t
  Add-Content -Path $Log -Value $r -Encoding UTF8
  Write-Host $r
}

# ---------- configurazione (credenziali cifrate con l'utente Windows: le legge solo chi le ha salvate) ----------
if ($Configura) {
  $dsn = Read-Host 'Nome della connessione ODBC a SAM (premi Invio per GSTPIVOT)'
  if (-not $dsn) { $dsn = 'GSTPIVOT' }
  Write-Host 'Utente e password del database SAM. Meglio un utente di SOLA LETTURA (chiedilo a chi gestisce SAM).'
  Write-Host 'Se la connessione ODBC ha gia'' utente e password salvati, premi Annulla.'
  $cred = $null
  try { $cred = Get-Credential -Message 'Database SAM (sola lettura)' } catch { }
  $tok = Read-Host 'Chiave di invio del gestionale (MANCANTI_TOKEN)' -AsSecureString
  [pscustomobject]@{ Dsn = $dsn; Cred = $cred; Token = $tok } | Export-Clixml -Path $FileConf
  Scrivi 'Configurazione salvata.'
  exit 0
}

# ---------- programmazione: all'accesso a Windows (circa le 9) e alle 13:00 ----------
if ($Installa -or $Disinstalla) {
  Unregister-ScheduledTask -TaskName $NomeTask -Confirm:$false -ErrorAction SilentlyContinue
  if ($Disinstalla) { Scrivi 'Invio automatico tolto.'; exit 0 }
  $copia = Join-Path $Cartella 'InviaMancanti.ps1'
  if ($PSCommandPath -ne $copia) { Copy-Item -Path $PSCommandPath -Destination $copia -Force }
  $azione = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $copia)
  $accesso = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  $accesso.Delay = 'PT3M'   # qualche minuto dopo l'accesso, quando la rete e' pronta
  $tredici = New-ScheduledTaskTrigger -Daily -At '13:00'
  $imp = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
  Register-ScheduledTask -TaskName $NomeTask -Action $azione -Trigger @($accesso, $tredici) -Settings $imp -Description 'Manda al gestionale Kimatic i mancanti dei montaggi letti da SAM.' | Out-Null
  Scrivi "Invio automatico programmato: all'accesso a Windows e alle 13:00 (se il PC e' spento, appena si riaccende)."
  exit 0
}

# ---------- invio ----------
try {
  if (-not (Test-Path $FileConf)) { throw 'Configurazione mancante: lancia prima lo script con -Configura.' }
  $conf = Import-Clixml -Path $FileConf
  $cs = "DSN=$($conf.Dsn);"
  if ($conf.Cred) { $cs += "UID=$($conf.Cred.UserName);PWD=$($conf.Cred.GetNetworkCredential().Password);" }

  $righe = New-Object System.Collections.Generic.List[object]
  $conn = New-Object System.Data.Odbc.OdbcConnection($cs)
  try {
    $conn.Open()
  } catch {
    # connessione ODBC a 32 bit: si rilancia con PowerShell a 32 bit
    if ($_.Exception.Message -match 'IM002|IM014' -and [Environment]::Is64BitProcess) {
      $ps32 = Join-Path $env:SystemRoot 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
      & $ps32 -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath
      exit $LASTEXITCODE
    }
    throw
  }
  $cmd = $conn.CreateCommand(); $cmd.CommandText = $Query; $cmd.CommandTimeout = 300
  $rd = $cmd.ExecuteReader()
  $nomi = 0..($rd.FieldCount - 1) | ForEach-Object { $rd.GetName($_) }
  while ($rd.Read()) {
    $o = [ordered]@{}
    for ($i = 0; $i -lt $rd.FieldCount; $i++) {
      $v = $rd.GetValue($i)
      if ($v -is [DBNull]) { $v = $null }
      elseif ($v -is [datetime]) { $v = $v.ToString('yyyy-MM-dd') }
      elseif ($v -is [string]) { $v = $v.Trim() }
      $o[$nomi[$i]] = $v
    }
    $righe.Add([pscustomobject]$o)
  }
  $rd.Close(); $conn.Close()
  if ($righe.Count -eq 0) { throw 'SAM non ha restituito righe.' }

  $json = @{ formato = 'vista'; file = 'SAM ' + (Get-Date -Format 'dd/MM/yyyy HH:mm'); righe = $righe } | ConvertTo-Json -Depth 4 -Compress
  $ms = New-Object System.IO.MemoryStream
  $gz = New-Object System.IO.Compression.GZipStream($ms, [System.IO.Compression.CompressionMode]::Compress)
  $b = [System.Text.Encoding]::UTF8.GetBytes($json); $gz.Write($b, 0, $b.Length); $gz.Close()
  $corpo = $ms.ToArray()

  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $tok = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($conf.Token))
  $r = Invoke-RestMethod -Uri $Url -Method Post -Body $corpo -ContentType 'application/json' -Headers @{ Authorization = "Bearer $tok"; 'Content-Encoding' = 'gzip' } -TimeoutSec 120
  Scrivi ("Inviate {0} righe di SAM: {1} mancanti, {2} nuovi, {3} prelevati." -f $righe.Count, $r.righe, $r.nuovi, $r.chiusi)
  exit 0
} catch {
  $m = $_.Exception.Message
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $m += ' - ' + $_.ErrorDetails.Message }
  Scrivi ('ERRORE: ' + $m)
  exit 1
}
