import { Observable } from '@/infrastructure/pubsub/Observable';

export interface SdkCrashInfo {
  id: string;
  /** 'hook' = a mod's hookFunction callback threw; 'patch' = the patched BC function itself threw */
  type: 'hook' | 'patch';
  fn: string;
  mod: string;
  errorMessage: string;
  stackFrames: string[];
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
