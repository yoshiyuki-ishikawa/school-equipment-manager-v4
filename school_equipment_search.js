/**
 * 学校備品スマート棚卸しシステム v4.0 - Search & Normalization Module (search.js)
 * 
 * 日本語の揺らぎ（全角半角、大文字小文字、ひらがな・カタカナ）の変換と、
 * 型番や管理番号の数字部分のゼロ埋め補正（R2-14 -> r0002-0014 等）を行う
 * 高度な正規化エンジン、およびメモリキャッシュによる高速フィルタリングを提供します。
 */

class SchoolEquipmentSearch {
  /**
   * ひらがなをカタカナに変換するマップまたは関数
   * @param {string} str
   * @returns {string}
   */
  static hiraganaToKatakana(str) {
    return str.replace(/[\u3041-\u3096]/g, (match) => {
      const chr = match.charCodeAt(0) + 0x60;
      return String.fromCharCode(chr);
    });
  }

  /**
   * 全角英数字・記号を半角に変換、および大文字を小文字に変換
   * @param {string} str
   * @returns {string}
   */
  static toHalfWidthAndLowercase(str) {
    // 全角英数字・記号を半角にマッピング
    let res = str.replace(/[！-～]/g, (match) => {
      return String.fromCharCode(match.charCodeAt(0) - 0xfee0);
    });
    
    // スペースの統一 (全角スペースを半角スペースへ)
    res = res.replace(/　/g, ' ');
    
    // 小文字化
    return res.toLowerCase();
  }

  /**
   * 数字部分をゼロ埋めして補正する (例: "r2-14" -> "r0002-0014")
   * 検索揺らぎを防ぎ、正確な前方一致・部分一致を実現します。
   * デフォルトでは4桁ゼロ埋めとします。
   * @param {string} str
   * @param {number} padLength
   * @returns {string}
   */
  static normalizeNumbers(str, padLength = 4) {
    return str.replace(/\d+/g, (match) => {
      return match.padStart(padLength, '0');
    });
  }

  /**
   * 総合的な正規化処理を実行します。
   * 検索クエリとインデックス対象データの双方に同じ処理を適用することで、高度な検索一致度を実現します。
   * @param {string} str
   * @returns {string}
   */
  static normalize(str) {
    if (!str) return '';
    let res = str;
    res = this.toHalfWidthAndLowercase(res);
    res = this.hiraganaToKatakana(res);
    res = this.normalizeNumbers(res);
    // トリムして重複スペースを1つに
    res = res.replace(/\s+/g, ' ').trim();
    return res;
  }

  /**
   * メモリキャッシュを利用した高速フィルタリングエンジン
   */
  constructor() {
    this.cache = []; // 元データの配列
  }

  /**
   * キャッシュデータを設定・更新します。
   * 検索処理の前に一度だけIndexedDBから全件取得してこのキャッシュにロードします。
   * @param {Array<Object>} items
   */
  setCache(items) {
    this.cache = items.map(item => {
      // 正規化済みフィールドが欠落している場合はここでその場で生成して補完
      return {
        ...item,
        normalizedName: item.normalizedName || SchoolEquipmentSearch.normalize(item.name),
        normalizedLocation: item.normalizedLocation || SchoolEquipmentSearch.normalize(item.location),
        normalizedEqCode: SchoolEquipmentSearch.normalize(item.eqCode)
      };
    });
  }

  /**
   * 複数キーワード（AND検索）によるフィルタリングを実行します。
   * @param {string} queryStr 検索クエリ（スペース区切りで複数指定可能）
   * @param {string} statusFilter ステータスフィルター（'すべて' または '未着手'/'済'/'要確認' 等）
   * @returns {Array<Object>} フィルタリング結果の配列
   */
  filter(queryStr, statusFilter = 'すべて') {
    // クエリを正規化
    const normalizedQuery = SchoolEquipmentSearch.normalize(queryStr);
    
    // スペースで分割してキーワードの配列を作成
    const keywords = normalizedQuery.split(' ').filter(k => k.length > 0);

    return this.cache.filter(item => {
      // 1. ステータスフィルターのチェック
      if (statusFilter !== 'すべて' && item.status !== statusFilter) {
        return false;
      }

      // 2. キーワード検索（AND検索）のチェック
      if (keywords.length === 0) {
        return true;
      }

      // 全てのキーワードが、管理番号、名前、または設置場所のいずれかにマッチするか確認
      return keywords.every(keyword => {
        return (
          item.normalizedEqCode.includes(keyword) ||
          item.normalizedName.includes(keyword) ||
          item.normalizedLocation.includes(keyword)
        );
      });
    });
  }
}

// ブラウザ環境とNode/ESM環境の両方で動作するようにエクスポートを設定
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SchoolEquipmentSearch;
} else {
  window.SchoolEquipmentSearch = SchoolEquipmentSearch;
}
