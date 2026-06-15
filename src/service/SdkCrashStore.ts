import { Observable } from '@/infrastructure/pubsub/Observable';

export interface SdkCrashInfo {
  id: string;
  /** 'hook' = a mod's hookFunction callback threw; 'patch' = the patched BC function itself threw */
  type: 'hook' | 'patch';
  fn: string;
  mod: string;
  errorMessage: string;
  stackFrames: string[];
  /** Display names of mods that were loaded at the time of the crash */
  loadedMods: string[];
  /** Mod names that have a hook registered on the failing function */
  hookedByMods?: string[];
  /** Mod names that have a source patch applied to the failing function */
  patchedByMods?: string[];
  /** Short, safe previews of the arguments the function was called with */
  args?: string[];
}

let counter = 0;

export class SdkCrashStore {
  private static crashes: SdkCrashInfo[] = [];
  private static readonly observable = new Observable<SdkCrashInfo[]>({
    emitOnSubscribe: true,
    getSnapshot: () => [...SdkCrashStore.crashes],
  });

  static push(info: Omit<SdkCrashInfo, 'id'>): void {
    SdkCrashStore.crashes.push({ ...info, id: `crash_${++counter}` });
    SdkCrashStore.observable.notify([...SdkCrashStore.crashes]);
  }

  static dismiss(id: string): void {
    SdkCrashStore.crashes = SdkCrashStore.crashes.filter(c => c.id !== id);
    SdkCrashStore.observable.notify([...SdkCrashStore.crashes]);
  }

  static subscribe(listener: (crashes: SdkCrashInfo[]) => void): () => void {
    return SdkCrashStore.observable.subscribe(listener);
  }
}
