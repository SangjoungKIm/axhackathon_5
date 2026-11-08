/* 현재 브라우저 전용 저장소. 이미지는 외부 전송하지 않는다. */
(function () {
  let promise;
  function open() {
    if (!promise) promise = new Promise((resolve, reject) => {
      const r = indexedDB.open('ax-solar-materials-v1', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('workspace');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => { promise = null; reject(r.error); };
    });
    return promise;
  }
  async function read() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const r = db.transaction('workspace', 'readonly').objectStore('workspace').get('current');
      r.onsuccess = () => resolve(r.result || null); r.onerror = () => reject(r.error);
    });
  }
  async function write(ops) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('workspace', 'readwrite');
      t.objectStore('workspace').put({ version: 1, ops }, 'current');
      t.oncomplete = () => resolve(); t.onabort = t.onerror = () => reject(t.error || new Error('자료 저장 실패'));
    });
  }
  window.AXStore = { read, write };
})();
