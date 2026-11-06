// Price candles keep the original news and review snapshots. IndexedDB avoids
// the small localStorage quota while keeping all data in this browser.
let databasePromise;
function database() {
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('이 브라우저에서 기록 저장소를 사용할 수 없어요.')); return; }
    const request = indexedDB.open('inu-campus-exchange', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); databasePromise = undefined; };
      resolve(db);
    };
    request.onerror = () => { databasePromise = undefined; reject(request.error); };
    request.onblocked = () => { databasePromise = undefined; reject(new Error('다른 데모 탭을 닫고 새로고침하면 기록 저장을 다시 사용할 수 있어요.')); };
  });
  return databasePromise;
}

export async function loadDemo(key) {
  try {
    const db = await database();
    const value = await new Promise((resolve, reject) => {
      const transaction = db.transaction('snapshots', 'readonly');
      const request = transaction.objectStore('snapshots').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (value) return value;
  } catch { /* Older browser or blocked storage: read the previous local record. */ }
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

export async function saveDemo(key, value) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('snapshots', 'readwrite');
    transaction.objectStore('snapshots').put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('시연 기록을 저장하지 못했어요.'));
  });
}
