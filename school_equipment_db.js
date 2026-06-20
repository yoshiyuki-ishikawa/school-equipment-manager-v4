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
}

// ブラウザ環境とNode/ESM環境の両方で動作するようにエクスポートを設定
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SchoolEquipmentDB;
} else {
  window.SchoolEquipmentDB = SchoolEquipmentDB;
}
