window.ZetsuIssen = window.ZetsuIssen || {};

window.ZetsuIssen.Config = (() => {
  const COLORS = {
    bgDeep: '#07080c',
    bgAwaken: '#120610',
    bgKishin: '#1a0914',
    bgSlow: '#030406',
    decalInk: 'rgba(20, 24, 36, 0.78)',
    white: '#ffffff',
    crimson: '#ff1e42',
    gold: '#ffbe2e',
    jade: '#00f5a8',
    cyan: '#00f0ff',
    purple: '#d946ef',
    orange: '#ff7b00'
  };

  const PARAMS = {
    HOLD_THRESHOLD_MS: 135,
    LEVELUP_LOCK_MS: 450,
    PLAYER_SPEED: 245,
    PLAYER_RADIUS: 13,
    // Action B: Pinball Rapid Slash
    B_FOCUS_COST: 18,
    B_FOCUS_REFUND: 10,
    B_KILL_REFUND: 4,
    B_DISTANCE: 285,
    B_HOMING_RANGE: 345,
    B_CHAIN_SLOW_TIME: 0.36,
    OVERHEAT_DURATION: 0.70,
    // Action A: Bullet-Time Direct Iai
    A_TIME_SCALE: 0.10,
    A_LOCK_RADIUS_BASE: 52,
    A_FOCUS_DRAIN_PER_PX: 0.036,
    A_FOCUS_REFUND_PER_LOCK: 24,
    A_MAX_TOTAL_DASH_TIME: 0.22,
    A_SHEATHE_PAUSE: 0.12,
    // Graze (Paper-thin dodge)
    GRAZE_MARGIN: 28,
    GRAZE_FOCUS_GAIN: 25,
    GRAZE_ULT_GAIN: 4.0,
    GRAZE_COOLDOWN: 0.45,
    // Thunder Charge (B -> A synergy)
    CHARGE_MULT_RADIUS: [1.0, 1.28, 1.55, 1.88],
    CHARGE_MULT_DMG: [1.0, 1.35, 1.65, 2.10]
  };

  const STYLE_RANKS = [
    { id: 'c', letter: 'C', title: '抜刀', minCombo: 0, phase: 1, phaseName: 'Phase 1 : 通常', decayTime: 4.6, mult: 1.0, bpm: 128 },
    { id: 'b', letter: 'B', title: '疾風', minCombo: 10, phase: 1, phaseName: 'Phase 1 : 通常', decayTime: 4.3, mult: 1.5, bpm: 132 },
    { id: 'a', letter: 'A', title: '閃光', minCombo: 25, phase: 2, phaseName: 'Phase 2 : 覚醒', decayTime: 3.9, mult: 2.2, bpm: 138 },
    { id: 's', letter: 'S', title: '修羅', minCombo: 50, phase: 2, phaseName: 'Phase 2 : 覚醒', decayTime: 3.6, mult: 3.5, bpm: 146 },
    { id: 'ss', letter: 'SS', title: '夜叉', minCombo: 100, phase: 3, phaseName: 'Phase 3 : 鬼神トランス', decayTime: 3.3, mult: 5.0, bpm: 155 },
    { id: 'sss', letter: 'SSS', title: '鬼神', minCombo: 200, phase: 3, phaseName: 'Phase 3 : 鬼神トランス', decayTime: 3.1, mult: 8.0, bpm: 164 }
  ];

  const BLADES = [
    {
      id: 'byakuya',
      name: '無銘・白夜',
      sub: '標準バランス型',
      cost: 0,
      colorCore: '#ffffff',
      colorGlow: '#00f0ff',
      atk: 1.0,
      hp: 4,
      lockRadiusMult: 1.0,
      bCostMult: 1.0,
      aCostMult: 1.0,
      multiHit: 1,
      alwaysVoid: false,
      startSkill: null,
      desc: '蒼白の刀光を放つ王道の一振り。迅雷（B）と居合（A）の双方が扱いやすい高水準バランス。'
    },
    {
      id: 'guren',
      name: '双影・紅蓮',
      sub: '迅雷ピンボール＆二刀流特化',
      cost: 800,
      colorCore: '#fff0f3',
      colorGlow: '#ff1e42',
      atk: 0.8,
      hp: 4,
      lockRadiusMult: 1.0,
      bCostMult: 0.7,
      aCostMult: 1.0,
      multiHit: 2,
      alwaysVoid: false,
      startSkill: null,
      desc: '深紅の二刀流。全攻撃が【2連ヒット】してコンボと帯電が2倍速で溜まり、短フリックの集中消費30%軽減！'
    },
    {
      id: 'dankai',
      name: '大太刀・断界',
      sub: '空間断裂・次元斬（D）特化',
      cost: 1800,
      colorCore: '#fffbeb',
      colorGlow: '#ffbe2e',
      atk: 1.6,
      hp: 5,
      lockRadiusMult: 1.15,
      bCostMult: 1.0,
      aCostMult: 1.0,
      multiHit: 1,
      alwaysVoid: true,
      startSkill: null,
      desc: '黄金の極太刀光。攻撃力1.6倍、コンボランクに関わらず最初からすべての居合と連撃に【次元斬（D）】が発生！'
    },
    {
      id: 'shiden',
      name: '妖刀・紫電',
      sub: '無限一筆書き＆連鎖雷撃特化',
      cost: 3200,
      colorCore: '#fdf4ff',
      colorGlow: '#d946ef',
      atk: 1.4,
      hp: 3,
      lockRadiusMult: 1.25,
      bCostMult: 0.9,
      aCostMult: 0.55,
      multiHit: 1,
      alwaysVoid: false,
      startSkill: 'chain_lightning',
      desc: '長押し中の集中消費45%軽減＆最初から『雷鳴抜刀 Lv.1』所持。さらに100チェインごとにHPが1自動回復！'
    }
  ];

  const SKILLS = [
    {
      id: 'shadow_clone',
      tag: '追撃分身',
      name: '二天一流・影打',
      maxLv: 5,
      desc: '斬撃時に遅れて追撃する影分身を発生させ、全ターゲットに追加ヒット＆ダメージを与える。',
      awakenId: 'awk_shadow',
      awakenReqSkill: 'godspeed',
      awakenName: '【極意】千手観音・無間連斬',
      awakenDesc: '影分身が常時5体に覚醒！プレイヤーが斬った敵に対して八方から分身が自動で乱舞斬りを浴びせ続ける！'
    },
    {
      id: 'chain_lightning',
      tag: '連鎖紫電',
      name: '雷鳴抜刀',
      maxLv: 5,
      desc: '敵を斬った際、周囲の敵へ紫電が連鎖して感電ダメージを与える（Lv毎に連鎖数＋2）。',
      awakenId: 'awk_lightning',
      awakenReqSkill: 'wide_iai',
      awakenName: '【極意】建御雷・天罰落雷',
      awakenDesc: '居合でロックした全ての敵の頭上に巨大な黄金の雷柱が落ち、画面内の全敵を電撃ネットで一斉感電させる！'
    },
    {
      id: 'wide_iai',
      tag: '間合い拡大',
      name: '居合の極意',
      maxLv: 5,
      desc: '一筆書きロックオン半径が＋22%/Lv拡大し、ロック時の集中ゲージ回復量が＋20%/Lv増加。',
      awakenId: 'awk_iai',
      awakenReqSkill: 'crimson_nova',
      awakenName: '【極意】森羅万象・全天ロック',
      awakenDesc: '長押し開始と同時にカーソル周囲300pxの敵を自動で一斉ロックオンし、納刀爆発ダメージが2.5倍に跳ね上がる！'
    },
    {
      id: 'crescent_wave',
      tag: '遠距離貫通',
      name: '真空三日月波',
      maxLv: 5,
      desc: '短フリック（B）と居合（A）の終点から画面端まで貫通する巨大真空刃を放つ（Lv毎に発射数＋2）。',
      awakenId: 'awk_wave',
      awakenReqSkill: 'void_rift',
      awakenName: '【極意】天叢雲・大車輪',
      awakenDesc: '真空波が画面端で反射してブーメランのように旋回し続け、通過した軌跡すべてにミニ次元斬（D）を残す！'
    },
    {
      id: 'parry_master',
      tag: '弾斬り光刃',
      name: '弾返しの達人',
      maxLv: 5,
      desc: '敵弾パリィや敵撃破時に自動追尾クナイを連射（Lv毎に＋2本）し、習得時に命盾（HP）を1回復。',
      awakenId: 'awk_parry',
      awakenReqSkill: null,
      awakenName: '【極意】八咫鏡・千本クナイ陣',
      awakenDesc: '主人公の周囲に常時8本の回転光刃が展開して敵弾を全自動パリィし、毎秒大量の追尾クナイを画面中にばら撒く！'
    },
    {
      id: 'crimson_nova',
      tag: '連鎖誘爆',
      name: '紅蓮爆砕',
      maxLv: 5,
      desc: '納刀爆発および死体ボウリング爆発の半径が＋30%/Lv拡大し、爆発に巻き込んだ敵をさらに誘爆。',
      awakenId: 'awk_nova',
      awakenReqSkill: null,
      awakenName: '【極意】迦具土・連鎖超新星',
      awakenDesc: '爆砕で倒れた敵の死体すべてが「新たな連鎖爆弾」に変化し、画面端から端までドミノ倒しの超新星誘爆が連鎖する！'
    },
    {
      id: 'void_rift',
      tag: '空間断裂',
      name: '虚空の裂け目',
      maxLv: 5,
      desc: 'すべての斬撃が空間を切り裂き、持続切断＆閉鎖爆発を起こす『次元斬（D）』の発生率と持続時間を強化。',
      awakenId: 'awk_void',
      awakenReqSkill: null,
      awakenName: '【極意】次元崩壊・黒縄地獄',
      awakenDesc: '次元斬（D）の裂け目が敵を吸い寄せる重力場を持ち、裂け目の中心にミニブラックホールが発生して敵群を粉砕する！'
    },
    {
      id: 'godspeed',
      tag: '神速・吸魂',
      name: '神速の足捌き',
      maxLv: 5,
      desc: '短フリック（B）の集中消費を軽減し、移動速度・見切り範囲・魂ジェム吸引範囲を大幅に拡大。',
      awakenId: 'awk_godspeed',
      awakenReqSkill: 'shadow_clone',
      awakenName: '【極意】縮地・光速残像陣',
      awakenDesc: '移動と突進の軌跡に3秒間燃え続ける蒼炎の残像ラインが残り、ピンボール突進時に近くの敵を自動で3体連続連鎖する！'
    }
  ];

  const DOJO_UPGRADES = [
    { id: 'lockRadius', name: '壱. 心眼（間合い）', desc: 'ロックオン半径 ＋10% / Lv', costs: [150, 350, 700, 1300, 2200] },
    { id: 'focusMax', name: '弐. 気合（集中力）', desc: '最大集中力＆回復速度 ＋12% / Lv', costs: [150, 350, 700, 1300, 2200] },
    { id: 'attackPower', name: '参. 剛剣（攻撃力）', desc: '全斬撃・爆砕ダメージ ＋15% / Lv', costs: [150, 350, 700, 1300, 2200] },
    { id: 'maxHp', name: '肆. 金剛（命盾）', desc: '初期最大命盾（HP） ＋1 / Lv', costs: [200, 450, 900, 1600, 2600] },
    { id: 'xpGain', name: '伍. 吸魂（成長力）', desc: '獲得経験値＆魂吸引範囲 ＋18% / Lv', costs: [150, 350, 700, 1300, 2200] },
    { id: 'startingUlt', name: '陸. 鬼脈（初期奥義）', desc: '開幕時の初期奥義ゲージ ＋25% / Lv', costs: [200, 450, 900, 1600, 2600] }
  ];

  const STAGES = [
    {
      id: 0,
      tag: 'STAGE 01 — 第1幕',
      name: '第1幕：竹林サイバー城下町',
      duration: 150, // 2m30s fast-paced action to boss
      theme: 'bamboo',
      gimmickTypes: ['barrel'],
      bossId: 'kurogane',
      bossName: 'からくり大百足・黒鉄',
      minEnemies: 26,
      maxEnemies: 46,
      desc: '発光する竹林と火薬樽が並ぶ城下町。開幕20体円陣から一筆書き大誘爆を決め、からくり大百足を討て！'
    },
    {
      id: 1,
      tag: 'STAGE 02 — 第2幕',
      name: '第2幕：紅蓮の機械天守閣',
      duration: 180,
      theme: 'clockwork',
      gimmickTypes: ['barrel', 'lantern'],
      bossId: 'gokuen',
      bossName: '六腕の重装鬼将・獄炎',
      minEnemies: 32,
      maxEnemies: 54,
      desc: '巨大歯車が回る機械天守。斬ると連鎖雷撃が走る【紫電灯籠】を活用し、六腕の重装鬼将の全腕を破壊せよ！'
    },
    {
      id: 2,
      tag: 'FINAL STAGE — 最終幕',
      name: '最終幕：虚空の異界・白夜城',
      duration: 210,
      theme: 'void',
      gimmickTypes: ['barrel', 'lantern', 'crystal'],
      bossId: 'mumyo',
      bossName: '次元喰らいの剣聖・無明',
      minEnemies: 38,
      maxEnemies: 62,
      desc: '白銀の鳥居と曼荼羅が浮かぶ異界。斬ると十字次元斬が炸裂する【虚空水晶】で、次元喰らいの剣聖を超えろ！'
    },
    {
      id: 3,
      tag: 'ENDLESS MODE — 無限修羅',
      name: 'EX幕：修羅・無間獄（無限エンドレス）',
      duration: 999999,
      theme: 'endless',
      gimmickTypes: ['barrel', 'lantern', 'crystal'],
      bossId: 'endless',
      bossName: '無間獄・歴代鬼神衆',
      minEnemies: 42,
      maxEnemies: 68,
      desc: '時間無制限の極限インフレモード！75秒ごとに強化ボスが乱入し、どこまでチェインとスコアを伸ばせるか挑め！'
    }
  ];

  return {
    COLORS,
    PARAMS,
    STYLE_RANKS,
    BLADES,
    SKILLS,
    DOJO_UPGRADES,
    STAGES
  };
})();
