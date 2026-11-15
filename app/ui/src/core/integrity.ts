// Status-bar wording for the SS-08 start-up check. Kept separate from the view so the
// wording is unit-tested: a state is never shown as better than it is.
import type { IntegrityStatus } from '../backend';

export type Tone = 'ok' | 'busy' | 'warn' | 'bad';

export function integrityLabel(s: IntegrityStatus): { text: string; tone: Tone } {
  switch (s.state) {
    case 'checking': return { text: 'Integrity: checking…', tone: 'busy' };
    case 'background': return { text: `Integrity: start-up files OK, verifying ${s.pending} more…`, tone: 'busy' };
    case 'ok': return { text: 'Integrity: verified', tone: 'ok' };
    case 'repaired': return { text: `Integrity: ${s.restored.length} file(s) restored offline`, tone: 'warn' };
    case 'failed': return { text: s.unrecoverable.length ? `Integrity: ${s.unrecoverable.length} file(s) not restored — open Self-diagnosis` : 'Integrity: check failed — open Self-diagnosis', tone: 'bad' };
    case 'untrusted': return { text: 'Integrity: not verified (development build)', tone: 'warn' };
    case 'preview': return { text: 'Integrity: desktop app only', tone: 'warn' };
  }
}
