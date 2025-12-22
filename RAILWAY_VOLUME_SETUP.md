# Railway Volume Setup für Persistent Storage

## Problem
Cron Jobs und Logs werden in Dateien gespeichert. Bei jedem Deploy auf Railway werden diese Dateien zurückgesetzt, da das Dateisystem ephemeral (temporär) ist.

## Lösung: Railway Volume

### Schritt 1: Volume erstellen
1. Gehe zu deinem Railway Projekt Dashboard
2. Klicke auf dein Service (MySQLCloner)
3. Gehe zum Tab "Variables" oder "Settings"
4. Klicke auf "Add Volume" oder "+ New Volume"
5. Konfiguriere:
   - **Mount Path**: `/app/server/data`
   - **Name**: `mysqlcloner-data` (optional)
   - **Size**: 1GB (sollte ausreichen)

### Schritt 2: Environment Variable setzen (optional)
Falls du einen anderen Mount-Path verwendest, setze:
- **Key**: `DATA_DIR`
- **Value**: `/app/server/data` (oder dein Mount-Path)

### Schritt 3: Redeploy
Nach dem Hinzufügen des Volumes wird der Service automatisch neu deployed.

## Was wird persistiert?

Mit dem Volume werden folgende Daten permanent gespeichert:
- `/app/server/data/scheduled-jobs.json` - Alle Cron Jobs
- `/app/server/data/logs/cron-logs.json` - Alle Cron Job Logs

## Ohne Volume

Wenn kein Volume gemountet ist, werden Jobs und Logs trotzdem funktionieren, aber:
- ⚠️ Bei jedem Deploy gehen alle Cron Jobs verloren
- ⚠️ Bei jedem Deploy gehen alle Logs verloren
- ✅ Lokale Entwicklung funktioniert normal (Daten in `server/data/`)

## Verifikation

Nach dem Setup kannst du prüfen ob es funktioniert:
1. Erstelle einen Cron Job im Frontend
2. Führe ein Railway Deploy aus
3. Öffne das Frontend erneut
4. Der Cron Job sollte noch vorhanden sein ✅

## Alternative: Datenbank-basierte Speicherung

Für eine noch robustere Lösung könnten Jobs und Logs in der MySQL-Datenbank gespeichert werden. Dies würde ein Railway Volume überflüssig machen, erfordert aber mehr Code-Änderungen.
