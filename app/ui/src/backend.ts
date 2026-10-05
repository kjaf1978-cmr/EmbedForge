// Adapter between the UI and the Rust back-end (Tauri commands). In a plain browser — used
// for UI tests — a preview back-end answers instead, and says so in its results.

import type { UiSettings } from './core/settings';

export interface HostFinding {
  check: string;
  requirement: string;
  required: string;
  found: string;
  severity: 'shortfall' | 'advice' | 'unsupported';
  consequence: string;
}

export interface DiagSection {
  id: string;
  title: string;
  status: 'pass' | 'warn' | 'fail' | 'not_yet_available';
  details: string[];
  remediation: string[];
}

/** SS-08 start-up integrity check, as reported by the back-end. */
export interface StartupStatus {
  phase: 'running' | 'background' | 'done' | 'untrusted' | 'error' | 'preview';
  components: number;
  checked_full: number;
  checked_quick: number;
  found: string[];
  restored: string[];
  unrecoverable: string[];
  needs_elevated_repair: boolean;
  message: string;
  foreground_ms: number;
}

export interface Backend {
  kind: 'tauri' | 'preview';
  appVersion(): Promise<string>;
  hostCheck(display: [number, number]): Promise<{ profile: 'A' | 'B'; findings: HostFinding[] }>;
  diagnose(full: boolean): Promise<{ overall: string; sections: DiagSection[] }>;
  loadSettings(): Promise<unknown>;
  saveSettings(s: UiSettings): Promise<void>;
  startupStatus(): Promise<StartupStatus>;
  repair(): Promise<StartupStatus>;
}

type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function tauriInvoke(): Invoke | null {
  const w = window as unknown as { __TAURI_INTERNALS__?: { invoke: Invoke } };
  return w.__TAURI_INTERNALS__ ? w.__TAURI_INTERNALS__.invoke : null;
}

class TauriBackend implements Backend {
  kind = 'tauri' as const;
  constructor(private invoke: Invoke) {}
  appVersion() { return this.invoke<string>('app_version'); }
  hostCheck(display: [number, number]) { return this.invoke<{ profile: 'A' | 'B'; findings: HostFinding[] }>('host_check', { width: display[0], height: display[1] }); }
  diagnose(full: boolean) { return this.invoke<{ overall: string; sections: DiagSection[] }>('diagnose', { full }); }
  loadSettings() { return this.invoke<unknown>('settings_load'); }
  async saveSettings(s: UiSettings) { await this.invoke('settings_save', { settings: s }); }
  startupStatus() { return this.invoke<StartupStatus>('startup_status'); }
  repair() { return this.invoke<StartupStatus>('repair'); }
}

class PreviewBackend implements Backend {
  kind = 'preview' as const;
  private settings: unknown = null;
  async appVersion() { return '0.1.0 (browser preview — no back-end)'; }
  async hostCheck(display: [number, number]) {
    const findings: HostFinding[] = [];
    if (display[0] < 1920 || display[1] < 1080)
      findings.push({ check: 'display', requirement: 'HOST-02(e)', required: '≥ 1920×1080', found: `${display[0]}×${display[1]}`,
        severity: 'advice', consequence: 'Compact layout: split views off, side panes as overlays (HOST-02(e)).' });
    findings.push({ check: 'host facts', requirement: 'HOST-04', required: 'desktop app', found: 'browser preview',
      severity: 'advice', consequence: 'CPU, RAM, disk and OS are checked only in the desktop app.' });
    return { profile: 'A' as const, findings };
  }
  async diagnose(_full: boolean) {
    return { overall: 'not_yet_available', sections: [
      { id: 'a', title: 'Bundled component integrity (SS-08)', status: 'not_yet_available' as const, details: ['browser preview: run the desktop app'], remediation: [] },
      { id: 'b', title: 'Toolchain health (test compilation)', status: 'not_yet_available' as const, details: ['delivered in Increment 2'], remediation: [] },
      { id: 'c', title: 'USB/serial and driver status', status: 'not_yet_available' as const, details: ['delivered in Increment 2'], remediation: [] },
      { id: 'd', title: 'LLM runtime health', status: 'not_yet_available' as const, details: ['delivered in Increment 3'], remediation: [] },
      { id: 'e', title: 'Emulator health', status: 'not_yet_available' as const, details: ['delivered in Increment 5'], remediation: [] },
      { id: 'f', title: 'Storage headroom', status: 'not_yet_available' as const, details: ['browser preview: run the desktop app'], remediation: [] },
    ] };
  }
  async loadSettings() { return this.settings; }
  async saveSettings(s: UiSettings) { this.settings = s; }
  /** `?preview-startup=repaired|unrecoverable` lets UI tests show the start-up banner. */
  async startupStatus(): Promise<StartupStatus> {
    const mode = new URLSearchParams(window.location.search).get('preview-startup');
    const base: StartupStatus = { phase: 'preview', components: 0, checked_full: 0, checked_quick: 0, found: [], restored: [], unrecoverable: [],
      needs_elevated_repair: false, message: 'browser preview: the integrity check runs in the desktop app', foreground_ms: 0 };
    if (mode === 'repaired') return { ...base, phase: 'done', components: 3, found: ['embedforge-app/bin/embedforge: HashMismatch'], restored: ['embedforge-app/bin/embedforge'], message: '' };
    if (mode === 'unrecoverable') return { ...base, phase: 'done', components: 3, found: ['llm-default/model.gguf: Missing'], unrecoverable: ['llm-default/model.gguf'], needs_elevated_repair: true, message: '' };
    return base;
  }
  async repair() { return this.startupStatus(); }
}

export function createBackend(): Backend {
  const inv = tauriInvoke();
  return inv ? new TauriBackend(inv) : new PreviewBackend();
}
