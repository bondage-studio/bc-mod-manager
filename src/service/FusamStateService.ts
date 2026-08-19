import {Observable} from '@/infrastructure/pubsub/Observable';

export class FusamStateService {
  private static _conflict = false;
  private static readonly observable = new Observable<boolean>({
    emitOnSubscribe: true,
    getSnapshot: () => FusamStateService._conflict,
  });

  static markConflict(): void {
    if (FusamStateService._conflict) {
      return;
    }
    FusamStateService._conflict = true;
    FusamStateService.observable.notify(true);
  }

  static isConflict(): boolean {
    return FusamStateService._conflict;
  }

  static subscribe(listener: (conflict: boolean) => void): () => void {
    return FusamStateService.observable.subscribe(listener);
  }
}