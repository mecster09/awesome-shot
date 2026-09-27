import type { GameSessionStore, SetupData } from "./types";

const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Browser storage request failed."));
  });

type StoredSetup = { key: "setup"; value: SetupData };

export class IndexedDbGameSessionStore implements GameSessionStore {
  private databasePromise: Promise<IDBDatabase> | undefined;

  constructor(private readonly databaseName = "natball-insights") {}

  async read(): Promise<SetupData | undefined> {
    const database = await this.database();
    const transaction = database.transaction("records", "readonly");
    const record = await requestResult(transaction.objectStore("records").get("setup"));
    return record === undefined ? undefined : structuredClone((record as StoredSetup).value);
  }

  async write(data: SetupData): Promise<void> {
    const database = await this.database();
    const transaction = database.transaction("records", "readwrite");
    transaction.objectStore("records").put({ key: "setup", value: structuredClone(data) } satisfies StoredSetup);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Browser storage write failed."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Browser storage write was aborted."));
    });
  }

  private database(): Promise<IDBDatabase> {
    this.databasePromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("records", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Browser storage is unavailable."));
    });
    return this.databasePromise;
  }
}
