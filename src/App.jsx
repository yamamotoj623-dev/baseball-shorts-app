import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Settings, Play, Square, Volume2, VolumeX, Activity, ChevronDown, ChevronUp, Maximize2, RotateCcw, Monitor, Code, FileText, Check, AlertCircle, Sparkles, User, Trash2, ClipboardPaste, Gauge, Mic2 } from 'lucide-react';

/**
 * Baseball Analytics Video Creator - Mass Production Edition (v4.24.0 - Radar Chart & Layout Fixed)
 * 縦型解説動画の大量生産に特化したテンプレート＆データバインディングエンジン
 * * [v4.24.0 Updates]
 * - レーダーチャートの項目名（「選球眼」など）が意図せず改行される問題を修正（whitespace-nowrap追加）。
 * - チャート下部のスコアが成績テーブルに隠れてしまう問題に対応し、チャートを少し下げ、テーブルとの間隔を適正化。
 */

// --- テーマカラー定義 ---
const THEMES = {
  orange: { primary: '#f97316', secondary: '#c2410c', text: 'text-orange-500', bg: 'bg-orange-500', border: 'border-orange-500', glow: 'rgba(249,115,22,0.6)', ring: 'ring-orange-500' },
  blue:   { primary: '#3b82f6', secondary: '#1d4ed8', text: 'text-blue-500', bg: 'bg-blue-500', border: 'border-blue-500', glow: 'rgba(59,130,246,0.6)', ring: 'ring-blue-500' },
  red:    { primary: '#ef4444', secondary: '#b91c1c', text: 'text-red-500', bg: 'bg-red-500', border: 'border-red-500', glow: 'rgba(239,68,68,0.6)', ring: 'ring-red-500' },
  yellow: { primary: '#eab308', secondary: '#a16207', text: 'text-yellow-500', bg: 'bg-yellow-500', border: 'border-yellow-500', glow: 'rgba(234,179,8,0.6)', ring: 'ring-yellow-500' },
  green:  { primary: '#10b981', secondary: '#047857', text: 'text-emerald-500', bg: 'bg-emerald-500', border: 'border-emerald-500', glow: 'rgba(16,185,129,0.6)', ring: 'ring-emerald-500' },
  purple: { primary: '#a855f7', secondary: '#7e22ce', text: 'text-purple-500', bg: 'bg-purple-500', border: 'border-purple-500', glow: 'rgba(168,85,247,0.6)', ring: 'ring-purple-500' },
};

// --- 初期データ：野手用 (Batter) ---
const defaultBatterData = {
  playerType: 'batter',
  presentationMode: 'dialogue', 
  theme: 'orange',
  period: '2026.04.14時点', 
  mainPlayer: {
    name: '増田 陸', number: '61', label: '26年(今季)',
    stats: { pa: '29', ab: '29', avg: '.276', hr: '1', rbi: '4', ops: '.724' }
  },
  subPlayer: {
    name: '増田 陸', number: '61', label: '25年(昨季)',
    stats: { pa: '286', ab: '260', avg: '.231', hr: '5', rbi: '21', ops: '.598' }
  },
  radarStats: {
    isop:  { main: 65, sub: 40, label: '長打力' }, 
    isod:  { main: 10, sub: 30, label: '出塁力' }, 
    bb_k:  { main: 0,  sub: 35, label: '選球眼' }, 
    rc27:  { main: 55, sub: 30, label: '得点力' },
    ab_hr: { main: 55, sub: 30, label: 'HR率' }, 
  },
  comparisons: [
    { id: 'rc27', label: 'RC27', kana: 'アールシーにじゅうなな', desc: '1試合得点貢献', formula: '得点能力の総合指標', criteria: '優秀: 6.0以上', radarMatch: '得点力', valMain: '4.60', valSub: '2.70', unit: '点', winner: 'main' },
    { id: 'isop', label: 'IsoP', kana: 'アイソピー', desc: '純粋な長打力', formula: '長打率 - 打率', criteria: '優秀: .200以上', radarMatch: '長打力', valMain: '.172', valSub: '.095', unit: '', winner: 'main' },
    { id: 'isod', label: 'IsoD', kana: 'アイソディー', desc: '選球眼による出塁', formula: '出塁率 - 打率', criteria: '優秀: .080以上', radarMatch: '出塁力', valMain: '.000', valSub: '.041', unit: '', winner: 'sub' },
    { id: 'bb_k', label: 'BB/K', kana: 'ビービーケー', desc: '四球/三振比', formula: '四球 ÷ 三振', criteria: '優秀: 1.0以上', radarMatch: '選球眼', valMain: '0.00', valSub: '0.21', unit: '', winner: 'sub' },
    { id: 'ab_hr', label: 'AB/HR', kana: 'エービー・エイチアール', desc: '本塁打率', formula: '打数 ÷ 本塁打', criteria: '優秀: 15.0以下', radarMatch: 'HR率', valMain: '29.0', valSub: '52.8', unit: '', winner: 'main' },
  ],
  scripts: [
    { id: 1, speaker: 'A', emoji: '👨‍🏫', text: '【悲報】\n増田陸の四球が\n今季ここまで\n【ゼロ】です', speech: '悲報。増田陸の四球が、今季ここまでゼロです。', highlight: null, isCatchy: true },
    { id: 2, speaker: 'B', emoji: '😲', text: 'え！？\n打撃好調なのに\n四球ゼロ\nなんですか？', speech: 'えっ！打撃好調なのに、四球ゼロなんですか？', highlight: null },
    { id: 3, speaker: 'A', emoji: '👨‍🏫', text: 'そうなんです\nデータで詳しく\n見てみましょう', speech: 'そうなんです。データで詳しく見てみましょう。', highlight: null },
    { id: 4, speaker: 'B', emoji: '🤔', text: '確かに\n29打席立って\n四球がひとつも\n無いですね', speech: '確かに、29打席立って四球がひとつもないですね。', highlight: null },
    { id: 5, speaker: 'A', emoji: '👨‍🏫', text: 'しかし長打力が\n明らかに\nアップしてます', speech: 'しかし、長打力が明らかにアップしているんです。', highlight: null },
    { id: 6, speaker: 'B', emoji: '😯', text: '長打力ですか？\nどれくらい\n良くなったん\nですか？', speech: '長打力ですか？どれくらい良くなったんですか？', highlight: null },
    { id: 7, speaker: 'A', emoji: '👨‍🏫', text: '純粋な長打力を\n測る「IsoP」を\n見てください', speech: '純粋な長打力を測るアイソピーを見てください。', highlight: 'isop' },
    { id: 8, speaker: 'B', emoji: '🧐', text: '長打率から\n打率を引いた\n指標ですね', speech: '長打率から打率を引いた指標ですね。', highlight: 'isop' },
    { id: 9, speaker: 'A', emoji: '👨‍🏫', text: '昨季の.095から\n今季は【.172】\nに大幅上昇です', speech: '昨季の、れいてん・ぜろきゅうご、から今季は、いちわり、ななぶ、にりんに大幅上昇しています。', highlight: 'isop' },
    { id: 10, speaker: 'B', emoji: '🤯', text: '【.150】以上が\n優秀ですから\nすごい進化\nですね！', speech: 'いちわりごぶ以上が優秀と言われますから、すごい進化ですね！', highlight: 'isop' },
    { id: 11, speaker: 'A', emoji: '👨‍🏫', text: 'DeNA戦での\n同点ツーラン等\n結果に出ています', speech: 'ディーエヌエー戦での同点ツーランなど、結果に出ています。', highlight: null },
    { id: 12, speaker: 'B', emoji: '😆', text: 'なるほど\n振っていく姿勢が\n長打を生んで\nいるんですね', speech: 'なるほど。振っていく姿勢が長打を生んでいるんですね。', highlight: null },
    { id: 13, speaker: 'A', emoji: '👨‍🏫', text: '一方で、\n出塁力を測る\n「IsoD」は\n課題です', speech: '一方で、出塁力を測るアイソディーは課題です。', highlight: 'isod' },
    { id: 14, speaker: 'B', emoji: '🤔', text: '出塁率から\n打率を引いた\n指標ですね', speech: '出塁率から打率を引いた指標ですね。', highlight: 'isod' },
    { id: 15, speaker: 'A', emoji: '👨‍🏫', text: 'なんと驚愕の\n【ゼロ】を\n記録しています', speech: 'なんと驚愕のゼロを記録しています。', highlight: 'isod' },
    { id: 16, speaker: 'B', emoji: '😨', text: '優秀な基準の\n.080とは\n程遠いですね…', speech: '優秀な基準のれい・てん・ぜろはちぜろ、とは、程遠い数字ですね。', highlight: 'isod' },
    { id: 17, speaker: 'A', emoji: '👨‍🏫', text: '29打席すべて\nが打数で出塁率と\n打率が同じです', speech: '29打席すべてが打数で、出塁率と打率が同じなんです。', highlight: null },
    { id: 18, speaker: 'B', emoji: '😲', text: 'つまり四死球で\n出塁したことが\n一度も無いと', speech: 'つまり、四死球で出塁したことが一度もないと。', highlight: null },
    { id: 19, speaker: 'A', emoji: '👨‍🏫', text: 'その通りです\n選球眼を示す\nBB/Kもゼロです', speech: 'その通りです。選球眼を示すビービーケーも当然ゼロです。', highlight: 'bb_k' },
    { id: 20, speaker: 'B', emoji: '🤔', text: '打てる球は\n全部振る積極性\nが裏目に出て\nいる面も？', speech: 'うてるたまは全部振る積極性が、裏目に出ている面もあるんですね。', highlight: 'bb_k' },
    { id: 21, speaker: 'A', emoji: '👨‍🏫', text: 'ボール球も\n振ってしまう\n課題が数字に\n表れています', speech: 'ぼーるだまも振ってしまう課題が、数字に表れています。', highlight: 'bb_k' },
    { id: 22, speaker: 'B', emoji: '😨', text: '先日の広島戦\nでは『2失策』\nもありましたね', speech: 'さらに先日の広島戦では2失策もありましたね。', highlight: null },
    { id: 23, speaker: 'A', emoji: '👨‍🏫', text: '守備面の安定も\n今後の大きな\n課題と言えます', speech: '守備面の安定も今後の大きな課題と言えます。', highlight: null },
    { id: 24, speaker: 'B', emoji: '🤨', text: '一塁には強敵の\nダルベックも\nいますから\n気は抜けない', speech: '一塁には強敵ダルベックもいますから、気が抜けませんね。', highlight: null },
    { id: 25, speaker: 'A', emoji: '👨‍🏫', text: 'スタメン定着に\n何が必要だと\n思いますか？', speech: 'スタメン定着には何が必要だと思いますか？', highlight: null },
    { id: 26, speaker: 'B', emoji: '🥰', text: 'あなたの意見を\nぜひコメ欄で\n教えて！', speech: 'あなたの意見をぜひ、コメ欄で教えてください！', highlight: null }
  ]
};

// --- 初期データ：投手用 (Pitcher) ---
const defaultPitcherData = {
  playerType: 'pitcher',
  presentationMode: 'dialogue', 
  theme: 'orange',
  period: '2026.04.13時点', 
  mainPlayer: {
    name: '則本 昂大', number: '43', label: '26年(今季)',
    stats: { g: '1', ip: '7.0', era: '2.57', win: '0', lose: '0', sv: '0', hld: '0', so: '5', whip: '0.71' }
  },
  subPlayer: {
    name: '則本 昂大', number: '14', label: '25年(昨季)',
    stats: { g: '56', ip: '56.0', era: '3.05', win: '3', lose: '2', sv: '32', hld: '5', so: '43', whip: '1.43' }
  },
  radarStats: {
    fip:        { main: 55, sub: 65, label: 'DIPS(内容)' }, 
    hr_9:       { main: 40, sub: 70, label: '本塁打回避' }, 
    bb_9:       { main: 100, sub: 80, label: '制球力' }, 
    k_bb:       { main: 100, sub: 85, label: '制圧力(K/BB)' },
    k_9:        { main: 55, sub: 60, label: '奪三振力' }, 
  },
  comparisons: [
    { id: 'fip', label: 'DIPS', kana: 'ディップス', desc: '守備から独立した防御率', formula: '本塁打・四死球・三振で評価', criteria: 'エース級: 3.00以下', radarMatch: 'DIPS(内容)', valMain: '3.55', valSub: '3.31', unit: '', winner: 'sub' },
    { id: 'hr_9', label: 'HR/9', kana: 'エイチアールナイン', desc: '被本塁打率', formula: '9イニングあたりの被本塁打', criteria: '優秀: 0.80以下', radarMatch: '本塁打回避', valMain: '1.29', valSub: '0.96', unit: '本', winner: 'sub' },
    { id: 'bb_9', label: 'BB/9', kana: 'ビービーナイン', desc: '与四球率', formula: '9イニングあたりの与四球', criteria: '非常に優秀: 2.00以下', radarMatch: '制球力', valMain: '0.00', valSub: '1.45', unit: '', winner: 'main' },
    { id: 'k_bb', label: 'K/BB', kana: 'ケービービー', desc: '奪三振と与四球の比率', formula: '奪三振 ÷ 与四球', criteria: '優秀: 3.50以上', radarMatch: '制圧力(K/BB)', valMain: 'MAX', valSub: '4.78', unit: '', winner: 'main' },
    { id: 'k_9', label: 'K/9', kana: 'ケーナイン', desc: '奪三振率', formula: '9イニングあたりの奪三振', criteria: '優秀: 8.0以上', radarMatch: '奪三振力', valMain: '6.43', valSub: '6.91', unit: '', winner: 'sub' },
  ],
  scripts: [
    { id: 1, speaker: 'A', emoji: '👨‍🏫', text: '【衝撃】\n巨人・則本昂大が\n全く別の投手に\n生まれ変わった', speech: '衝撃。巨人則本昂大が、全く別の投手に生まれ変わっています。', highlight: null, isCatchy: true },
    { id: 2, speaker: 'B', emoji: '🤩', text: '先発転向した\n初登板、見事な\nピッチング\nでしたね！', speech: '先発転向した初登板、見事なピッチングでしたね！', highlight: null },
    { id: 3, speaker: 'A', emoji: '👨‍🏫', text: 'データを見ると\n昨季の救援時代\nとはスタイルが\n激変しています', speech: 'データを見ると、昨季のリリーフ時代とは、スタイルが激変しています。', highlight: null },
    { id: 4, speaker: 'B', emoji: '🤔', text: 'どんなふうに\n変わったんですか', speech: 'どんなふうに変わったんですか？', highlight: null },
    { id: 5, speaker: 'A', emoji: '👨‍🏫', text: '奪三振率を示す\n「K/9」を\n見てください', speech: '奪三振率を示すケーナインを見てください。', highlight: 'k_9' },
    { id: 6, speaker: 'B', emoji: '😯', text: '昨季よりも下がり\n三振を狙う形から\n変わってますね', speech: '昨季よりも下がって、三振を狙うスタイルから変わっていますね。', highlight: 'k_9' },
    { id: 7, speaker: 'A', emoji: '👨‍🏫', text: '一番の変化は\n圧倒的な制球力\n「BB/9」を\n見てください', speech: '一番の変化は、圧倒的な制球力です。ビービーナインを見てください。', highlight: 'bb_9' },
    { id: 8, speaker: 'B', emoji: '🧐', text: '1試合あたりの\n与四球率ですね', speech: '1試合あたりの与四球率ですね。', highlight: 'bb_9' },
    { id: 9, speaker: 'A', emoji: '👨‍🏫', text: '今季はなんと\n【0.00】です！', speech: '今季はなんと、ぜろてんぜろぜろ、なんです！', highlight: 'bb_9' },
    { id: 10, speaker: 'B', emoji: '🤯', text: '7イニング投げて\n四球がひとつも\n無かったんですね', speech: '7イニング投げて、四球がひとつも無かったんですね！', highlight: 'bb_9' },
    { id: 11, speaker: 'A', emoji: '👨‍🏫', text: 'そのため奪三振と\n与四球の比率\n「K/BB」は\n【MAX】です', speech: 'そのため、奪三振と与四球の比率、ケービービーは測定不能の、マックスです。', highlight: 'k_bb' },
    { id: 12, speaker: 'B', emoji: '😆', text: '四球から自滅する\n気配が全く\n無かったですね', speech: '四球から自滅する気配が、全く無かったですね！', highlight: 'k_bb' },
    { id: 13, speaker: 'A', emoji: '👨‍🏫', text: 'ただし一発を\n浴びるリスクは\n増えています\n「HR/9」は悪化', speech: 'ただし、一発を浴びるリスクは増えています。エイチアールナインは悪化しています。', highlight: 'hr_9' },
    { id: 14, speaker: 'B', emoji: '😨', text: 'その結果\n「DIPS」も\n実際の防御率\nより悪いですね', speech: 'その結果ディップスも、実際の防御率より悪くなっていますね。', highlight: 'fip' },
    { id: 15, speaker: 'A', emoji: '👨‍🏫', text: 'しかし四球が無く\n被弾してもソロで\n致命傷にならない', speech: 'しかし四球が無いので、被弾してもソロで済み、致命傷になりません。', highlight: null },
    { id: 16, speaker: 'B', emoji: '😲', text: 'なるほど！\n「WHIP」も0.71で\n抜群の安定感！', speech: 'なるほど！ウィップもぜろてんなないちと、抜群の安定感ですね！', highlight: null },
    { id: 17, speaker: 'A', emoji: '👨‍🏫', text: '球数を抑えて\n長くイニングを\n投げる見事な\n適応です', speech: '球数を抑えて長くイニングを投げる、先発への見事な適応です。', highlight: null },
    { id: 18, speaker: 'B', emoji: '🥰', text: '先発・則本\nこの先も期待\nできそうですね', speech: '先発・則本、この先も期待できそうですね！', highlight: null },
    { id: 19, speaker: 'A', emoji: '👨‍🏫', text: 'あなたは今季の\n則本に何勝を\n期待しますか？', speech: 'あなたは今季の則本に何勝を期待しますか？', highlight: null },
    { id: 20, speaker: 'B', emoji: '🤔', text: 'ぜひコメント欄で\nあなたの予想を\n教えて！', speech: 'ぜひコメント欄で、あなたの予想を教えてください！', highlight: null }
  ]
};

// --- ヘルパー関数 ---
const getRankData = (score) => {
  if (score >= 90) return { rank: 'S', color: 'text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,0.8)]' };
  if (score >= 80) return { rank: 'A', color: 'text-red-500' };
  if (score >= 70) return { rank: 'B', color: 'text-orange-500' };
  if (score >= 60) return { rank: 'C', color: 'text-emerald-500' };
  if (score >= 50) return { rank: 'D', color: 'text-blue-500' };
  if (score >= 40) return { rank: 'E', color: 'text-zinc-400' };
  if (score >= 30) return { rank: 'F', color: 'text-zinc-500' };
  return { rank: 'G', color: 'text-zinc-600' };
};

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '249, 115, 22';
};

const renderFormattedText = (text, isCatchy = false, speaker = null) => {
  if (!text) return null;
  const lines = text.split('\n');
  let firstBracketEncountered = false;

  const baseTextColor = speaker === 'B' ? 'text-yellow-300' : 'text-white';

  return lines.map((line, lineIndex) => {
    const parts = line.split(/(【.*?】|「.*?」|『.*?』)/g);
    return (
      <div key={lineIndex} className="block w-full leading-[1.35] py-0.5">
        {parts.map((part, i) => {
          if (!part) return null;
          if (part.startsWith('【') && part.endsWith('】')) {
            let displayText = part.slice(1, -1);
            if (isCatchy && !firstBracketEncountered) {
              displayText = part; 
              firstBracketEncountered = true;
            } else if (isCatchy) {
              firstBracketEncountered = true;
            }
            return <span key={i} className="text-[#FFD700] text-[1.15em] font-black tracking-tighter mx-0.5 transform -translate-y-[2px] inline-block">{displayText}</span>;
          }
          if (part.startsWith('「') && part.endsWith('」')) {
            return <span key={i} className="text-[#FF8C00] text-[1.1em] font-black tracking-tighter mx-0.5 inline-block">{part.slice(1, -1)}</span>;
          }
          if (part.startsWith('『') && part.endsWith('』')) {
            return <span key={i} className="text-[#FF4500] text-[1.1em] font-black tracking-tighter mx-0.5 inline-block">{part.slice(1, -1)}</span>;
          }
          return <span key={i} className={`${baseTextColor} font-black tracking-tight drop-shadow-md`}>{part}</span>;
        })}
      </div>
    );
  });
};

// --- レーダーチャート コンポーネント ---
const PentagonRadarChart = ({ stats, highlight, themeColor }) => {
  const keys = Object.keys(stats).slice(0, 5);
  const points = keys.map((k, i) => ({
    id: k,
    angle: -Math.PI / 2 + (Math.PI * 2 * i) / 5,
    label: stats[k].label
  }));

  const getCoordinates = (value, angle, rScale = 44) => {
    const r = (value / 100) * rScale;
    return `${60 + r * Math.cos(angle)},${60 + r * Math.sin(angle)}`;
  };

  const polyMain = keys.map((k, i) => getCoordinates(stats[k].main, points[i].angle)).join(' ');
  const polySub = keys.map((k, i) => getCoordinates(stats[k].sub, points[i].angle)).join(' ');

  const primaryColor = THEMES[themeColor]?.primary || THEMES.orange.primary;
  const glowColor = THEMES[themeColor]?.glow || THEMES.orange.glow;
  const fillColor = `rgba(${hexToRgb(primaryColor)}, 0.4)`;

  return (
    <div className="w-[180px] h-[180px] relative transition-all duration-500 animate-float">
      <svg viewBox="0 0 120 120" className="w-full h-full overflow-visible">
        {[100, 80, 60, 40, 20].map(level => (
          <polygon key={level} points={points.map(p => getCoordinates(level, p.angle)).join(' ')} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        ))}
        {points.map((p, i) => (
          <line key={i} x1="60" y1="60" x2={getCoordinates(100, p.angle).split(',')[0]} y2={getCoordinates(100, p.angle).split(',')[1]} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
        ))}
        <polygon points={polyMain} fill={fillColor} stroke={primaryColor} strokeWidth="2.5" style={{ filter: `drop-shadow(0px 0px 5px ${glowColor})` }} />
        <polygon points={polySub} fill="rgba(161, 161, 170, 0.25)" stroke="rgba(212, 212, 216, 1)" strokeWidth="2.5" strokeDasharray="4 3" />
      </svg>
      {points.map((p, i) => {
        const x = 50 + (60/60)*50 * Math.cos(p.angle);
        const y = 50 + (60/60)*50 * Math.sin(p.angle);
        const isH = highlight === p.id;
        const rankData = getRankData(stats[p.id].main);
        return (
          <div key={i} className={`absolute flex flex-col items-center justify-center transition-all duration-300 ${isH ? 'scale-[1.2] z-10' : 'z-0'}`} style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}>
            {/* 🚨 項目名（選球眼など）の改行を防ぐため whitespace-nowrap を追加 */}
            <span className={`text-[14px] font-black leading-none whitespace-nowrap mb-0.5 transition-colors ${isH ? 'text-white drop-shadow-[0_0_5px_rgba(255,255,255,1)]' : 'text-zinc-300'}`} style={isH ? { textShadow: `0 0 10px ${primaryColor}` } : {}}>{p.label}</span>
            <span className={`text-[18px] font-black italic leading-none ${rankData.color}`}>{rankData.rank}</span>
          </div>
        )
      })}
    </div>
  );
};

// --- アニメーションスタイル ---
const GlobalStyles = () => (
  <style>{`
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes valueBounce { 0% { transform: scale(1); } 50% { transform: scale(1.15); } 100% { transform: scale(1); } }
    @keyframes float { 0% { transform: translateY(0px); } 50% { transform: translateY(-6px); } 100% { transform: translateY(0px); } }
    @keyframes flash { 0% { background-color: rgba(255,255,255,0.1); } 100% { background-color: transparent; } }
    @keyframes shake {
      0% { transform: translate(1px, 1px) rotate(0deg); }
      10% { transform: translate(-1px, -2px) rotate(-1deg); }
      20% { transform: translate(-3px, 0px) rotate(1deg); }
      30% { transform: translate(3px, 2px) rotate(0deg); }
      40% { transform: translate(1px, -1px) rotate(1deg); }
      50% { transform: translate(-1px, 2px) rotate(-1deg); }
      60% { transform: translate(-3px, 1px) rotate(0deg); }
      70% { transform: translate(3px, 1px) rotate(-1deg); }
      80% { transform: translate(-1px, -1px) rotate(1deg); }
      90% { transform: translate(1px, 2px) rotate(0deg); }
      100% { transform: translate(1px, -2px) rotate(-1deg); }
    }
    .animate-shake { animation: shake 0.5s infinite; }
    .animate-float { animation: float 4s ease-in-out infinite; }
    @keyframes bgScroll { 0% { background-position: 0px 0px; } 100% { background-position: 0px 150px; } }
    .custom-scrollbar::-webkit-scrollbar { width: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: #cbd5e1; border-radius: 6px; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 6px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #64748b; }
  `}</style>
);

const App = () => {
  const [projectData, setProjectData] = useState(defaultBatterData);
  const [activeTab, setActiveTab] = useState('json');
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isFullscreenMode, setIsFullscreenMode] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [speechRate, setSpeechRate] = useState(1.60); 
  const [voices, setVoices] = useState([]);
  
  const timeoutRef = useRef(null);
  const utteranceRef = useRef(null); 
  
  const [animationKey, setAnimationKey] = useState(Date.now());
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  const currentScript = projectData.scripts[currentIndex];
  const themeClass = THEMES[projectData.theme] || THEMES.orange;
  const primaryColorHex = THEMES[projectData.theme]?.primary || THEMES.orange.primary;

  const currentEmojiA = useMemo(() => {
    for (let i = currentIndex; i >= 0; i--) {
      if (projectData.scripts[i].speaker === 'A' && projectData.scripts[i].emoji) {
        return projectData.scripts[i].emoji;
      }
    }
    return '👨‍🏫';
  }, [currentIndex, projectData.scripts]);

  const currentEmojiB = useMemo(() => {
    for (let i = currentIndex; i >= 0; i--) {
      if (projectData.scripts[i].speaker === 'B' && projectData.scripts[i].emoji) {
        return projectData.scripts[i].emoji;
      }
    }
    return '😲';
  }, [currentIndex, projectData.scripts]);

  useEffect(() => {
    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    setJsonInput(JSON.stringify(defaultBatterData, null, 2));
    
    return () => {
      window.speechSynthesis.cancel();
      clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    let interval;
    if (isPlaying) interval = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
    else clearInterval(interval);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const playNext = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = prev + 1;
      if (next < projectData.scripts.length) return next;
      else { setIsPlaying(false); return prev; }
    });
  }, [projectData.scripts.length]);

  const speakText = useCallback((text, speaker) => {
    if (!isPlaying) return;
    clearTimeout(timeoutRef.current);
    
    if (utteranceRef.current) {
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
    }
    window.speechSynthesis.cancel();
    
    if (!isVoiceEnabled || !('speechSynthesis' in window) || !text) {
      const delay = Math.max(1500, (text?.length || 10) * 150 / speechRate);
      timeoutRef.current = setTimeout(playNext, delay);
      return;
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;
    utterance.lang = 'ja-JP';
    
    let currentVoices = voices;
    if (currentVoices.length === 0) {
      currentVoices = window.speechSynthesis.getVoices();
    }
    const jaVoices = currentVoices.filter(v => v.lang.includes('ja'));
    
    let preferredVoice = jaVoices[0];
    if (speaker === 'B') {
      preferredVoice = jaVoices.find(v => v.name.includes('Nanami') || v.name.includes('Female')) || jaVoices[0];
      utterance.pitch = 1.3;
    } else {
      preferredVoice = jaVoices.find(v => v.name.includes('Google') || v.name.includes('Premium') || v.name.includes('Kyoko')) || jaVoices[0];
      utterance.pitch = 1.05;
    }
    
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = speechRate; 
    utterance.volume = 1.0;
   
    utterance.onend = () => {
      clearTimeout(timeoutRef.current);
      playNext();
    };
    
    utterance.onerror = (e) => {
      console.warn("SpeechSynthesis Error:", e);
      clearTimeout(timeoutRef.current);
      playNext();
    };
    
    window.speechSynthesis.speak(utterance);

    const baseDelay = text.length * 280;
    const maxDelay = Math.max(3000, baseDelay / speechRate);
    
    timeoutRef.current = setTimeout(() => {
      if (utteranceRef.current) {
        utteranceRef.current.onend = null;
        utteranceRef.current.onerror = null;
      }
      window.speechSynthesis.cancel();
      playNext();
    }, maxDelay + 1000);
  }, [isPlaying, isVoiceEnabled, voices, playNext, speechRate]);

  useEffect(() => { 
    if (isPlaying && currentScript) {
      speakText(currentScript.speech || currentScript.text, currentScript.speaker); 
    }
  }, [currentIndex, isPlaying, currentScript, speakText]);

  const togglePlay = () => {
    if (!isPlaying) {
      if ('speechSynthesis' in window) { 
        window.speechSynthesis.resume(); 
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
      
      if (currentIndex >= projectData.scripts.length - 1) { 
        setCurrentIndex(0); 
        setElapsedTime(0); 
        setAnimationKey(Date.now()); 
      } else if (elapsedTime === 0) {
        setAnimationKey(Date.now());
      }
      setIsPlaying(true);
    } else { 
      setIsPlaying(false); 
      if (utteranceRef.current) {
        utteranceRef.current.onend = null;
        utteranceRef.current.onerror = null;
      }
      window.speechSynthesis.cancel(); 
      clearTimeout(timeoutRef.current); 
    }
  };

  const resetPlay = () => { 
    setIsPlaying(false); 
    setCurrentIndex(0); 
    setElapsedTime(0); 
    setAnimationKey(Date.now()); 
    if (utteranceRef.current) {
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
    }
    window.speechSynthesis.cancel(); 
    clearTimeout(timeoutRef.current); 
  };

  const handleJsonApply = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (!parsed.scripts || !parsed.mainPlayer) throw new Error("不正なフォーマットです。必須項目がありません。");
      setProjectData(parsed);
      setJsonError('');
      resetPlay();
      setCopyStatus('データを適用しました！');
      setTimeout(() => setCopyStatus(''), 3000);
    } catch (e) {
      setJsonError(e.message);
    }
  };

  const handleJsonPasteAndApply = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setJsonInput(text);
      try {
        const parsed = JSON.parse(text);
        if (!parsed.scripts || !parsed.mainPlayer) throw new Error("不正なフォーマットです。必須項目がありません。");
        setProjectData(parsed);
        setJsonError('');
        resetPlay();
        setCopyStatus('貼り付けて反映しました！');
      } catch (e) {
        setJsonError('貼り付けたデータのエラー: ' + e.message);
      }
      setTimeout(() => setCopyStatus(''), 3000);
    } catch (err) {
      setJsonError('クリップボードの読み取り権限がありません。下のテキストエリアに直接ペーストしてください。');
    }
  };

  const handleJsonClear = () => {
    setJsonInput('');
    setJsonError('');
  };

  const handleScriptChange = (id, field, value) => {
    setProjectData(prev => {
      const updatedData = {
        ...prev,
        scripts: prev.scripts.map(s => s.id === id ? { ...s, [field]: value } : s)
      };
      setJsonInput(JSON.stringify(updatedData, null, 2));
      return updatedData;
    });
  };

  const loadTemplate = (type) => {
    const template = type === 'batter' ? defaultBatterData : defaultPitcherData;
    setProjectData(template);
    setJsonInput(JSON.stringify(template, null, 2));
    resetPlay();
    setCopyStatus(`${type === 'batter' ? '野手' : '投手'}テンプレートを読み込みました`);
    setTimeout(() => setCopyStatus(''), 3000);
  };

  const handleModeChange = (mode) => {
    setProjectData(prev => {
      const updatedData = { ...prev, presentationMode: mode };
      setJsonInput(JSON.stringify(updatedData, null, 2));
      return updatedData;
    });
  };

  const handleCopyAIPrompt = () => {
    const isDialogue = projectData.presentationMode === 'dialogue';
    const isBatter = projectData.playerType === 'batter';
    
    const statsDesc = isBatter
      ? '・打率/出塁率/長打率など (.250, .350): 「にわり・ごぶ」「さんわり・ごぶ」のように【割・分・厘】で記述（てん・にーごーぜろ等は厳禁）。\n・OPSやIsoPなどの数値 (.850, .172): これらは割分厘を使わず、「てんはちごーぜろ」「てんいちななに」または「れいてんはちごーぜろ」と記述。\n・指標名: 「IsoP」→「アイソピー」、「BB/K」→「ビービーケー」、「RC27」→「アールシーにじゅうなな」。'
      : '・防御率やFIPなど (2.15, 3.50): 「にてんいちご」「さんてんごぜろ」と記述。\n・K/BBやK/9などの数値 (7.00, 10.80): 「ななてんぜろぜろ」「じゅってんはちぜろ」と記述。\n・指標名: 「FIP」→「フィップ」、「K/BB」→「ケービービー」、「WHIP」→「ウィップ」、「HR/9」→「エイチアールナイン」。';

    const prompt = `あなたは「プロ野球データ分析ショート動画」のメインデータアナリスト兼構成作家です。
ターゲットは野球ファン。感情論や誹謗中傷を排し、セイバーメトリクスを用いた「圧倒的ロジカルで知的な考察」を提供します。
提供されたテーマに基づき、以下の【制作の鉄則】【読み方ルール】【厳密な生成ルール】に従って、動画生成アプリ用のJSONを出力してください。

【1. コンテンツ制作の鉄則】
・構成の基本型: 「フック(起) → 事実の提示(承) → 深掘り(転) → オチ・行動喚起(結)」に沿って、20〜26セクションで構成してください。
・フックの具体性(id:1): 抽象的な表現（「〇〇の罠」「驚きの結果」等）は禁止。必ず「具体的な数字」や「比較結果の結論」を提示してください。
・フォローアップ: 成績不振な選手を扱う場合でも人格否定はせず、「データ上の課題」として提示し、必ず「ここが改善されれば化ける」というポジティブな展望を組み込んでください。
・CTA(最後): 「どう思いますか？」という丸投げは禁止。視聴者が答えやすい「AかBか」の二者択一、または具体的な選択肢を提示し、コメントを促してください。

【2. テキストテロップの強調ルール（重要）】
テロップ(text)において、以下の括弧を使うと自動的に色が変わり強調されます。AIはこれを積極的に活用してください。
・【】: 黄色で強調（例：【ゼロ】、【.172】）
・「」: オレンジ色で強調（例：「IsoP」）
・『』: 赤色で強調（例：『2失策』）

【3. 野球特有の読み方（speech）の徹底ルール】
自動音声（TTS）がプロのアナウンサーのように自然に読めるよう、以下の変換を「speech」フィールドで必ず実行してください。
${statsDesc}
・単語のひらがな化: 「球」→「たま」、「四球」→「しきゅう」または「ふぉあぼーる」。
・球団名: 「DeNA」→「ディーエヌエー」、「巨」→「きょじん」、「神」→「はんしん」。

【4. 厳密な生成ルール】
1. 出力形式: \`\`\`json ブロックのみを出力。挨拶や説明文は一切不要。
2. データ構造準拠: comparisonsには \`radarMatch\`(上のチャートのどの項目と一致するか), \`formula\`(計算式や意味), \`criteria\`(評価基準・目安) を必ず含める。
3. レーダーチャート(radarStats): 0〜100のスコアで評価（NPB基準で90以上がSランク）。※防御率など値が低い方が良い指標も、レーダー上は「優れているほど100に近づく」ようにスコアを逆算して設定すること。
4. 改行・文字数ルール: テロップ(text)は1行あたり8文字程度で \\n を入れ、最大3〜4行で構成すること。また、文末の句点（。）は付けないこと。
5. テーマカラー(theme): 球団に合わせ、orange, blue, red, yellow, green, purple から選択。
6. \`playerType\`: "${projectData.playerType}" に設定してください。
7. \`presentationMode\`: "${projectData.presentationMode}" に設定してください。
${isDialogue ? '8. 対話形式: scriptsの speaker プロパティに "A" (冷静なアナリスト) と "B" (聞き手のファン) を交互に指定して対話形式にしてください。\n9. 感情絵文字: scriptsの各行に \`emoji\` プロパティを追加してください。Aは "👨‍🏫" 固定、Bは感情を表す顔だけの絵文字（😲、🤔、😭、🤩など）を指定。' : '8. 一人語り: scriptsの speaker, emoji は省略または null にしてください。'}

【JSONスキーマ・テンプレート】
${JSON.stringify(projectData.playerType === 'batter' ? defaultBatterData : defaultPitcherData, null, 2)}
`;
    const textArea = document.createElement("textarea");
    textArea.value = prompt;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand('copy');
      setCopyStatus('AI指示用プロンプトをコピーしました！ChatGPT等に貼り付けてください');
      setTimeout(() => setCopyStatus(''), 4000);
    } catch (err) {
      setJsonError('クリップボードへのコピーに失敗しました。');
      console.error('Fallback: Oops, unable to copy', err);
    }

    document.body.removeChild(textArea);
  };

  return (
    <div className={`min-h-screen ${isFullscreenMode ? 'bg-black flex justify-center items-center' : 'bg-zinc-100 p-4 md:p-8 flex flex-col md:flex-row gap-6'} font-sans transition-colors duration-500 overflow-hidden`}>
      <GlobalStyles />
      
      {!isFullscreenMode && (
        <div className={`w-full md:w-[450px] lg:w-[500px] bg-white rounded-xl shadow-xl flex flex-col overflow-hidden border border-zinc-200 shrink-0 transition-all duration-300 ${isPanelOpen ? 'h-auto md:h-[90vh]' : 'h-auto'}`}>
          <div className="bg-zinc-800 p-4 flex items-center justify-between shadow-md z-10 cursor-pointer select-none" onClick={() => setIsPanelOpen(!isPanelOpen)}>
            <h2 className="text-white font-bold flex items-center gap-2">
              <Settings size={18} /> 量産フォーマット <span className="text-[10px] bg-indigo-600 px-1.5 py-0.5 rounded ml-1">v4.24.0</span>
            </h2>
            <div className="flex items-center gap-3">
              <button onClick={(e) => { e.stopPropagation(); setIsFullscreenMode(true); }} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded flex items-center gap-1 transition shadow">
                <Maximize2 size={12} /> プレビュー拡大
              </button>
              {isPanelOpen ? <ChevronUp size={18} className="text-white" /> : <ChevronDown size={18} className="text-white" />}
            </div>
          </div>

          {isPanelOpen && (
            <>
              <div className="flex border-b bg-zinc-50 shrink-0">
                {[
                  { id: 'json', icon: <Code size={14}/>, label: 'JSON入出力' },
                  { id: 'script', icon: <FileText size={14}/>, label: '台本直接編集' },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${activeTab === tab.id ? `border-indigo-600 text-indigo-700 bg-white` : `border-transparent text-zinc-500 hover:bg-zinc-100`}`}>
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto bg-zinc-50 relative custom-scrollbar">
                {activeTab === 'json' && (
                  <div className="p-4 flex flex-col h-full">
                    
                    <div className="flex gap-2 mb-3">
                      <button onClick={() => loadTemplate('batter')} className={`flex-1 text-xs font-bold py-2 rounded transition border shadow-sm ${projectData.playerType === 'batter' ? 'bg-orange-50 text-orange-700 border-orange-300' : 'bg-white text-zinc-600 border-zinc-200'}`}>⚾ 野手テンプレ</button>
                      <button onClick={() => loadTemplate('pitcher')} className={`flex-1 text-xs font-bold py-2 rounded transition border shadow-sm ${projectData.playerType === 'pitcher' ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-zinc-600 border-zinc-200'}`}>⚾ 投手テンプレ</button>
                    </div>

                    <button onClick={handleCopyAIPrompt} className="w-full mb-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold py-3 rounded-lg shadow-md flex items-center justify-center gap-2 transition transform active:scale-[0.98]">
                      <Sparkles size={16}/> 🤖 AIプロンプトを作成＆コピー
                    </button>
                    
                    <div className="flex gap-2 mb-2">
                      <button onClick={handleJsonClear} className="flex-[0.5] bg-zinc-200 hover:bg-zinc-300 text-zinc-700 text-xs font-bold py-2 rounded shadow-sm flex items-center justify-center gap-1 transition">
                        <Trash2 size={14}/> クリア
                      </button>
                      <button onClick={handleJsonPasteAndApply} className="flex-[1] bg-zinc-200 hover:bg-zinc-300 text-zinc-700 text-xs font-bold py-2 rounded shadow-sm flex items-center justify-center gap-1 transition">
                        <ClipboardPaste size={14}/> 貼り付けて反映
                      </button>
                      <button onClick={handleJsonApply} className="flex-[0.8] bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold py-2 rounded shadow-sm flex items-center justify-center gap-1 transition">
                        <Check size={14}/> 手動で反映
                      </button>
                    </div>

                    {copyStatus && <div className="text-emerald-600 text-[10px] font-bold text-center mb-2 animate-pulse">{copyStatus}</div>}
                    {jsonError && <div className="text-red-500 text-[10px] font-bold mb-2 flex items-center gap-1 bg-red-50 p-2 rounded"><AlertCircle size={12}/> {jsonError}</div>}
                    <textarea className="flex-1 w-full bg-[#1e1e1e] text-[#d4d4d4] font-mono text-[11px] p-3 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 custom-scrollbar shadow-inner" value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} spellCheck="false" />
                  </div>
                )}
                {activeTab === 'script' && (
                  <div className="p-4">
                    <div className="flex flex-col gap-3 bg-white p-3 rounded border shadow-sm mb-4">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-zinc-600 flex items-center gap-2"><Mic2 size={14}/>プレビュー用 AI音声</span>
                        <button onClick={() => setIsVoiceEnabled(!isVoiceEnabled)} className={`p-1.5 rounded-full transition ${isVoiceEnabled ? 'bg-indigo-100 text-indigo-600' : 'bg-zinc-200 text-zinc-500'}`}>
                          {isVoiceEnabled ? <Volume2 size={16}/> : <VolumeX size={16}/>}
                        </button>
                      </div>
                      {isVoiceEnabled && (
                        <div className="flex items-center justify-between bg-zinc-50 p-2 rounded w-full gap-1">
                          <div className="flex items-center gap-1.5">
                            <Gauge size={14} className="text-zinc-500" />
                            <span className="text-[10px] font-bold text-zinc-500 mr-1">速さ</span>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            <button onClick={() => setSpeechRate(p => Math.max(0.5, parseFloat((p - 0.5).toFixed(2))))} className="px-1.5 py-0.5 bg-zinc-200 hover:bg-zinc-300 rounded text-[10px] font-bold text-zinc-600 transition">-0.5</button>
                            <button onClick={() => setSpeechRate(p => Math.max(0.5, parseFloat((p - 0.1).toFixed(2))))} className="px-1.5 py-0.5 bg-zinc-200 hover:bg-zinc-300 rounded text-[10px] font-bold text-zinc-600 transition">-0.1</button>
                          </div>
                          
                          <input 
                            type="range" 
                            min="0.5" 
                            max="2.5" 
                            step="0.05" 
                            value={speechRate} 
                            onChange={(e) => setSpeechRate(parseFloat(e.target.value))} 
                            className="w-20 cursor-pointer accent-indigo-500"
                          />
                          
                          <div className="flex items-center gap-1">
                            <button onClick={() => setSpeechRate(p => Math.min(2.5, parseFloat((p + 0.1).toFixed(2))))} className="px-1.5 py-0.5 bg-zinc-200 hover:bg-zinc-300 rounded text-[10px] font-bold text-zinc-600 transition">+0.1</button>
                            <button onClick={() => setSpeechRate(p => Math.min(2.5, parseFloat((p + 0.5).toFixed(2))))} className="px-1.5 py-0.5 bg-zinc-200 hover:bg-zinc-300 rounded text-[10px] font-bold text-zinc-600 transition">+0.5</button>
                          </div>
                          
                          <span className="text-[11px] font-mono font-black text-indigo-600 min-w-[32px] text-right">x{speechRate.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      {projectData.scripts.map((script, idx) => (
                        <div key={script.id} className={`bg-white border rounded-lg p-3 shadow-sm transition-all ${currentIndex === idx ? `ring-2 ring-indigo-400 bg-indigo-50/30` : ''}`}>
                          <div className="flex justify-between items-center mb-2 border-b pb-1">
                             <span className="text-[10px] font-bold text-zinc-400">シーン {idx + 1}</span>
                             {projectData.presentationMode === 'dialogue' && (
                               <div className="flex items-center gap-1.5">
                                 <input 
                                   type="text" 
                                   maxLength={2} 
                                   value={script.emoji || ''} 
                                   onChange={(e) => handleScriptChange(script.id, 'emoji', e.target.value)}
                                   className="w-7 h-7 text-[14px] flex items-center justify-center text-center bg-zinc-100 border border-zinc-200 outline-none rounded-full cursor-pointer shadow-sm focus:ring-1 focus:ring-indigo-400"
                                   placeholder="😀"
                                   title="表情絵文字"
                                 />
                                 <select 
                                   value={script.speaker || 'A'} 
                                   onChange={(e) => handleScriptChange(script.id, 'speaker', e.target.value)}
                                   className="text-[10px] bg-zinc-100 px-2 py-0.5 border-none outline-none font-bold text-zinc-600 rounded cursor-pointer"
                                 >
                                   <option value="A">スピーカー A</option>
                                   <option value="B">スピーカー B</option>
                                 </select>
                               </div>
                             )}
                          </div>
                          <textarea value={script.text} onChange={(e) => handleScriptChange(script.id, 'text', e.target.value)} className="w-full text-[12px] font-bold text-zinc-800 bg-transparent border-none outline-none leading-relaxed" rows={3} />
                          <div className="flex items-center gap-1.5 mt-2">
                            <span className="text-[10px]">🔊</span>
                            <input type="text" value={script.speech} onChange={(e) => handleScriptChange(script.id, 'speech', e.target.value)} className="w-full text-[10px] text-zinc-600 bg-zinc-50 p-1.5 rounded border border-dashed outline-none" placeholder="読み上げ用テキスト" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* プレビュー本体 */}
      <div className={`flex flex-col items-center justify-start transition-all duration-500 ${isFullscreenMode ? 'w-full h-[100dvh] justify-center bg-black' : 'flex-1 pt-2'}`}>
        
        {isFullscreenMode && (
          <div className={`absolute top-4 left-4 z-[100] flex gap-2 transition-opacity duration-300 ${isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
            <button onClick={() => setIsFullscreenMode(false)} className="bg-zinc-800/80 hover:bg-zinc-700 text-white p-2.5 rounded-full backdrop-blur-md transition shadow-xl border border-white/10" title="縮小画面に戻る"><Monitor size={20} /></button>
            <button onClick={togglePlay} className={`${isPlaying ? 'bg-red-500' : themeClass.bg} text-white p-2.5 rounded-full shadow-xl transition-colors`} title="再生/停止">{isPlaying ? <Square size={20} /> : <Play size={20} />}</button>
          </div>
        )}

        <div className={`relative bg-[#0d0d0f] flex flex-col font-sans overflow-hidden shadow-2xl transition-all duration-500 ${isFullscreenMode ? 'h-[95vh] aspect-[9/16]' : 'w-full max-w-[420px] aspect-[9/16] rounded-[2rem] border-[6px] border-zinc-900 ring-4 ring-black/5'}`}>
          
          <div className={`absolute inset-0 z-50 bg-black/20 backdrop-blur-[1px] flex flex-col items-center justify-center px-6 transition-opacity duration-300 ${currentScript?.isCatchy ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            {currentScript?.isCatchy && (
              <div className="w-full font-black text-[38px] leading-[1.25] text-center tracking-tighter animate-shake" style={{ textShadow: '3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 0px 10px 25px rgba(0,0,0,1)' }}>
                {renderFormattedText(currentScript.text, currentScript.isCatchy, projectData.presentationMode === 'dialogue' ? currentScript.speaker : null)}
              </div>
            )}
          </div>

          <div className="pt-4 pb-0 px-4 flex flex-col items-center relative z-20">
            <div className="absolute top-2 left-4 flex items-center gap-1 opacity-90">
              <span className={`${themeClass.text} font-black italic text-2xl leading-none`}>G</span><span className="text-zinc-400 font-bold text-[8px] tracking-widest mt-1 uppercase">Analytics</span>
            </div>
            <div className={`absolute top-3 right-4 ${themeClass.text} opacity-80 text-[8px] font-bold flex items-center gap-1`}><Activity size={10} className="animate-pulse" /> {projectData.period}</div>
            <div className="flex items-center gap-2 mt-0 mb-0">
              <span className={`w-7 h-7 ${themeClass.bg} text-white font-black text-sm rounded-lg flex items-center justify-center shadow-[0_0_15px_${themeClass.glow}]`}>{projectData.mainPlayer.number}</span>
              <span className={`${themeClass.text} text-[34px] font-black tracking-tighter leading-none`}>{projectData.mainPlayer.name}</span>
            </div>
          </div>

          <div key={`zoom-${animationKey}`} className="flex-1 flex flex-col justify-start relative z-10 w-full pt-1 pb-2">
            <div key={`bg-${animationKey}`} className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] opacity-10" style={{ animation: isPlaying ? 'bgScroll 60s linear infinite' : 'none' }}></div>
            
            <div className="absolute top-1 left-4 z-20 flex flex-col items-start gap-0.5">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded leading-none ${themeClass.bg} text-white shadow-md`}>{projectData.mainPlayer.label}</span>
            </div>
            <div className="absolute top-1 right-4 z-20 flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] font-black bg-zinc-700/80 text-zinc-300 px-1.5 py-0.5 rounded shadow-sm">比較</span>
                <span className="text-zinc-300 text-[12px] font-black drop-shadow-md">{projectData.subPlayer.name}</span>
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded leading-none bg-zinc-700 text-zinc-300 shadow-md`}>{projectData.subPlayer.label}</span>
            </div>

            {/* 🚨 チャートを1ミリ下げ(mt-3)、テーブルとの距離を広げるために -mb-20 -> -mb-16 に */}
            <div className="flex justify-center transform scale-[0.55] origin-top relative mt-3 -mb-16 pointer-events-none z-10">
              <PentagonRadarChart stats={projectData.radarStats} highlight={currentScript?.highlight} themeColor={projectData.theme} />
              <div className={`absolute inset-0 ${themeClass.bg} opacity-5 blur-[40px] rounded-full -z-10`}></div>
            </div>

            {/* 🚨 テーブルを少し下げる（-mt-2を削除） */}
            <div className="z-20 w-full px-3 flex flex-col bg-zinc-900/90 rounded-xl border border-zinc-700/50 overflow-hidden shadow-2xl backdrop-blur-sm relative">
              <div className="flex bg-zinc-800/30 border-b border-zinc-700/80">
                {projectData.playerType === 'batter' ? (
                  <>
                    <div className="w-[48%] flex flex-col justify-center py-1 border-r border-zinc-700/50 bg-zinc-800/60 relative px-2">
                      <div className={`absolute top-0 left-0 w-full h-0.5 ${themeClass.bg}`}></div>
                      <div className="flex items-center justify-between mb-1.5 w-full">
                        <span className={`${themeClass.text} text-[11px] font-black leading-none whitespace-nowrap`}>{projectData.mainPlayer.stats.pa}<span className="text-[8px]">打席</span> <span className="opacity-70">{projectData.mainPlayer.stats.ab}<span className="text-[8px]">打数</span></span></span>
                        <span className="text-white text-[11px] font-mono font-black"><span className={`text-[8px] ${themeClass.text} mr-0.5`}>OPS</span>{projectData.mainPlayer.stats.ops}</span>
                      </div>
                      <div className="flex items-center justify-between w-full">
                        <span className="text-white text-[11px] font-mono font-black"><span className="text-[8px] text-zinc-400 mr-0.5">率</span>{projectData.mainPlayer.stats.avg}</span>
                        <span className="text-white text-[11px] font-mono font-black">{projectData.mainPlayer.stats.hr}<span className="text-[8px] text-zinc-400 ml-0.5">本</span></span>
                        <span className="text-white text-[11px] font-mono font-black">{projectData.mainPlayer.stats.rbi}<span className="text-[8px] text-zinc-400 ml-0.5">点</span></span>
                      </div>
                    </div>
                    <div className="w-[52%] flex flex-col justify-center py-1 relative opacity-70 px-2 pr-6">
                      <div className={`absolute top-0 left-0 w-full h-0.5 bg-zinc-500`}></div>
                      <div className="flex items-center justify-between mb-1.5 w-full">
                        <span className={`text-zinc-400 text-[11px] font-black leading-none whitespace-nowrap`}>{projectData.subPlayer.stats.pa}<span className="text-[8px]">打席</span> <span className="opacity-70">{projectData.subPlayer.stats.ab}<span className="text-[8px]">打数</span></span></span>
                        <span className="text-zinc-100 text-[11px] font-mono font-black"><span className={`text-[8px] text-zinc-500 mr-0.5`}>OPS</span>{projectData.subPlayer.stats.ops}</span>
                      </div>
                      <div className="flex items-center justify-between w-full">
                        <span className="text-zinc-100 text-[11px] font-mono font-black"><span className="text-[8px] text-zinc-500 mr-0.5">率</span>{projectData.subPlayer.stats.avg}</span>
                        <span className="text-zinc-100 text-[11px] font-mono font-black">{projectData.subPlayer.stats.hr}<span className="text-[8px] text-zinc-500 ml-0.5">本</span></span>
                        <span className="text-zinc-100 text-[11px] font-mono font-black">{projectData.subPlayer.stats.rbi}<span className="text-[8px] text-zinc-500 ml-0.5">点</span></span>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-[48%] flex flex-col justify-center py-1 border-r border-zinc-700/50 bg-zinc-800/60 relative px-2">
                      <div className={`absolute top-0 left-0 w-full h-0.5 ${themeClass.bg}`}></div>
                      <div className="flex items-center justify-between mb-1.5 w-full">
                        <span className={`${themeClass.text} text-[11px] font-black leading-none whitespace-nowrap`}>{projectData.mainPlayer.stats.g}<span className="text-[8px]">登</span> <span className="opacity-70">{projectData.mainPlayer.stats.ip}<span className="text-[8px]">回</span></span></span>
                        <span className="text-white text-[11px] font-mono font-black flex items-center gap-1 tracking-tighter">
                          <span>{projectData.mainPlayer.stats.win}<span className="text-[7px] text-zinc-400">勝</span>{projectData.mainPlayer.stats.lose}<span className="text-[7px] text-zinc-400">敗</span></span>
                          <span>{projectData.mainPlayer.stats.sv}<span className="text-[7px] text-zinc-400">S</span>{projectData.mainPlayer.stats.hld}<span className="text-[7px] text-zinc-400">H</span></span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between w-full">
                        <span className="text-white text-[11px] font-mono font-black"><span className="text-[8px] text-zinc-400 mr-0.5">防</span>{projectData.mainPlayer.stats.era}</span>
                        <span className="text-white text-[11px] font-mono font-black"><span className="text-[8px] text-zinc-400 mr-0.5">WHIP</span>{projectData.mainPlayer.stats.whip}</span>
                        <span className="text-white text-[11px] font-mono font-black">{projectData.mainPlayer.stats.so}<span className="text-[8px] text-zinc-400 ml-0.5">K</span></span>
                      </div>
                    </div>
                    <div className="w-[52%] flex flex-col justify-center py-1 relative opacity-70 px-2 pr-6">
                      <div className={`absolute top-0 left-0 w-full h-0.5 bg-zinc-500`}></div>
                      <div className="flex items-center justify-between mb-1.5 w-full">
                        <span className={`text-zinc-400 text-[11px] font-black leading-none whitespace-nowrap`}>{projectData.subPlayer.stats.g}<span className="text-[8px]">登</span> <span className="opacity-70">{projectData.subPlayer.stats.ip}<span className="text-[8px]">回</span></span></span>
                        <span className="text-zinc-100 text-[11px] font-mono font-black flex items-center gap-1 tracking-tighter">
                          <span>{projectData.subPlayer.stats.win}<span className="text-[7px] text-zinc-500">勝</span>{projectData.subPlayer.stats.lose}<span className="text-[7px] text-zinc-500">敗</span></span>
                          <span>{projectData.subPlayer.stats.sv}<span className="text-[7px] text-zinc-500">S</span>{projectData.subPlayer.stats.hld}<span className="text-[7px] text-zinc-500">H</span></span>
                        </span>
                      </div>
                      <div className="flex items-center justify-between w-full">
                        <span className="text-zinc-100 text-[11px] font-mono font-black"><span className="text-[8px] text-zinc-500 mr-0.5">防</span>{projectData.subPlayer.stats.era}</span>
                        <span className="text-zinc-100 text-[11px] font-mono font-black"><span className="text-[8px] text-zinc-500 mr-0.5">WHIP</span>{projectData.subPlayer.stats.whip}</span>
                        <span className="text-zinc-100 text-[11px] font-mono font-black">{projectData.subPlayer.stats.so}<span className="text-[8px] text-zinc-500 ml-0.5">K</span></span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-col">
                {projectData.comparisons.map((comp) => {
                  const isH = currentScript?.highlight === comp.id;
                  const isDimmed = !!currentScript?.highlight && !isH;
                  const isMainWinner = comp.winner === 'main';
                  const isSubWinner = comp.winner === 'sub';

                  const highlightStyle = isH ? { background: `linear-gradient(to right, rgba(${hexToRgb(primaryColorHex)}, 0.25), rgba(39,39,42,0.6), transparent)` } : {};

                  return (
                    <div key={comp.id} className={`flex justify-between items-center border-b border-zinc-800/80 transition-all duration-300 relative ${isH ? `scale-[1.03] z-20 shadow-xl py-1.5 border-transparent` : isDimmed ? 'opacity-40 py-0.5 scale-[0.98]' : 'py-1 bg-transparent'}`} style={highlightStyle}>
                      {isH && <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${themeClass.bg} shadow-[0_0_12px_${themeClass.glow}]`}></div>}
                      
                      <div className="w-[28%] flex items-baseline justify-end gap-0.5 pr-2">
                        <span className={`font-mono transition-all duration-300 tracking-tighter ${isMainWinner ? `font-black ${isH ? 'text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]' : `${themeClass.text} drop-shadow-[0_0_8px_${themeClass.glow}]`}` : `font-bold ${themeClass.text} opacity-50`} ${isH ? 'animate-[valueBounce_0.4s_ease-out] text-[26px]' : 'text-[18px]'}`}>
                          {comp.valMain}
                        </span>
                        {comp.unit && <span className={`text-[7px] font-bold mb-0.5 ${comp.winner === 'main' ? (isH ? 'text-white' : themeClass.text) : `${themeClass.text} opacity-40`}`}>{comp.unit}</span>}
                      </div>
                      
                      <div className={`w-[42%] flex flex-col items-center justify-center transition-all ${isH ? 'bg-zinc-950/40 rounded-lg p-1.5 border border-zinc-700/50' : ''}`}>
                        {isH && comp.radarMatch && (
                           <div className={`text-[7px] font-black text-white ${themeClass.bg} px-1.5 py-[1px] rounded mb-1 animate-[fadeInUp_0.2s_ease-out_forwards]`}>
                             📊 チャート: {comp.radarMatch}
                           </div>
                        )}
                        {isH && <span className={`text-[8px] font-black tracking-widest mb-0.5 ${themeClass.text} animate-[fadeInUp_0.2s_ease-out_forwards]`}>{comp.kana}</span>}
                        <span className={`text-[12px] font-black tracking-wider leading-none transition-colors duration-300 ${isH ? 'text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]' : 'text-zinc-400'}`}>{comp.label}</span>
                        {!isH && <span className={`text-[7px] mt-0.5 font-bold text-center leading-tight transition-colors ${isDimmed ? 'text-zinc-600' : 'text-zinc-500'}`}>{comp.desc}</span>}
                        {isH && (
                          <div className="flex flex-col items-center mt-0.5 w-full animate-[fadeInUp_0.3s_ease-out_forwards]">
                            {comp.formula && <div className="text-[7.5px] font-bold text-zinc-300 bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/80 w-full text-center whitespace-nowrap">{comp.formula}</div>}
                            {comp.criteria && <div className={`text-[7.5px] font-black ${themeClass.text} whitespace-nowrap mt-0.5`}>{comp.criteria}</div>}
                          </div>
                        )}
                      </div>

                      <div className="w-[30%] flex items-baseline justify-start gap-0.5 pl-2 pr-6">
                        <span className={`font-mono transition-all duration-300 tracking-tighter ${isSubWinner ? `font-black ${isH ? 'text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.8)]' : 'text-zinc-100 drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]'}` : 'font-bold text-zinc-600'} ${isH ? 'animate-[valueBounce_0.4s_ease-out] text-[26px]' : 'text-[18px]'}`}>
                          {comp.valSub}
                        </span>
                        {comp.unit && <span className={`text-[7px] font-bold mb-0.5 ${comp.winner === 'sub' ? (isH ? 'text-white' : 'text-zinc-300') : 'text-zinc-600'}`}>{comp.unit}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {projectData.presentationMode === 'dialogue' && !currentScript?.isCatchy && (
            <>
              <div className={`absolute bottom-[14%] left-4 flex flex-col items-center transition-all duration-300 ${currentScript?.speaker === 'A' ? 'scale-110 opacity-100 z-40' : 'scale-90 opacity-40 z-30'}`}>
                <div className={`w-12 h-12 rounded-full border-2 ${currentScript?.speaker === 'A' ? themeClass.border : 'border-zinc-600'} flex items-center justify-center bg-zinc-900 shadow-lg relative overflow-hidden`}>
                  {currentScript?.speaker === 'A' && <div className={`absolute inset-0 ${themeClass.bg} opacity-20 animate-pulse`}></div>}
                  <span className="text-[26px] leading-none transform translate-y-[1px] drop-shadow-md z-10">{currentEmojiA}</span>
                </div>
              </div>

              <div className={`absolute bottom-[14%] right-14 flex flex-col items-center transition-all duration-300 ${currentScript?.speaker === 'B' ? 'scale-110 opacity-100 z-40' : 'scale-90 opacity-40 z-30'}`}>
                <div className={`w-12 h-12 rounded-full border-2 ${currentScript?.speaker === 'B' ? 'border-sky-500' : 'border-zinc-600'} flex items-center justify-center bg-zinc-900 shadow-lg relative overflow-hidden`}>
                   {currentScript?.speaker === 'B' && <div className={`absolute inset-0 bg-sky-500 opacity-20 animate-pulse`}></div>}
                   <span className="text-[26px] leading-none transform translate-y-[1px] drop-shadow-md z-10">{currentEmojiB}</span>
                </div>
              </div>
            </>
          )}

          <div className={`absolute bottom-[14%] left-0 w-full flex flex-col justify-center items-center pl-[76px] pr-[116px] z-30 pointer-events-none transition-opacity duration-300 ${currentScript?.isCatchy ? 'opacity-0' : 'opacity-100'}`}>
            {!currentScript?.isCatchy && (
              <div key={currentIndex} className="w-full flex flex-col items-center animate-[fadeInUp_0.2s_ease-out_forwards]">
                <div className="w-full font-black text-[24px] leading-[1.25] text-center tracking-tight" style={{ textShadow: '2px 2px 2px #000, -2px -2px 2px #000, 2px -2px 2px #000, -2px 2px 2px #000, 0px 8px 15px rgba(0,0,0,1)' }}>
                  {renderFormattedText(currentScript?.text, currentScript?.isCatchy, projectData.presentationMode === 'dialogue' ? currentScript?.speaker : null)}
                </div>
              </div>
            )}
          </div>
          
          <div className="absolute bottom-2 w-full text-center text-[9px] text-zinc-500 font-bold z-40 tracking-widest pointer-events-none">出典: NPB＋・スポーツナビ</div>
          <div className="h-1.5 flex z-30 absolute bottom-0 w-full bg-zinc-900">
            <div className={`h-full ${themeClass.bg} shadow-[0_0_10px_${themeClass.glow}] transition-all duration-300 ease-linear`} style={{ width: `${((currentIndex) / (projectData.scripts.length - 1)) * 100}%` }}></div>
          </div>
        </div>

        {!isFullscreenMode && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <div className="flex items-center gap-5 bg-white px-6 py-3 rounded-full shadow-lg border border-zinc-200">
              <button onClick={togglePlay} className={`w-14 h-14 ${themeClass.bg} hover:opacity-90 rounded-full flex items-center justify-center text-white shadow-lg transition-transform active:scale-90`}>{isPlaying ? <Square size={24} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}</button>
              <div className="flex flex-col items-center justify-center w-24">
                <span className="text-zinc-800 font-mono text-2xl font-black leading-none">00:{elapsedTime.toString().padStart(2, '0')}</span>
                <span className="text-zinc-400 font-bold text-[10px] mt-1">SCENE {currentIndex + 1} / {projectData.scripts.length}</span>
              </div>
              <button onClick={resetPlay} className="text-zinc-400 hover:text-zinc-800 bg-zinc-100 hover:bg-zinc-200 p-3 rounded-full transition"><RotateCcw size={18} /></button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};

export default App;

