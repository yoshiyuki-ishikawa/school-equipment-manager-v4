/**
 * 学校備品スマート棚卸しシステム v4.0 - Database Module (db.js)
 * 
 * ラッパーライブラリなしの素の IndexedDB API で動作し、以下の機能を提供します。
 * - データベース接続および初期化 (スキーマ定義)
 * - 備品データのバルクインサート
 * - 備品データの全件取得
 * - データ一件の更新 (棚卸しステータス、メモ)
 */

class SchoolEquipmentDB {
  constructor(dbName = 'SchoolEquipmentDB', version = 2) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  /**
   * データベースに接続し、初期化します。
   * @returns {Promise<IDBDatabase>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        return resolve(this.db);
      }

      const request = indexedDB.open(this.dbName, this.version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // 備品ストアの作成
        // 主キーは一意に自動生成される連番 ID または UUID などの一意な値（id）とします
        if (db.objectStoreNames.contains('equipment')) {
          db.deleteObjectStore('equipment');
        }
        const store = db.createObjectStore('equipment', { keyPath: 'id' });
        // 検索用に各種インデックスを構築
        store.createIndex('eqCode', 'eqCode', { unique: false });
        store.createIndex('normalizedName', 'normalizedName', { unique: false });
        store.createIndex('normalizedLocation', 'normalizedLocation', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        reject(new Error(`IndexedDB connection error: ${event.target.error}`));
      };
    });
  }

  /**
   * 備品データを一括でインサートします（バルクインサート）
   * @param {Array<Object>} items 備品データの配列
   * @returns {Promise<number>} インサートに成功した件数
   */
  bulkInsert(items) {
    return new Promise(async (resolve, reject) => {
      try {
        const db = await this.connect();
        const transaction = db.transaction(['equipment'], 'readwrite');
        const store = transaction.objectStore('equipment');

        let count = 0;
        
        transaction.oncomplete = () => {
          resolve(count);
        };

        transaction.onerror = (event) => {
          reject(new Error(`Bulk insert transaction error: ${event.target.error}`));
        };

        for (const item of items) {
          // idがなければ生成
          const itemId = item.id || 'eq_' + Math.random().toString(36).substr(2, 9);

          // インサート（既存の場合は上書き put）
          const request = store.put({
            id: itemId,
            eqCode: item.eqCode || '',
            name: item.name || '',
            normalizedName: item.normalizedName || '',
            location: item.location || '',
            normalizedLocation: item.normalizedLocation || '',
            category: item.category || '',
            status: item.status || '未着手', // 未着手, 済, 要確認 など
            memo: item.memo || '',
            updatedAt: item.updatedAt || new Date().toISOString()
          });

          request.onsuccess = () => {
            count++;
          };
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 全ての備品データを取得します。
   * @returns {Promise<Array<Object>>}
   */
  getAll() {
    return new Promise(async (resolve, reject) => {
      try {
        const db = await this.connect();
        const transaction = db.transaction(['equipment'], 'readonly');
        const store = transaction.objectStore('equipment');
        const request = store.getAll();

        request.onsuccess = (event) => {
          resolve(event.target.result || []);
        };

        request.onerror = (event) => {
          reject(new Error(`Failed to get all items: ${event.target.error}`));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 特定の備品データのステータスとメモを更新します。
   * @param {string} id 一意なID
   * @param {Object} updates 更新内容 ({ status, memo })
   * @returns {Promise<Object>} 更新されたレコード
   */
  updateItem(id, updates) {
    return new Promise(async (resolve, reject) => {
      try {
        const db = await this.connect();
        const transaction = db.transaction(['equipment'], 'readwrite');
        const store = transaction.objectStore('equipment');

        // まず既存レコードを取得
        const getRequest = store.get(id);

        getRequest.onsuccess = (event) => {
          const data = event.target.result;
          if (!data) {
            return reject(new Error(`Item with id "${id}" not found.`));
          }

          // 更新
          if (updates.status !== undefined) data.status = updates.status;
          if (updates.memo !== undefined) data.memo = updates.memo;
          data.updatedAt = new Date().toISOString();

          const putRequest = store.put(data);

          putRequest.onsuccess = () => {
            resolve(data);
          };

          putRequest.onerror = (event) => {
            reject(new Error(`Failed to update item: ${event.target.error}`));
          };
        };

        getRequest.onerror = (event) => {
          reject(new Error(`Failed to fetch item for update: ${event.target.error}`));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * データベースの全データを削除して初期化します。
   * @returns {Promise<void>}
   */
  clearAll() {
    return new Promise(async (resolve, reject) => {
      try {
        const db = await this.connect();
        const transaction = db.transaction(['equipment'], 'readwrite');
        const store = transaction.objectStore('equipment');
        const request = store.clear();

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = (event) => {
          reject(new Error(`Failed to clear database: ${event.target.error}`));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 既存のデータを取得し、マスタ差分更新（既存のステータスやメモを維持、新規追加、存在しないものを削除）を行います。
   * @param {Array<Object>} newItems 新しいマスタ備品データの配列
   * @returns {Promise<{added: number, updated: number, deleted: number}>} 各処理件数
   */
  diffUpdate(newItems) {
    return new Promise(async (resolve, reject) => {
      try {
        const db = await this.connect();
        const transaction = db.transaction(['equipment'], 'readwrite');
        const store = transaction.objectStore('equipment');

        // 全既存データを取得
        const getRequest = store.getAll();
        getRequest.onsuccess = (event) => {
          const existingItems = event.target.result || [];
          
          // 管理番号 (eqCode) をキーにしたマップを作成
          const existingMap = new Map();
          existingItems.forEach(item => {
            if (item.eqCode) {
              existingMap.set(item.eqCode, item);
            }
          });

          const newEqCodes = new Set(newItems.map(item => item.eqCode).filter(Boolean));

          let added = 0;
          let updated = 0;
          let deleted = 0;

          // 1. 差分判定と追加・更新
          newItems.forEach(newItem => {
            if (!newItem.eqCode) return;
            const existing = existingMap.get(newItem.eqCode);
            if (existing) {
              // 既存あり：ステータスとメモは既存のものを維持
              // その他のマスタ情報 (name, location, categoryなど) は新しい値に更新
              const updatedItem = {
                ...existing, // 既存のID、ステータス、メモなどを保持
                name: newItem.name || existing.name,
                normalizedName: newItem.normalizedName || existing.normalizedName,
                location: newItem.location || existing.location,
                normalizedLocation: newItem.normalizedLocation || existing.normalizedLocation,
                category: newItem.category || existing.category,
                updatedAt: new Date().toISOString()
              };
              store.put(updatedItem);
              updated++;
            } else {
              // 新規追加
              const itemId = newItem.id || 'eq_' + Math.random().toString(36).substr(2, 9);
              const addedItem = {
                ...newItem,
                id: itemId,
                status: newItem.status || '未着手',
                memo: newItem.memo || '',
                updatedAt: new Date().toISOString()
              };
              store.put(addedItem);
              added++;
            }
          });

          // 2. 削除 (新マスタに存在しない既存データを削除)
          existingItems.forEach(existing => {
            if (existing.eqCode && !newEqCodes.has(existing.eqCode)) {
              store.delete(existing.id);
              deleted++;
            }
          });

          transaction.oncomplete = () => {
            resolve({ added, updated, deleted });
          };

          transaction.onerror = (event) => {
            reject(new Error(`Diff update transaction error: ${event.target.error}`));
          };
        };

        getRequest.onerror = (event) => {
          reject(new Error(`Failed to fetch existing items for diff update: ${event.target.error}`));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 作業データを合流（同一の管理番号を照合し、ステータスとメモのみ上書き）します。
   * @param {Array<Object>} mergeItems マージする備品データの配列
   * @returns {Promise<number>} 更新された件数
   */
  mergeUpdate(mergeItems) {
    return new Promise(async (resolve, reject) => {
      try {
        const db = await this.connect();
        const transaction = db.transaction(['equipment'], 'readwrite');
        const store = transaction.objectStore('equipment');

        // 全既存データを取得
        const getRequest = store.getAll();
        getRequest.onsuccess = (event) => {
          const existingItems = event.target.result || [];
          
          // 管理番号 (eqCode) をキーにしたマップを作成
          const existingMap = new Map();
          existingItems.forEach(item => {
            if (item.eqCode) {
              existingMap.set(item.eqCode, item);
            }
          });

          let updated = 0;

          // インポートデータから管理番号を照合し、ステータスとメモのみを上書き更新
          mergeItems.forEach(mergeItem => {
            if (!mergeItem.eqCode) return;
            const existing = existingMap.get(mergeItem.eqCode);
            if (existing) {
              // ステータスとメモを更新
              existing.status = mergeItem.status || existing.status;
              existing.memo = mergeItem.memo !== undefined ? mergeItem.memo : existing.memo;
              existing.updatedAt = new Date().toISOString();
              store.put(existing);
              updated++;
            }
          });

          transaction.oncomplete = () => {
            resolve(updated);
          };

          transaction.onerror = (event) => {
            reject(new Error(`Merge update transaction error: ${event.target.error}`));
          };
        };

        getRequest.onerror = (event) => {
          reject(new Error(`Failed to fetch existing items for merge update: ${event.target.error}`));
        };
      } catch (error) {
        reject(error);
      }
    });
  }
}

// ブラウザ環境とNode/ESM環境の両方で動作するようにエクスポートを設定
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SchoolEquipmentDB;
} else {
  window.SchoolEquipmentDB = SchoolEquipmentDB;
}
