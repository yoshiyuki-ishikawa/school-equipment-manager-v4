/**
 * 学校備品スマート棚卸しシステム v4.0 - 品質・パフォーマンス検証スクリプト
 */
const fs = require('fs');
const path = require('path');

// モック用のインメモリIndexedDB実装 (データベースの接続やバルクインサートをエミュレート)
class MockIndexedDB {
  constructor() {
    this.store = new Map();
  }
  async connect() { return this; }
  async clearAll() { this.store.clear(); }
  async bulkInsert(items) {
    let count = 0;
    for (const item of items) {
      const id = item.id || 'eq_' + Math.random().toString(36).substr(2, 9);
      this.store.set(id, { ...item, id });
      count++;
    }
    return count;
  }
  async getAll() {
    return Array.from(this.store.values());
  }
  async updateItem(id, updates) {
    const item = this.store.get(id);
    if (!item) throw new Error(`Item ${id} not found`);
    if (updates.status !== undefined) item.status = updates.status;
    if (updates.memo !== undefined) item.memo = updates.memo;
    item.updatedAt = new Date().toISOString();
    return item;
  }
}

// グローバルに必要なクラスをバインド
const SchoolEquipmentSearch = require('./school_equipment_search');
const SchoolEquipmentGenerator = require('./school_equipment_generator');

// グローバルオブジェクトのフック
global.performance = {
  now: () => {
    const hr = process.hrtime();
    return hr[0] * 1000 + hr[1] / 1000000;
  }
};

// CSVパース関数 (index.html から移植)
function parseCsvToRows(text) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let currentValue = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentValue += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentValue += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(currentValue.trim());
        currentValue = '';
      } else if (char === '\r' || char === '\n') {
        row.push(currentValue.trim());
        currentValue = '';
        if (row.length > 0 && row.some(cell => cell !== '')) {
          lines.push(row);
        }
        row = [];
        if (char === '\r' && nextChar === '\n') {
          i++;
        }
      } else {
        currentValue += char;
      }
    }
  }
  
  if (currentValue || row.length > 0) {
    row.push(currentValue.trim());
    if (row.some(cell => cell !== '')) {
      lines.push(row);
    }
  }

  return lines;
}

// ヘッダー自動マッピング (index.html から移植)
function autoMatchHeaders(headers) {
  const mapping = { eqCode: -1, name: -1, location: -1, category: -1, status: -1, memo: -1 };
  const systemFields = [
    { key: 'eqCode', keywords: ['管理番号', '備品no', 'eqcode', 'code', '番号'] },
    { key: 'name', keywords: ['備品名', '品名', '名称', '名前', 'name'] },
    { key: 'location', keywords: ['配置場所', '設置場所', '場所', 'location', '部屋'] },
    { key: 'category', keywords: ['カテゴリ', '教科区分', '分類', '区分', 'category'] },
    { key: 'status', keywords: ['ステータス', '状態', 'status'] },
    { key: 'memo', keywords: ['メモ', '備考', 'memo', 'コメント'] }
  ];

  headers.forEach((header, index) => {
    const lowerHeader = header.toLowerCase();
    for (const field of systemFields) {
      if (mapping[field.key] !== -1) continue;
      if (field.keywords.some(kw => lowerHeader.includes(kw))) {
        mapping[field.key] = index;
        break;
      }
    }
  });

  if (mapping.eqCode === -1 && headers.length > 0) mapping.eqCode = 0;
  if (mapping.name === -1 && headers.length > 1) mapping.name = 1;

  return mapping;
}

async function runVerification() {
  console.log('=== 学校備品スマート棚卸しシステム v4.0 検証開始 ===\n');

  const db = new MockIndexedDB();
  const searchEngine = new SchoolEquipmentSearch();

  // --- 検証1: CSVインポートの検証 ---
  console.log('【検証1】CSVインポートの動作検証');
  const csvPath = path.join(__dirname, '../dummy_inventory_data.csv');
  if (!fs.existsSync(csvPath)) {
    console.error(`エラー: CSVファイルが見つかりません: ${csvPath}`);
    return;
  }

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCsvToRows(csvText);
  console.log(`- CSV行数 (ヘッダー含む): ${rows.length} 行`);

  const headers = rows[0].map(h => h.replace(/^\ufeff/, '').trim());
  const mapping = autoMatchHeaders(headers);
  console.log('- マッピング結果:', mapping);

  // CSVインポート処理のシミュレーション
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= Math.max(mapping.eqCode, mapping.name)) continue;

    const eqCode = row[mapping.eqCode];
    const name = row[mapping.name];
    if (!eqCode || !name) continue;

    const location = mapping.location !== -1 ? row[mapping.location] || '' : '';
    const category = mapping.category !== -1 ? row[mapping.category] || '' : '';
    const status = (mapping.status !== -1 && row[mapping.status]) ? row[mapping.status] : '未着手';
    const memo = mapping.memo !== -1 ? row[mapping.memo] || '' : '';

    const id = 'eq_' + Math.random().toString(36).substr(2, 9);
    items.push({
      id,
      eqCode,
      name,
      normalizedName: SchoolEquipmentSearch.normalize(name),
      location,
      normalizedLocation: SchoolEquipmentSearch.normalize(location),
      category,
      status: ['未着手', '済', '要確認'].includes(status) ? status : '未着手',
      memo,
      updatedAt: new Date().toISOString()
    });
  }

  console.log(`- インポート対象データ件数: ${items.length} 件`);
  const insertedCount = await db.bulkInsert(items);
  console.log(`- IndexedDB登録完了件数: ${insertedCount} 件`);

  const allDbItems = await db.getAll();
  console.log(`- IndexedDB全件取得件数: ${allDbItems.length} 件`);

  const uniqueIds = new Set(allDbItems.map(item => item.id));
  console.log(`- ユニークなIDの数: ${uniqueIds.size}`);

  const eqCodes = allDbItems.map(item => item.eqCode);
  const uniqueEqCodes = new Set(eqCodes);
  console.log(`- 管理番号 (eqCode) の総数: ${eqCodes.length}, ユニークな管理番号の数: ${uniqueEqCodes.size}`);

  if (insertedCount === 105 && allDbItems.length === 105 && uniqueIds.size === 105) {
    console.log('=> 【判定】合格: 重複する管理番号があっても105件すべてが別々のIDで登録されました。');
  } else {
    console.log('=> 【判定】不合格: 登録件数が一致しないか、IDが重複しています。');
  }
  console.log('');

  // --- 検証2: 3万件デモデータの生成と検索パフォーマンスの検証 ---
  console.log('【検証2】3万件デモデータの生成および検索パフォーマンスの検証');
  
  const genStart = performance.now();
  const demoItems = SchoolEquipmentGenerator.generateData(30000);
  const genEnd = performance.now();
  console.log(`- 3万件のデモデータ生成所要時間: ${(genEnd - genStart).toFixed(2)} ms`);

  await db.clearAll();
  const insertStart = performance.now();
  const demoInsertedCount = await db.bulkInsert(demoItems);
  const insertEnd = performance.now();
  console.log(`- IndexedDBへの3万件インサート所要時間: ${(insertEnd - insertStart).toFixed(2)} ms`);
  console.log(`- 登録成功件数: ${demoInsertedCount} 件`);

  const loadStart = performance.now();
  const cachedItems = await db.getAll();
  searchEngine.setCache(cachedItems);
  const loadEnd = performance.now();
  console.log(`- キャッシュロード（setCache）所要時間: ${(loadEnd - loadStart).toFixed(2)} ms`);

  // 検索クエリテスト
  const testQueries = [
    { query: 'りか', status: 'すべて', desc: 'ひらがな検索' },
    { query: '顕微鏡', status: 'すべて', desc: '漢字検索' },
    { query: 'R2-14', status: 'すべて', desc: '型番・数字検索（ゼロ埋め補正対象）' },
    { query: 'りか けんびきょう', status: 'すべて', desc: '複数キーワードAND検索' },
    { query: 'ノートパソコン', status: '未着手', desc: 'キーワード＋ステータスフィルタ' },
    { query: '体育館', status: '済', desc: '場所＋ステータス' }
  ];

  let totalSearchTime = 0;
  let maxSearchTime = 0;

  console.log('\n- 検索テスト結果:');
  for (const t of testQueries) {
    const sTime = performance.now();
    const res = searchEngine.filter(t.query, t.status);
    const eTime = performance.now();
    const duration = eTime - sTime;
    totalSearchTime += duration;
    if (duration > maxSearchTime) maxSearchTime = duration;

    console.log(`  * クエリ [${t.query}] (${t.desc}): ${res.length} 件ヒット / 所要時間: ${duration.toFixed(2)} ms`);
  }

  const avgSearchTime = totalSearchTime / testQueries.length;
  console.log(`\n- 平均検索応答速度: ${avgSearchTime.toFixed(2)} ms`);
  console.log(`- 最大検索応答速度: ${maxSearchTime.toFixed(2)} ms`);

  if (avgSearchTime <= 50) {
    console.log('=> 【判定】合格: 平均検索応答速度が 50ms 以下を維持しています。');
  } else {
    console.log('=> 【判定】不合格: 平均検索応答速度が 50ms を超えています。');
  }
}

runVerification().catch(err => {
  console.error('検証中にエラーが発生しました:', err);
});
