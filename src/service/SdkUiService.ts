import { ModalStore } from '@/ui/store/ModalStore';
import { SdkStateService } from '@/service/SdkStateService';
import { SdkCrashStore } from '@/service/SdkCrashStore';

export function showSdkAlert(message: string): void {
  ModalStore.open({
    prompt: message,
    callback: () => {},
    buttons: { submit: 'OK' },
  });
}

export function notifySdkHijacked(mods: Array<{ name: string; fullName: string }>): void {
  SdkStateService.notifyHijacked({ registeredMods: mods });
}

export function reportSdkCrash(
  type: 'hook' | 'patch',
  fn: string,
  mod: string,
  err: unknown,
): void {
  const error = err instanceof Error ? err : new Error(String(err));
  const frames = (error.stack ?? '')
    .split('\n')
    .filter(l => l.trim().startsWith('at '))
    .slice(0, 8);
  SdkCrashStore.push({ type, fn, mod, errorMessage: error.message, stackFrames: frames });
}