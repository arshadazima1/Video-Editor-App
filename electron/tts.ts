import { execFile } from 'child_process';
import * as path from 'path';
import type { GeneratedMedia, TtsRequest, TtsVoice } from '../shared/types';
import { mediaUrlFor } from './mediaRegistry';
import { probeMedia } from './probe';

/**
 * Free, offline text-to-speech using the voices built into Windows
 * (System.Speech / SAPI via PowerShell). No API key, no internet, no cost.
 */

function runPowerShell(script: string, timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject(new Error(stderr || error.message));
        else resolve(stdout);
      },
    );
  });
}

function assertWindows(): void {
  if (process.platform !== 'win32') {
    throw new Error('The free offline voiceover uses Windows built-in voices and only works on Windows.');
  }
}

export async function listTtsVoices(): Promise<TtsVoice[]> {
  assertWindows();
  const out = await runPowerShell(
    'Add-Type -AssemblyName System.Speech; ' +
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ' +
      '$s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name } | ConvertTo-Json; ' +
      '$s.Dispose()',
  );
  const parsed = JSON.parse(out.trim() || '[]');
  const names: string[] = Array.isArray(parsed) ? parsed : [parsed];
  return names.filter(Boolean).map((name) => ({ name }));
}

export async function generateTts(request: TtsRequest, outDir: string): Promise<GeneratedMedia> {
  assertWindows();
  const text = request.text.trim();
  if (!text) throw new Error('Voiceover script is empty.');

  const fileName = `voiceover-${Date.now()}.wav`;
  const filePath = path.join(outDir, fileName);
  // Text goes through base64 so quotes/newlines can't break out of the script.
  const textB64 = Buffer.from(text, 'utf8').toString('base64');
  const voice = (request.voiceName ?? '').replace(/[^\w\s().-]/g, '');
  const rate = Math.max(-10, Math.min(10, Math.round(request.rate ?? 0)));

  const script =
    'Add-Type -AssemblyName System.Speech; ' +
    `$text = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${textB64}')); ` +
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ' +
    (voice ? `try { $s.SelectVoice('${voice}') } catch {}; ` : '') +
    `$s.Rate = ${rate}; ` +
    `$s.SetOutputToWaveFile('${filePath.replace(/'/g, "''")}'); ` +
    '$s.Speak($text); ' +
    '$s.Dispose()';

  await runPowerShell(script);
  const probe = await probeMedia(filePath);
  return {
    filePath,
    src: mediaUrlFor(filePath),
    fileName,
    type: 'audio',
    duration: probe.duration,
    hasAudio: true,
  };
}
