// Self-update mechanism via GitHub.
//
// On install/update, C:\kreisel\.version is written with the commit SHA of
// what was deployed. checkForUpdate() compares it against the latest commit
// on main; applyUpdate() launches update_wiola.cmd and quits the app.

import { app } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import axios from 'axios';
import { readEnv } from './settings';

const VERSION_FILE = 'C:\\kreisel\\.version';
const UPDATE_PS1   = 'C:\\kreisel\\update_wiola.ps1';
const REPO_API_URL =
  'https://api.github.com/repos/tryk016/wiola-helper/commits/main';

export interface UpdateCheckResult {
  hasUpdate: boolean;
  localSha?: string;
  remoteSha?: string;
  remoteMessage?: string;
  remoteDate?: string;
  error?: string;
}

export function getLocalSha(): string | undefined {
  try {
    if (!fs.existsSync(VERSION_FILE)) return undefined;
    const sha = fs.readFileSync(VERSION_FILE, 'utf8').trim();
    return sha || undefined;
  } catch {
    return undefined;
  }
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const localSha = getLocalSha();
  // The repo is private — without GITHUB_TOKEN the API answers 404.
  const token = readEnv().GITHUB_TOKEN;
  try {
    const r = await axios.get(REPO_API_URL, {
      headers: {
        'User-Agent': 'WiolaHelper',
        Accept: 'application/vnd.github+json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      timeout: 10000,
    });
    const remoteSha: string = r.data?.sha;
    const remoteMessage: string = r.data?.commit?.message || '';
    const remoteDate: string = r.data?.commit?.author?.date || '';
    if (!remoteSha) {
      return { hasUpdate: false, localSha, error: 'Brak SHA w odpowiedzi GitHub' };
    }
    return {
      hasUpdate: !localSha || localSha !== remoteSha,
      localSha,
      remoteSha,
      remoteMessage: remoteMessage.split('\n')[0], // first line of commit message
      remoteDate,
    };
  } catch (e) {
    const err = e as Error & { response?: { status?: number } };
    const status = err.response?.status;
    return {
      hasUpdate: false,
      localSha,
      error: status === 401 || status === 403 || status === 404
        ? `GitHub ${status} — brak dostępu do repozytorium. ${token ? 'Token GitHub wygasł albo nie ma dostępu' : 'Brak tokena GitHub'} — wpisz token w sekcji „Token GitHub” powyżej.`
        : status
          ? `GitHub API ${status}`
          : err.message,
    };
  }
}

export function applyUpdate(): { launched: boolean; error?: string } {
  if (!fs.existsSync(UPDATE_PS1)) {
    return { launched: false, error: `Brak skryptu: ${UPDATE_PS1}` };
  }
  try {
    // Write a one-shot VBS wrapper to TEMP that launches PowerShell hidden.
    // wscript.exe is a GUI-subsystem host (no console window).
    // PowerShell is invoked with -WindowStyle Hidden + window state 0 → no UI.
    // The script survives app.quit() because we spawn it detached.
    const vbsPath = path.join(os.tmpdir(), `wiola_update_${Date.now()}.vbs`);
    const vbs = [
      `Set objShell = WScript.CreateObject("WScript.Shell")`,
      `objShell.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""${UPDATE_PS1}""", 0, False`,
    ].join('\r\n');
    fs.writeFileSync(vbsPath, vbs, 'utf8');

    spawn('wscript.exe', [vbsPath], {
      detached: true,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
  } catch (e) {
    return { launched: false, error: (e as Error).message };
  }
  // Give the VBS a moment to fully launch PowerShell, then quit Electron.
  // PowerShell will re-launch Wiola Helper at the end of the update script.
  setTimeout(() => app.quit(), 1500);
  return { launched: true };
}
