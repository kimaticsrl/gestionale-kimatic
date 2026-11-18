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
  -Installa mette anche sul Desktop l'icona "Aggiorna mancanti" per forzare
  un invio quando serve.
  Registro degli invii: %APPDATA%\KimaticMancanti\invio.log
#>
param([switch]$Configura, [switch]$Installa, [switch]$Disinstalla, [switch]$Esplora, [switch]$Manuale)

$ErrorActionPreference = 'Stop'
$Cartella = Join-Path $env:APPDATA 'KimaticMancanti'
$FileConf = Join-Path $Cartella 'config.xml'
$Log      = Join-Path $Cartella 'invio.log'
$Url      = 'https://gestionale-kimatic.vercel.app/api/mancanti'
$Query    = 'SELECT DISTINCT * FROM GSTPIVOT.dbo.EXT_KIMATIC_MATERIALI_DA_PRELEVARE'
# celle di lavorazione, ultima lavorazione chiusa e conto deposito (la vista del file Mancanti_2025)
$QueryCelle = 'SELECT DISTINCT COMMESSA, [CODICE MACCHINA], [DESCRIZIONE MACCHINA], [CODICE OP], [DESCRIZIONE OP], [CODICE ARTICOLO], [DESCRIZIONE ARTICOLO], [QTA RES DA PRELEVARE], [GIACENZA MAG PRINC E VERTICALI], FORNITORE, [CELLA LAV DISPONIBILE], CELLA_LAV_CHIUSA, [ULTIMA LAV CHIUSA], [IN C/DEP PRESSO] FROM dbo.KI_ANALISI_COMMESSE_MANCANTI'
# ordini di produzione (con le fasi) dei codici mancanti e dei gruppi: produzione interna e figli dei 21.5...
$QueryOp = 'SELECT DISTINCT f.CodArtOP, f.NumOP, f.AnnoOP, f.StatoOP, f.NumComm, f.AnnoComm, f.QtaOrdine, f.QtaProd, f.SeqFaf, f.DesLav, f.DesCella, f.StatoFase, f.DataScaFas FROM sA1.CS_OP_FASI_LAVORAZIONI f WHERE f.AnnoOP >= YEAR(GETDATE()) - 1 AND f.CodArtOP IN (SELECT Componente FROM GSTPIVOT.dbo.EXT_KIMATIC_MATERIALI_DA_PRELEVARE UNION SELECT Articolo_OP FROM GSTPIVOT.dbo.EXT_KIMATIC_MATERIALI_DA_PRELEVARE)'
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
  # la chiave: 48 caratteri tra 0-9 e a-f; si chiede finche' non e' giusta (Ctrl+V a volte incolla un carattere di controllo)
  do {
    $t = (Read-Host 'Chiave di invio del gestionale (MANCANTI_TOKEN) - incollala con il tasto destro del mouse').Trim()
    if ($t -notmatch '^[0-9a-f]{48}$') { Write-Host ('Chiave non valida ({0} caratteri letti): riprova.' -f $t.Length) -ForegroundColor Yellow }
  } while ($t -notmatch '^[0-9a-f]{48}$')
  $tok = ConvertTo-SecureString $t -AsPlainText -Force
  $utente = ''; $pw = $null
  if ($cred -and $cred.UserName) { $utente = $cred.UserName.TrimStart('\'); $pw = $cred.Password }
  [pscustomobject]@{ Dsn = $dsn; Utente = $utente; Pw = $pw; Token = $tok } | Export-Clixml -Path $FileConf
  Scrivi 'Configurazione salvata.'
  exit 0
}

# ---------- programmazione: all'accesso a Windows (circa le 9) e alle 13:00 ----------
if ($Installa -or $Disinstalla) {
  Unregister-ScheduledTask -TaskName $NomeTask -Confirm:$false -ErrorAction SilentlyContinue
  $icona = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Aggiorna mancanti.lnk'
  if ($Disinstalla) { Remove-Item $icona -ErrorAction SilentlyContinue; Scrivi 'Invio automatico tolto.'; exit 0 }
  $copia = Join-Path $Cartella 'InviaMancanti.ps1'
  if ($PSCommandPath -ne $copia) { Copy-Item -Path $PSCommandPath -Destination $copia -Force }
  $azione = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $copia)
  $accesso = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
  $accesso.Delay = 'PT3M'   # qualche minuto dopo l'accesso, quando la rete e' pronta
  $tredici = New-ScheduledTaskTrigger -Daily -At '13:00'
  $imp = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
  Register-ScheduledTask -TaskName $NomeTask -Action $azione -Trigger @($accesso, $tredici) -Settings $imp -Description 'Manda al gestionale Kimatic i mancanti dei montaggi letti da SAM.' | Out-Null
  # icona sul Desktop per l'aggiornamento a mano
  $ws = New-Object -ComObject WScript.Shell
  $lnk = $ws.CreateShortcut($icona)
  $lnk.TargetPath = 'powershell.exe'
  $lnk.Arguments = ('-NoProfile -ExecutionPolicy Bypass -File "{0}" -Manuale' -f $copia)
  $lnk.WorkingDirectory = $Cartella
  $lnk.IconLocation = 'shell32.dll,238'
  $lnk.Description = 'Manda subito i mancanti di SAM al gestionale'
  $lnk.Save()
  Scrivi "Invio automatico programmato: all'accesso a Windows e alle 13:00 (se il PC e' spento, appena si riaccende)."
  exit 0
}

# ---------- invio ----------
try {
  if (-not (Test-Path $FileConf)) { throw 'Configurazione mancante: lancia prima lo script con -Configura.' }
  $conf = Import-Clixml -Path $FileConf
  $cs = "DSN=$($conf.Dsn);"
  function Testo($sec) { if (-not $sec) { return '' }; if ($sec -is [string]) { return $sec }; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)) }
  $utente = $conf.Utente; $pw = $conf.Pw
  if (-not $utente -and $conf.Cred -and $conf.Cred.UserName) { $utente = $conf.Cred.UserName; $pw = $conf.Cred.Password }  # configurazione vecchia
  if ($utente) { $cs += "UID=$utente;PWD=$(Testo $pw);" }

  $conn = New-Object System.Data.Odbc.OdbcConnection($cs)
  try {
    $conn.Open()
  } catch {
    # connessione ODBC a 32 bit: si rilancia con PowerShell a 32 bit
    if ($_.Exception.Message -match 'IM002|IM014' -and [Environment]::Is64BitProcess) {
      $ps32 = Join-Path $env:SystemRoot 'SysWOW64\WindowsPowerShell\v1.0\powershell.exe'
      $extra = @(); if ($Esplora) { $extra += '-Esplora' }; if ($Manuale) { $extra += '-Manuale' }
      & $ps32 -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath @extra
      exit $LASTEXITCODE
    }
    throw
  }
  if ($Esplora) {
    # elenco delle viste/tabelle di SAM con colonne su celle, lavorazioni, conto deposito, fasi
    $q = "SELECT TABLE_SCHEMA + '.' + TABLE_NAME AS T, COLUMN_NAME AS C FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME LIKE '%CELL%' OR COLUMN_NAME LIKE '%DEP%' OR COLUMN_NAME LIKE '%LAV%' OR COLUMN_NAME LIKE '%FASE%' OR TABLE_NAME LIKE '%MANCANT%' OR TABLE_NAME LIKE '%PRELEV%' OR TABLE_NAME LIKE '%FASI%' ORDER BY 1, 2"
    $c2 = $conn.CreateCommand(); $c2.CommandText = $q; $c2.CommandTimeout = 120
    $r2 = $c2.ExecuteReader(); $tab = [ordered]@{}
    while ($r2.Read()) { $t = [string]$r2.GetValue(0); if (-not $tab.Contains($t)) { $tab[$t] = New-Object System.Collections.Generic.List[string] }; $tab[$t].Add([string]$r2.GetValue(1)) }
    $r2.Close(); $conn.Close()
    $out = Join-Path ([Environment]::GetFolderPath('Desktop')) 'viste_SAM.txt'
    $righeOut = foreach ($k in $tab.Keys) { '{0}: {1}' -f $k, ($tab[$k] -join ', ') }
    $righeOut | Set-Content -Path $out -Encoding UTF8
    $righeOut | ForEach-Object { Write-Host $_ }
    Write-Host ''
    Write-Host "Elenco salvato anche in $out"
    exit 0
  }
  function Leggi([string]$sql) {
    $L = New-Object System.Collections.Generic.List[object]
    $cmd = $conn.CreateCommand(); $cmd.CommandText = $sql; $cmd.CommandTimeout = 300
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
      $L.Add([pscustomobject]$o)
    }
    $rd.Close()
    return ,$L
  }
  $righe = Leggi $Query
  $celle = $null; $erroreCelle = ''
  try { $celle = Leggi $QueryCelle } catch { $erroreCelle = $_.Exception.Message }
  $opSam = $null; $erroreOp = ''
  try { $opSam = Leggi $QueryOp } catch { $erroreOp = $_.Exception.Message }
  $conn.Close()
  if ($righe.Count -eq 0) { throw 'SAM non ha restituito righe.' }

  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $tok = Testo $conf.Token
  function Manda([string]$formato, $L) {
    $json = @{ formato = $formato; file = 'SAM ' + (Get-Date -Format 'dd/MM/yyyy HH:mm'); righe = $L } | ConvertTo-Json -Depth 4 -Compress
    $ms = New-Object System.IO.MemoryStream
    $gz = New-Object System.IO.Compression.GZipStream($ms, [System.IO.Compression.CompressionMode]::Compress)
    $b = [System.Text.Encoding]::UTF8.GetBytes($json); $gz.Write($b, 0, $b.Length); $gz.Close()
    Invoke-RestMethod -Uri $Url -Method Post -Body $ms.ToArray() -ContentType 'application/json' -Headers @{ Authorization = "Bearer $tok"; 'Content-Encoding' = 'gzip' } -TimeoutSec 120
  }
  $r = Manda 'vista' $righe
  Scrivi ("Inviate {0} righe di SAM: {1} mancanti, {2} nuovi, {3} prelevati." -f $righe.Count, $r.righe, $r.nuovi, $r.chiusi)
  # poi celle e conto deposito: se non riesce, i mancanti restano comunque aggiornati
  if ($erroreCelle) { Scrivi ('Celle di lavorazione non lette: ' + $erroreCelle) }
  elseif ($celle -and $celle.Count -gt 0) {
    try { $r2 = Manda 'celle' $celle; Scrivi ("Celle di lavorazione e conto deposito aggiornati: {0} righe." -f $r2.righe) }
    catch { $m2 = $_.Exception.Message; if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $m2 += ' - ' + $_.ErrorDetails.Message }; Scrivi ('Celle di lavorazione non inviate: ' + $m2) }
  }
  if ($erroreOp) { Scrivi ('OP di produzione non lette: ' + $erroreOp) }
  elseif ($opSam -and $opSam.Count -gt 0) {
    try { $r3 = Manda 'op' $opSam; Scrivi ("OP di produzione aggiornate: {0}." -f $r3.righe) }
    catch { $m3 = $_.Exception.Message; if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $m3 += ' - ' + $_.ErrorDetails.Message }; Scrivi ('OP di produzione non inviate: ' + $m3) }
  }
  if ($Manuale) { Write-Host ''; Write-Host 'Fatto: ricarica la pagina Mancanti montaggi nel gestionale.' -ForegroundColor Green; Start-Sleep -Seconds 6 }
  exit 0
} catch {
  $m = $_.Exception.Message
  if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $m += ' - ' + $_.ErrorDetails.Message }
  Scrivi ('ERRORE: ' + $m)
  if ($Manuale) { Read-Host 'Premi Invio per chiudere' | Out-Null }
  exit 1
}
