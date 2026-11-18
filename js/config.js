/* ==========================================================================
 * CHAIN SLASH : 絶・一閃 (ZETSU-ISSEN)
 * [3] js/config.js — 定数・カラーパレット・刀4種・スキル8種＋極意進化8種・
 *                    ステージ3幕＋EX・道場データ定義
 * 公開: window.ZetsuIssen.Config / window.ZetsuIssen.Util
 * ========================================================================== */
(function () {
  'use strict';
  const ZI = (window.ZetsuIssen = window.ZetsuIssen || {});

  /* ------------------------------------------------------------------------
   * 2.1 カラーパレット厳密定義
   * ---------------------------------------------------------------------- */
  const COLORS = {
    bgInkDeep: '#07080C',          // --bg-ink-deep
    bgInkSlow: '#030406',          // --bg-ink-slow
    decalInk: 'rgba(18, 22, 32, 0.75)', // --decal-ink
    bladeWhite: '#F8FAFC',         // --blade-white (芯)
    bladeGlow: '#00F0FF',          // --blade-white (外光)
    crimson: '#FF1E42',            // --neon-crimson
    gold: '#FFBE2E',               // --neon-gold
    jade: '#00E5A3',               // --neon-jade
    cyan: '#00F0FF',               // --neon-cyan
    voidCore: '#FFFFFF',           // --void-slash 断面線
    voidEdge: '#FF1E42',           // --void-slash 亀裂縁
    uiPanel: 'rgba(10, 12, 18, 0.88)',
    uiBorder: 'rgba(255, 190, 46, 0.28)',
    // 第壱奥義 白黒反転
    paper: '#F3F4F6',
    ink: '#090A0F',
    // 専用色（紫電／雷属性のみ許可）
    shiden: '#D946EF',
    // 敵固有色
    ashigaru: '#FF8A1E',
    oniArmor: '#E8ECF2',
    steel: '#1A1F2B',
    steelLight: '#2A3142'
  };

  /* ------------------------------------------------------------------------
   * 入力・物理パラメータ
   * ---------------------------------------------------------------------- */
  const PARAMS = {
    // 3.1 入力ステートマシン
    HOLD_THRESHOLD_MS: 140,
    FLICK_MIN_DIST: 12,
    DRAG_IAI_DIST: 90,
    DRAG_IAI_TOUCH_COUNT: 2,

    // 3.2 アクションB：迅雷
    PINBALL_DASH_DIST: 260,
    PINBALL_HOMING_RANGE: 320,
    PINBALL_HOMING_ANGLE: 28,          // 度
    PINBALL_DASH_TIME: 0.045,
    PINBALL_INVULN: 0.25,
    PINBALL_CAPSULE_WIDTH: 38,
    PINBALL_DAMAGE: 1.5,
    PINBALL_FOCUS_GAIN: 18,
    CHAIN_WINDOW: 0.35,
    CHAIN_TIMESCALE: 0.20,
    CHAIN_STEP_BONUS: 0.08,
    CHAIN_STEP_MAX: 0.80,
    FLICK_COOLDOWN: 0.12,

    // 3.3 アクションA：居合
    IAI_TIMESCALE: 0.12,
    FOCUS_MAX: 100,
    FOCUS_REGEN: 45,
    FOCUS_COST_PER_PX: 0.045,
    FOCUS_COST_PER_SEC: 12,
    FOCUS_LOCK_GAIN: 22,
    LOCK_RADIUS: 46,
    IAI_DASH_PER_TARGET_MIN: 0.015,
    IAI_DASH_PER_TARGET_MAX: 0.03,
    SHEATHE_PAUSE: 0.12,
    SHEATHE_MIN_LOCKS: 3,
    IAI_DAMAGE: 1.0,
    IAI_BLAST_RADIUS: 50,
    IAI_BLAST_DAMAGE: 0.5,
    BOSS_MAX_LOCKS_PER_STROKE: 14,

    // 3.4 アクションD：次元斬
    VOID_DUR_MIN: 2.0,
    VOID_DUR_MAX: 3.5,
    VOID_WIDTH: 10,
    VOID_SHIFT: 12,
    VOID_TICK: 0.2,
    VOID_TICK_DAMAGE: 0.6,
    VOID_CLOSE_WIDTH: 90,
    VOID_CLOSE_DAMAGE: 2.5,
    VOID_MAX: 140,

    // 3.5 弾斬り
    BULLET_RADIUS: 7,
    KUNAI_SPEED: 620,
    KUNAI_DAMAGE: 1.0,
    PARRY_COMBO: 2,

    // 4.2 フェーズ進化
    PHASE2_PINBALL_MULT: 1.4,
    PHASE2_SHOCKWAVE_RADIUS: 75,
    PHASE2_LOCK_MULT: 1.35,
    PHASE2_FOCUS_GAIN_MULT: 1.25,
    PHASE2_BLAST_MULT: 1.5,
    PHASE2_AUTO_VOID_LOCKS: 5,
    PHASE2_AUTO_VOID_DUR: 2.0,
    PHASE3_FOCUS_COST_MULT: 0.5,
    PHASE3_CLONE_HITS: 3,

    // 6. 奥義
    ULT_KILL: 1.8,
    ULT_ELITE: 8,
    ULT_PART_BREAK: 25,
    ULT_PARRY: 2.5,
    ULT_RANK_S_MULT: 1.5,
    ULT_MAX: 200,
    ULT100_DURATION: 3.2,
    ULT100_RIFTS_PER_SEC: 30,
    ULT100_FINISH: 15,
    ULT200_PULL: 1.2,
    ULT200_SWIPE: 1.5,
    ULT200_SILENCE: 0.18,
    ULT200_DAMAGE: 50,

    // 7.3 ボス
    ALL_BREAK_PCT: 0.18,
    ALL_BREAK_STUN: 4.0,
    ALL_BREAK_ULT: 40,
    EXECUTION_TIME: 2.5,
    BOSS_WARNING_TIME: 2.6,

    // 9.1 Juice
    HITSTOP_PINBALL: 25,
    HITSTOP_BIG: 160,
    ZOOM_HOLD: 1.04,
    ZOOM_PUNCH_MIN: 1.08,
    ZOOM_PUNCH_MAX: 1.14,
    ZOOM_RETURN: 0.25,
    SHAKE_MAX: 26,

    // プール上限
    PARTICLE_MAX: 800,
    TEXT_MAX: 80,
    DECAL_MAX: 140,
    SLICED_MAX: 140,
    GEM_MAX: 450,
    ENEMY_MAX: 160,
    DECAL_LIFE: 10,
    BISECT_TIME: 0.45,

    // 主人公
    PLAYER_RADIUS: 11,
    PLAYER_HAT_RADIUS: 14,
    PLAYER_RING_RADIUS: 22,
    PLAYER_MOVE_SPEED: 250,
    PLAYER_HIT_INVULN: 1.2,
    GEM_MAGNET: 95
  };

  /* ------------------------------------------------------------------------
   * 4.1 スタイルランク定義
   * ---------------------------------------------------------------------- */
  const STYLE_RANKS = [
    { id: 'C',   name: '抜刀', en: 'BATTO',  min: 0,   phase: 1, grace: 4.5, mult: 1.0, color: '#9AA4B8' },
    { id: 'B',   name: '疾風', en: 'SHIPPU', min: 10,  phase: 1, grace: 4.2, mult: 1.5, color: '#00E5A3' },
    { id: 'A',   name: '閃光', en: 'SENKO',  min: 25,  phase: 2, grace: 3.8, mult: 2.2, color: '#00F0FF' },
    { id: 'S',   name: '修羅', en: 'SHURA',  min: 50,  phase: 2, grace: 3.5, mult: 3.5, color: '#FFBE2E' },
    { id: 'SS',  name: '夜叉', en: 'YASHA',  min: 100, phase: 3, grace: 3.2, mult: 5.0, color: '#FF1E42' },
    { id: 'SSS', name: '鬼神', en: 'KISHIN', min: 200, phase: 3, grace: 3.0, mult: 8.0, color: '#FFBE2E' }
  ];

  const PHASE_LABELS = {
    1: { jp: '通常', en: 'PHASE 1' },
    2: { jp: '覚醒', en: 'PHASE 2' },
    3: { jp: '極限・次元斬', en: 'PHASE 3' }
  };

  /* ------------------------------------------------------------------------
   * 8.1 4振りの刀
   * ---------------------------------------------------------------------- */
  const BLADES = {
    byakuya: {
      id: 'byakuya', name: '無銘・白夜', en: 'BYAKUYA', cost: 0,
      color: '#00F0FF', core: '#F8FAFC', atk: 1.0, hits: 1, hp: 4, lockRadius: 46,
      dashMult: 1, widthMult: 1, focusCostMult: 1, alwaysVoid: false, startSkill: null, healPer100: false,
      style: '標準バランス型',
      desc: '基礎攻撃力1.0／初期HP4／ロックオン半径46px。すべてのアクションが高水準で使いやすい王道の一振り。'
    },
    guren: {
      id: 'guren', name: '双影・紅蓮', en: 'GUREN TWIN BLADES', cost: 800,
      color: '#FF1E42', core: '#FFE4E8', atk: 0.75, hits: 2, hp: 4, lockRadius: 46,
      dashMult: 1.35, widthMult: 1, focusCostMult: 1, alwaysVoid: false, startSkill: null, healPer100: false,
      style: 'アクションB特化・二刀流',
      desc: '攻撃力0.75×2回ヒット／HP4。迅雷の突進距離+35%、全斬撃が2連ヒット（コンボが2倍速で溜まる）。'
    },
    dankai: {
      id: 'dankai', name: '大太刀・断界', en: 'DANKAI GREAT KATANA', cost: 1800,
      color: '#FFBE2E', core: '#FFF6DE', atk: 1.6, hits: 1, hp: 5, lockRadius: 46,
      dashMult: 1, widthMult: 2, focusCostMult: 1, alwaysVoid: true, startSkill: null, healPer100: false,
      style: 'アクションD特化・空間破壊',
      desc: '攻撃力1.6／HP5。斬撃幅2倍。ランクに関わらず全ての居合と3連ピンボールの軌跡に次元斬が発生。'
    },
    shiden: {
      id: 'shiden', name: '妖刀・紫電', en: 'SHIDEN CURSED BLADE', cost: 3200,
      color: '#D946EF', core: '#00F0FF', atk: 1.4, hits: 1, hp: 3, lockRadius: 46,
      dashMult: 1, widthMult: 1, focusCostMult: 0.6, alwaysVoid: false, startSkill: 'lightning', healPer100: true,
      style: 'アクションA特化・超火力',
      desc: '攻撃力1.4／HP3。集中ゲージ消費40%軽減、雷鳴抜刀Lv1所持で開始。100チェインごとにHP1回復。'
    }
  };
  const BLADE_ORDER = ['byakuya', 'guren', 'dankai', 'shiden'];

  /* ------------------------------------------------------------------------
   * 5.2 ベーススキル8種（Lv1〜Lv5）
   * ---------------------------------------------------------------------- */
  const SKILLS = [
    {
      id: 'shadow', no: 1, name: '二天一流・影打', en: 'Shadow Clone', icon: '影',
      clones: [1, 1, 2, 2, 3], dmg: [0.40, 0.55, 0.70, 0.85, 1.00],
      levelDesc: (lv) => `斬撃後に影分身が追撃（分身${SKILL_TABLE.shadow.clones[lv - 1]}体／追撃${Math.round(SKILL_TABLE.shadow.dmg[lv - 1] * 100)}%）`
    },
    {
      id: 'lightning', no: 2, name: '雷鳴抜刀', en: 'Chain Lightning', icon: '雷',
      chains: [2, 3, 4, 5, 6], dmg: [0.60, 0.825, 1.05, 1.275, 1.50],
      levelDesc: (lv) => `斬った敵から紫電が連鎖（${SKILL_TABLE.lightning.chains[lv - 1]}体／雷${Math.round(SKILL_TABLE.lightning.dmg[lv - 1] * 100)}%）`
    },
    {
      id: 'wideIai', no: 3, name: '居合の極意', en: 'Wide Iai', icon: '極',
      radius: [0.20, 0.40, 0.60, 0.80, 1.00], focus: [0.15, 0.30, 0.45, 0.60, 0.75],
      levelDesc: (lv) => `ロックオン半径+${Math.round(SKILL_TABLE.wideIai.radius[lv - 1] * 100)}%／ロック時集中回復+${Math.round(SKILL_TABLE.wideIai.focus[lv - 1] * 100)}%`
    },
    {
      id: 'crescent', no: 4, name: '真空三日月波', en: 'Crescent Wave', icon: '月',
      count: [1, 2, 3, 4, 5], size: [1.0, 1.15, 1.3, 1.45, 1.6],
      levelDesc: (lv) => `迅雷・居合の終点から貫通真空刃（${SKILL_TABLE.crescent.count[lv - 1]}発／サイズ×${SKILL_TABLE.crescent.size[lv - 1].toFixed(2)}）`
    },
    {
      id: 'parry', no: 5, name: '弾返しの達人', en: 'Parry Master', icon: '返',
      kunai: [2, 3, 4, 5, 6], autoEvery: 10,
      levelDesc: (lv) => `弾斬り時の追尾クナイ${SKILL_TABLE.parry.kunai[lv - 1]}本＋10体撃破ごとにクナイ自動発射`
    },
    {
      id: 'crimson', no: 6, name: '紅蓮爆砕', en: 'Crimson Nova', icon: '爆',
      radius: [0.25, 0.50, 0.75, 1.00, 1.25],
      levelDesc: (lv) => `納刀爆発・衝撃波の半径+${Math.round(SKILL_TABLE.crimson.radius[lv - 1] * 100)}%／撃破時に誘爆`
    },
    {
      id: 'voidRift', no: 7, name: '虚空の裂け目', en: 'Void Rift', icon: '虚',
      chance: [0.20, 0.40, 0.60, 0.80, 1.00], dur: [1.5, 2.0, 2.5, 3.0, 3.5],
      levelDesc: (lv) => `全攻撃で${Math.round(SKILL_TABLE.voidRift.chance[lv - 1] * 100)}%の確率で次元斬を${SKILL_TABLE.voidRift.dur[lv - 1].toFixed(1)}秒残す`
    },
    {
      id: 'godspeed', no: 8, name: '神速の足捌き', en: 'Godspeed', icon: '速',
      dash: [0.20, 0.35, 0.50, 0.65, 0.80], regen: [0.30, 0.60, 0.90, 1.20, 1.50], magnet: [0.20, 0.40, 0.60, 0.80, 1.00],
      levelDesc: (lv) => `突進距離+${Math.round(SKILL_TABLE.godspeed.dash[lv - 1] * 100)}%／集中回復+${Math.round(SKILL_TABLE.godspeed.regen[lv - 1] * 100)}%／魂吸引+${Math.round(SKILL_TABLE.godspeed.magnet[lv - 1] * 100)}%`
    }
  ];
  const SKILL_TABLE = {};
  SKILLS.forEach((s) => { SKILL_TABLE[s.id] = s; });

  /* ------------------------------------------------------------------------
   * 5.2 極意進化8種（Awakening）
   * check(game) で解放条件を判定
   * ---------------------------------------------------------------------- */
  const AWAKENINGS = [
    {
      id: 'senju', base: 'shadow', name: '【極意】千手観音・無間連斬', icon: '千',
      cond: '二天一流・影打 Lv5 ＋ 神速の足捌き Lv1以上',
      desc: '分身が常時5体に増加。斬った敵に八方から分身が自動で乱舞斬りを浴びせ続ける。',
      check: (g) => g.skillLv('shadow') >= 5 && g.skillLv('godspeed') >= 1
    },
    {
      id: 'takemikazuchi', base: 'lightning', name: '【極意】建御雷・天罰落雷', icon: '神',
      cond: '雷鳴抜刀 Lv5 ＋ 居合の極意 Lv1以上',
      desc: '居合でロックした全敵に黄金の雷柱が落ち、画面内の全敵を電撃ネットで一斉感電させる。',
      check: (g) => g.skillLv('lightning') >= 5 && g.skillLv('wideIai') >= 1
    },
    {
      id: 'shinra', base: 'wideIai', name: '【極意】森羅万象・全天ロック', icon: '森',
      cond: '居合の極意 Lv5 ＋ 紅蓮爆砕 Lv1以上',
      desc: '長押し開始と同時に半径280px内の敵を自動一斉ロック。納刀爆発ダメージ2.5倍。',
      check: (g) => g.skillLv('wideIai') >= 5 && g.skillLv('crimson') >= 1
    },
    {
      id: 'amenomurakumo', base: 'crescent', name: '【極意】天叢雲・大車輪', icon: '叢',
      cond: '真空三日月波 Lv5 ＋ 虚空の裂け目 Lv1以上',
      desc: '真空波が画面端で反射し3秒間旋回。通過軌跡にミニ次元斬を残す。',
      check: (g) => g.skillLv('crescent') >= 5 && g.skillLv('voidRift') >= 1
    },
    {
      id: 'yata', base: 'parry', name: '【極意】八咫鏡・千本クナイ陣', icon: '鏡',
      cond: '弾返しの達人 Lv5 ＋ 累計30発以上の弾斬り',
      desc: '周囲に8本の回転光刃が展開し敵弾を自動パリィ。毎秒大量の追尾クナイをばら撒く。',
      check: (g) => g.skillLv('parry') >= 5 && g.run.totalParries >= 30
    },
    {
      id: 'kagutsuchi', base: 'crimson', name: '【極意】迦具土・連鎖超新星', icon: '迦',
      cond: '紅蓮爆砕 Lv5 ＋ 1回の居合で15体以上同時撃破',
      desc: '爆砕で倒れた敵が全て連鎖爆弾に変化し、画面端から端まで大誘爆が連鎖し続ける。',
      check: (g) => g.skillLv('crimson') >= 5 && g.run.maxIaiKills >= 15
    },
    {
      id: 'kokujo', base: 'voidRift', name: '【極意】次元崩壊・黒縄地獄', icon: '獄',
      cond: '虚空の裂け目 Lv5 ＋ スタイルランクSS以上到達',
      desc: '裂け目が敵を吸い寄せ、裂け目の交差点にミニブラックホールが発生して敵を粉砕する。',
      check: (g) => g.skillLv('voidRift') >= 5 && g.run.reachedSS
    },
    {
      id: 'shukuchi', base: 'godspeed', name: '【極意】縮地・光速残像陣', icon: '縮',
      cond: '神速の足捌き Lv5 ＋ 二天一流・影打 Lv1以上',
      desc: '軌跡に3秒燃える蒼炎の残像ラインを残し、迅雷が敵を自動で次々ホーミング連鎖する。',
      check: (g) => g.skillLv('godspeed') >= 5 && g.skillLv('shadow') >= 1
    }
  ];

  // 全スキル取得後の補充カード
  const FILLER_CARDS = [
    { id: 'heal', name: '気血回復', icon: '癒', desc: 'HPを1回復する（最大HPを超えない）。' },
    { id: 'ultCharge', name: '奥義充填', icon: '奥', desc: '奥義ゲージを+35%充填する。' },
    { id: 'scoreBlessing', name: '魂の加護', icon: '魂', desc: 'スコア+5000（現在のランク倍率が乗る）。' }
  ];

  /* ------------------------------------------------------------------------
   * 8.2 道場・永続ステータス強化
   * ---------------------------------------------------------------------- */
  const DOJO_UPGRADES = [
    { id: 'lockRadius',  name: '心眼', sub: 'ロックオン間合い', perLv: 0.08, unit: '%', fmt: (lv) => `ロックオン半径 +${lv * 8}%` },
    { id: 'focusMax',    name: '気合', sub: '最大集中力',       perLv: 0.10, unit: '%', fmt: (lv) => `集中最大値・回復 +${lv * 10}%` },
    { id: 'attackPower', name: '剛剣', sub: '基礎攻撃力',       perLv: 0.12, unit: '%', fmt: (lv) => `全ダメージ +${lv * 12}%` },
    { id: 'maxHp',       name: '金剛', sub: '初期シールド',     perLv: 1,    unit: '',  fmt: (lv) => `初期最大HP +${lv}` },
    { id: 'xpGain',      name: '吸魂', sub: '成長加速',         perLv: 0.15, unit: '%', fmt: (lv) => `魂吸引範囲・獲得XP +${lv * 15}%` },
    { id: 'startingUlt', name: '鬼脈', sub: '奥義充填',         perLv: 20,   unit: '%', fmt: (lv) => `開始時奥義ゲージ +${lv * 20}%` }
  ];
  const DOJO_COSTS = [150, 350, 700, 1300, 2200];
  const DOJO_MAX = 5;

  /* ------------------------------------------------------------------------
   * 7.2 通常敵パラメータ
   * ---------------------------------------------------------------------- */
  const ENEMIES = {
    spider:    { name: '笠蜘蛛',   r: 14, hp: 1, speed: 95,  xp: 1, score: 100, elite: false },
    ashigaru:  { name: '鉄砲足軽', r: 16, hp: 1, speed: 60,  xp: 1, score: 150, elite: false },
    ninja:     { name: '幻影忍',   r: 18, hp: 1, speed: 110, xp: 1, score: 150, elite: false },
    ninjaMini: { name: '幻影分身', r: 10, hp: 1, speed: 135, xp: 1, score: 60,  elite: false },
    lantern:   { name: '提灯お化け', r: 20, hp: 1, speed: 55, xp: 1, score: 180, elite: false },
    oni:       { name: '重装鬼',   r: 26, hp: 4, speed: 52,  xp: 4, score: 500, elite: true },
    ronin:     { name: '狂刃浪人', r: 20, hp: 3, speed: 135, xp: 4, score: 600, elite: true }
  };

  /* ------------------------------------------------------------------------
   * 7.3 巨大ボス
   * ---------------------------------------------------------------------- */
  const BOSSES = {
    centipede: { name: 'からくり大百足・黒鉄', en: 'MECHA-CENTIPEDE KUROGANE', hp: 240, cores: 4, segments: 8, segR: 28 },
    general:   { name: '六腕の重装鬼将・獄炎', en: 'SIX-ARMED GENERAL GOKUEN', hp: 330, cores: 6, bodyR: 52, armR: 20, orbit: 112 },
    saint:     { name: '次元喰らいの剣聖・無明', en: 'VOID SWORD SAINT MUMYO', hp: 420, cores: 6, bodyR: 34, mirrorR: 15, orbit: 92 }
  };

  /* ------------------------------------------------------------------------
   * 7.1 ステージ（全3幕＋EX）ウェーブ進行テーブル
   * spawns: { type: [間隔秒, 最小数, 最大数] }
   * ---------------------------------------------------------------------- */
  const STAGES = [
    {
      id: 0, key: 'act1', act: '第1幕', name: '竹林サイバー城下町', en: 'BAMBOO CYBER TOWN',
      duration: 180, theme: 'bamboo', boss: 'centipede', gimmicks: ['barrel'], gimmickEvery: 11, gimmickMax: 3,
      bgmRoot: 0,
      waves: [
        { t0: 0,   t1: 30,  spawns: { spider: [5.5, 8, 10], ashigaru: [8, 1, 1] } },
        { t0: 30,  t1: 75,  spawns: { spider: [5.0, 9, 13], ashigaru: [6, 1, 2], ninja: [7, 1, 2], lantern: [10, 1, 1] } },
        { t0: 75,  t1: 130, spawns: { spider: [4.5, 10, 14], ashigaru: [5, 1, 2], ninja: [6, 1, 2], lantern: [8, 1, 2], oni: [12, 1, 1] } },
        { t0: 130, t1: 181, spawns: { spider: [3.8, 12, 16], ashigaru: [4.5, 2, 3], ninja: [5, 2, 2], lantern: [7, 1, 2], oni: [9, 1, 2] } }
      ],
      bossAdds: { spider: [7, 8, 10] }
    },
    {
      id: 1, key: 'act2', act: '第2幕', name: '紅蓮の機械天守閣', en: 'CRIMSON MECHA CASTLE',
      duration: 240, theme: 'castle', boss: 'general', gimmicks: ['barrel', 'thunder'], gimmickEvery: 10, gimmickMax: 4,
      bgmRoot: 3,
      waves: [
        { t0: 0,   t1: 40,  spawns: { spider: [5.0, 9, 12], ashigaru: [6, 1, 2], ninja: [8, 1, 1] } },
        { t0: 40,  t1: 100, spawns: { spider: [4.6, 10, 14], ashigaru: [5, 1, 2], ninja: [6, 1, 2], lantern: [9, 1, 2], ronin: [11, 1, 1] } },
        { t0: 100, t1: 170, spawns: { spider: [4.2, 11, 15], ashigaru: [4.5, 2, 2], ninja: [5.5, 1, 2], lantern: [8, 1, 2], oni: [11, 1, 1], ronin: [9, 1, 1] } },
        { t0: 170, t1: 241, spawns: { spider: [3.5, 12, 16], ashigaru: [4, 2, 3], ninja: [5, 2, 3], lantern: [7, 1, 2], oni: [8, 1, 2], ronin: [7, 1, 2] } }
      ],
      bossAdds: { spider: [7, 8, 12], ashigaru: [11, 1, 1] }
    },
    {
      id: 2, key: 'act3', act: '最終幕', name: '虚空の異界・白夜城', en: 'VOID REALM BYAKUYA CASTLE',
      duration: 300, theme: 'void', boss: 'saint', gimmicks: ['crystal', 'barrel'], gimmickEvery: 10, gimmickMax: 4,
      bgmRoot: 5,
      waves: [
        { t0: 0,   t1: 50,  spawns: { spider: [4.8, 10, 13], ashigaru: [5.5, 1, 2], ninja: [7, 1, 2], lantern: [10, 1, 1] } },
        { t0: 50,  t1: 130, spawns: { spider: [4.3, 11, 15], ashigaru: [5, 2, 2], ninja: [6, 1, 2], lantern: [8, 1, 2], oni: [12, 1, 1], ronin: [10, 1, 1] } },
        { t0: 130, t1: 220, spawns: { spider: [3.8, 12, 16], ashigaru: [4.2, 2, 3], ninja: [5, 2, 3], lantern: [7, 1, 2], oni: [9, 1, 2], ronin: [8, 1, 2] } },
        { t0: 220, t1: 301, spawns: { spider: [3.2, 14, 16], ashigaru: [3.6, 2, 3], ninja: [4.5, 2, 3], lantern: [6, 2, 2], oni: [7, 1, 2], ronin: [6, 1, 2] } }
      ],
      bossAdds: { spider: [6, 10, 12], ninja: [10, 1, 2] }
    },
    {
      id: 3, key: 'ex', act: 'EX幕', name: '無限エンドレス：修羅・無間獄', en: 'ENDLESS SHURA ABYSS',
      duration: Infinity, theme: 'endless', boss: null, gimmicks: ['barrel', 'thunder', 'crystal'], gimmickEvery: 8, gimmickMax: 5,
      bgmRoot: 7, endlessBossEvery: 90,
      waves: [
        { t0: 0, t1: Infinity, spawns: { spider: [4.2, 10, 14], ashigaru: [5, 1, 2], ninja: [6, 1, 2], lantern: [8, 1, 2], oni: [10, 1, 1], ronin: [9, 1, 1] } }
      ],
      bossAdds: { spider: [6, 10, 14] }
    }
  ];

  /* ------------------------------------------------------------------------
   * 9.1 漢字コールアウト
   * ---------------------------------------------------------------------- */
  const CALLOUTS = [
    { min: 25, text: '天衣無縫・極一閃!!', color: 'rainbow', size: 64 },
    { min: 12, text: '無双絶景!!', color: '#FF1E42', size: 58 },
    { min: 6,  text: '神速連斬!!', color: '#FFBE2E', size: 52 },
    { min: 3,  text: '一閃!!',     color: '#00F0FF', size: 50 }
  ];

  /* ------------------------------------------------------------------------
   * 9.2 音響
   * ---------------------------------------------------------------------- */
  const AUDIO = {
    BASE_FREQ: 523.25,
    SEMITONES: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36, 38, 40],
    POWER_CHORD: [523.25, 659.25, 783.99, 1046.5],
    GEM_BASE: 880
  };

  /* ------------------------------------------------------------------------
   * 8.3 セーブデータ
   * ---------------------------------------------------------------------- */
  const SAVE_KEY = 'zetsu_issen_save_v1';
  const DEFAULT_SAVE = {
    soulCoins: 0,
    highScore: 0,
    maxChainRecord: 0,
    clearedStages: [false, false, false],
    unlockedBlades: ['byakuya'],
    selectedBlade: 'byakuya',
    dojoLevels: { lockRadius: 0, focusMax: 0, attackPower: 0, maxHp: 0, xpGain: 0, startingUlt: 0 }
  };

  /* 5.1 レベルアップ必要XP */
  function xpForLevel(lv) {
    return Math.floor(8 + (lv - 1) * 6 + Math.pow(lv - 1, 1.45) * 2);
  }

  /* 8 獲得魂貨 */
  function coinsFor(score, kills, bossKills) {
    return Math.floor(score / 250) + kills * 2 + bossKills * 300;
  }

  ZI.Config = {
    COLORS, PARAMS, STYLE_RANKS, PHASE_LABELS, BLADES, BLADE_ORDER, SKILLS, SKILL_TABLE, AWAKENINGS, FILLER_CARDS,
    DOJO_UPGRADES, DOJO_COSTS, DOJO_MAX, ENEMIES, BOSSES, STAGES, CALLOUTS, AUDIO, SAVE_KEY, DEFAULT_SAVE,
    xpForLevel, coinsFor
  };

  /* ------------------------------------------------------------------------
   * 共有数学ユーティリティ
   * ---------------------------------------------------------------------- */
  const TAU = Math.PI * 2;
  const Util = {
    TAU,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    choice: (arr) => arr[Math.floor(Math.random() * arr.length)],
    dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    dist2: (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; },
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInCubic: (t) => t * t * t,
    easeOutBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    angleDiff: (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; },
    shuffle: (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; },
    /** 点と線分の距離の2乗 */
    segDist2: (px, py, ax, ay, bx, by) => {
      const abx = bx - ax, aby = by - ay;
      const len2 = abx * abx + aby * aby;
      let t = len2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = ax + abx * t - px, cy = ay + aby * t - py;
      return cx * cx + cy * cy;
    },
    /** 2線分の交点（なければ null） */
    segIntersect: (ax, ay, bx, by, cx, cy, dx, dy) => {
      const rX = bx - ax, rY = by - ay, sX = dx - cx, sY = dy - cy;
      const den = rX * sY - rY * sX;
      if (Math.abs(den) < 1e-6) return null;
      const t = ((cx - ax) * sY - (cy - ay) * sX) / den;
      const u = ((cx - ax) * rY - (cy - ay) * rX) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) return null;
      return { x: ax + rX * t, y: ay + rY * t };
    },
    /** 配列のインプレース削除（順序非保持・O(1)） */
    swapRemove: (arr, i) => { const last = arr.length - 1; if (i !== last) arr[i] = arr[last]; arr.pop(); },
    /** dead フラグの立った要素をインプレースで圧縮 */
    compact: (arr, pred) => {
      let w = 0;
      for (let r = 0; r < arr.length; r++) { const o = arr[r]; if (pred(o)) arr[w++] = o; }
      arr.length = w;
    },
    fmtTime: (sec) => {
      if (!isFinite(sec)) return '∞';
      sec = Math.max(0, Math.ceil(sec));
      const m = Math.floor(sec / 60), s = sec % 60;
      return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    },
    hexToRgb: (hex) => {
      const h = hex.replace('#', '');
      return { r: parseInt(h.substr(0, 2), 16), g: parseInt(h.substr(2, 2), 16), b: parseInt(h.substr(4, 2), 16) };
    },
    rgba: (hex, a) => { const c = Util.hexToRgb(hex); return `rgba(${c.r},${c.g},${c.b},${a})`; }
  };
  ZI.Util = Util;
})();
