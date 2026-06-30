/**
 * JSTで現在日付を取得する
 * 深夜0時〜5時59分は前日として扱う（FXロールオーバー対応）
 */
export const getJstTradingDate = (): string => {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  
  // 6時未満なら前日扱い
  if (jst.getUTCHours() < 6) {
    jst.setUTCDate(jst.getUTCDate() - 1);
  }
  
  return jst.toISOString().slice(0, 10);
};