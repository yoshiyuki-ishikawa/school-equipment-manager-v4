/**
 * 学校備品スマート棚卸しシステム v4.0 - Data Generator & Importer (data_generator.js)
 * 
 * 検証・初期ロード用に、3万件程度の備品レコードを瞬時に生成し、
 * IndexedDBへインサートするユーティリティを提供します。
 */

// Node環境およびブラウザ環境に対応するためのインポート処理
let DBClass;
let SearchClass;

if (typeof require !== 'undefined') {
  DBClass = require('./school_equipment_db');
  SearchClass = require('./school_equipment_search');
} else {
  DBClass = window.SchoolEquipmentDB;
  SearchClass = window.SchoolEquipmentSearch;
}

class SchoolEquipmentGenerator {
  /**
   * ダミーの備品データを指定件数生成します。
   * @param {number} count 生成するレコード件数 (デフォルト30,000件)
   * @returns {Array<Object>} 生成された備品オブジェクトの配列
   */
  static generateData(count = 30000) {
    const categories = ['文房具', '体育器具', '理科実験器具', 'PC・周辺機器', '楽器', '図書', '家具', '黒板・掲示板'];
    const locations = [
      '職員室', '第1理科室', '第2理科室', 'パソコン室', '体育館', 
      '音楽室', '図書室', '1年A組教室', '1年B組教室', '2年A組教室', 
      '2年B組教室', '3年A組教室', '3年B組教室', '美術室', '家庭科室'
    ];
    const equipmentNames = {
      '文房具': ['穴あけパンチ', '大型ホッチキス', '裁断機', 'プロジェクター用スクリーン', 'ラミネーター'],
      '体育器具': ['跳び箱', 'マット', 'バスケットボール', 'サッカーボール', 'ストップウォッチ', 'ライン引き'],
      '理科実験器具': ['顕微鏡', 'アルコールランプ', 'ビーカー', '試験管立て', '天秤はかり'],
      'PC・周辺機器': ['ノートパソコン', '液晶ディスプレイ', 'Wi-Fiルーター', 'USBカメラ', 'プリンター'],
      '楽器': ['アルトサックス', 'アコースティックギター', 'キーボード', '小太鼓', 'リコーダー'],
      '図書': ['百科事典セット', '国語辞典', '英語辞書', '歴史図鑑', '科学雑誌バックナンバー'],
      '家具': ['スチールラック', 'パイプ椅子', '折りたたみ机', 'ホワイトボード', '職員用デスク'],
      '黒板・掲示板': ['マグネットシート', '黒板消しクリーナー', '指示棒', 'コルクボード']
    };

    const statuses = ['未着手', '済', '要確認'];
    const items = [];

    // 高速に生成するために、事前にいくつかのランダム値をループ外または配列インデックスで解決
    for (let i = 1; i <= count; i++) {
      const category = categories[i % categories.length];
      const nameList = equipmentNames[category];
      const baseName = nameList[i % nameList.length];
      
      // 数字揺らぎを表現するため、名前にランダムな型番や番号を付与
      // 例: "顕微鏡 No. 3", "顕微鏡 R2-14" など
      let name = '';
      if (i % 3 === 0) {
        name = `${baseName} No. ${i % 100}`;
      } else if (i % 3 === 1) {
        name = `${baseName} R${i % 10}-${i % 20}`;
      } else {
        name = `${baseName} ${String.fromCharCode(65 + (i % 26))}-${i % 50}`;
      }

      // 管理番号 (eqCode): EQP-000001〜
      const eqCode = `EQP-${String(i).padStart(6, '0')}`;
      
      // 一意なID (id) の生成
      const id = `eq_demo_${i}_` + Math.random().toString(36).substr(2, 9);
      
      // 設置場所
      const location = `${locations[i % locations.length]} 棚${i % 10}-${i % 5}`;
      
      // ステータス分布: 80%未着手, 15%済, 5%要確認
      const rand = i % 100;
      let status = '未着手';
      if (rand < 15) {
        status = '済';
      } else if (rand < 20) {
        status = '要確認';
      }

      // 正規化テキストを生成してあらかじめ格納（バルクインサートの高速化・検索準備）
      const normalizedName = SearchClass.normalize(name);
      const normalizedLocation = SearchClass.normalize(location);

      items.push({
        id,
        eqCode,
        name,
        normalizedName,
        location,
        normalizedLocation,
        category,
        status,
        memo: i % 25 === 0 ? '傷あり要補修' : '',
        updatedAt: new Date().toISOString()
      });
    }

    return items;
  }

  /**
   * IndexedDBのデータをクリアし、新たに3万件のデータをインポートします。
   * @param {number} count
   * @returns {Promise<{timeTakenMs: number, count: number}>}
   */
  static async resetAndImportDemoData(count = 30000) {
    const db = new DBClass();
    await db.connect();
    
    console.log('Clearing old database...');
    await db.clearAll();

    console.log(`Generating ${count} items...`);
    const startTime = performance.now();
    const items = this.generateData(count);
    const generationTime = performance.now() - startTime;
    console.log(`Generated in ${generationTime.toFixed(2)}ms`);

    console.log('Inserting into IndexedDB...');
    const insertStartTime = performance.now();
    const insertedCount = await db.bulkInsert(items);
    const insertTime = performance.now() - insertStartTime;
    console.log(`Inserted ${insertedCount} items in ${insertTime.toFixed(2)}ms`);

    return {
      generationTimeMs: generationTime,
      insertTimeMs: insertTime,
      count: insertedCount
    };
  }
}

// ブラウザ環境とNode/ESM環境の両方で動作するようにエクスポートを設定
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SchoolEquipmentGenerator;
} else {
  window.SchoolEquipmentGenerator = SchoolEquipmentGenerator;
}
