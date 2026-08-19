import { ModalStore } from '@/ui/store/ModalStore';
import { SdkStateService } from '@/service/SdkStateService';
import { SdkCrashStore } from '@/service/SdkCrashStore';
import { ModLoaderService } from '@/service/ModLoaderService';
import { ModService } from '@/service/ModService';
import {t} from '@/i18n/i18n';

export function showSdkAlert(message: string): void {
  ModalStore.open({
    prompt: message,
    callback: () => {},
    buttons: { submit: t('button-ok') },
  });
}

export function notifySdkHijacked(mods: Array<{ name: string; fullName: string }>): void {
  SdkStateService.notifyHijacked({ registeredMods: mods });
}

interface PatchSummaryEntry {
  name: string;
  hookedByMods: string[];
  patchedByMods: string[];
}

/**
 * Annotate stack frames whose function is hooked/patched by mods with the mods
 * responsible, so the call chain shows which mods are involved at each level.
 */
function annotateStackFrames(frames: string[], summary: PatchSummaryEntry[]): string[] {
  if (summary.length === 0) return frames;

  // Index by the short (last dotted segment) function name — that is what shows
  // up in V8 stack frames even for `Namespace.fn`-style patch targets.
  const byShortName = new Map<string, PatchSummaryEntry>();
  for (const entry of summary) {
    const short = entry.name.split('.').pop() ?? entry.name;
    if (!byShortName.has(short)) byShortName.set(short, entry);
  }

  // For recursive call chains a function can appear many times. Spell out the
  // full hook/patch list only the first time; later repeats get a compact
  // [H]/[P] flag so the trace stays readable.
  const seen = new Set<string>();

  return frames.map(frame => {
    // Frame looks like: "at FnName (url:line:col)" / "at Object.FnName (...)".
    const match = frame.match(/^\s*at\s+(?:async\s+)?([^\s(]+)/);
    if (!match) return frame;
    const shortName = match[1].split('.').pop() ?? match[1];
    const entry = byShortName.get(shortName);
    if (!entry) return frame;

    const hooked = entry.hookedByMods.length > 0;
    const patched = entry.patchedByMods.length > 0;
    if (!hooked && !patched) return frame;

    if (seen.has(shortName)) {
      const flags = `${hooked ? '[H]' : ''}${patched ? '[P]' : ''}`;
      return `${frame}   ⟵ ${flags}`;
    }
    seen.add(shortName);

    const parts: string[] = [];
    if (hooked) parts.push(`hooked by ${entry.hookedByMods.join(', ')}`);
    if (patched) parts.push(`patched by ${entry.patchedByMods.join(', ')}`);
    return `${frame}   ⟵ ${parts.join('; ')}`;
  });
}

export function reportSdkCrash(
  type: 'hook' | 'patch',
  fn: string,
  mod: string,
  err: unknown,
  extra?: { hookedByMods?: string[]; patchedByMods?: string[]; args?: string[]; patchSummary?: PatchSummaryEntry[] },
): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const frames = annotateStackFrames(
    (error.stack ?? '')
      .split('\n')
      .filter(l => l.trim().startsWith('at '))
      .slice(0, 20),
    extra?.patchSummary ?? [],
  );

  const loadedKeys = ModLoaderService.getLoadedMods();
  const allMods = ModService.getAllModsWithDetails();
  const loadedMods = loadedKeys.map(key => {
    const found = allMods.find(m => `${m.modId}_${m.registryId}` === key);
    return found ? `${found.name} (${found.selectedVersion ?? key})` : key;
  });

  SdkCrashStore.push({
    type,
    fn,
    mod,
    errorMessage: error.message,
    stackFrames: frames,
    loadedMods,
    hookedByMods: extra?.hookedByMods,
    patchedByMods: extra?.patchedByMods,
    args: extra?.args,
  });
}
