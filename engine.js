/*!
 * 汤姆猫跑酷学堂 · 内核引擎（精美版）
 * 1) 答案判定引擎（修复原版"答案会出错"的问题）
 * 2) 内置题库（62 道，答案逐题校验 + 自检）
 * 3) 实时积分榜单（本地实时模拟，可直接换成后端接口）
 *
 * 该文件不依赖 DOM，可在浏览器与 Node 中同时运行，便于自检。
 */
(function (root, factory) {
  var api = factory();
  if (typeof root !== 'undefined') {
    root.PK = Object.assign(root.PK || {}, api);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ============================================================
   * 基础元数据
   * ============================================================ */

  var SUBJECTS = [
    { key: 'math', name: '数学', emoji: '📐', grad: ['#3b82f6', '#1d4ed8'], scene: ['#0f172a', '#1e3a5f'] },
    { key: 'chinese', name: '语文', emoji: '📖', grad: ['#f87171', '#b91c1c'], scene: ['#1a0a0a', '#4a2020'] },
    { key: 'english', name: '英语', emoji: '🔤', grad: ['#fb923c', '#c2410c'], scene: ['#2d1810', '#5c2e1a'] },
    { key: 'physics', name: '物理', emoji: '🔭', grad: ['#c084fc', '#6d28d9'], scene: ['#1a0f2e', '#2d1b5e'] },
    { key: 'chemistry', name: '化学', emoji: '⚗️', grad: ['#34d399', '#047857'], scene: ['#0a1f14', '#1e4d3a'] },
    { key: 'biology', name: '生物', emoji: '🧬', grad: ['#4ade80', '#15803d'], scene: ['#0d1f0d', '#2a4a1e'] },
    { key: 'politics', name: '政治', emoji: '⚖️', grad: ['#f87171', '#991b1b'], scene: ['#1f0a0a', '#5c1a1a'] },
    { key: 'history', name: '历史', emoji: '🏛️', grad: ['#fbbf24', '#92400e'], scene: ['#221505', '#4d300f'] },
    { key: 'geography', name: '地理', emoji: '🌏', grad: ['#22d3ee', '#0e7490'], scene: ['#04222a', '#0b4a5c'] }
  ];

  var STAGES = [
    { key: 'primary', name: '小学' },
    { key: 'junior', name: '初中' },
    { key: 'senior', name: '高中' }
  ];

  var DIFFICULTIES = [
    { key: 'basic', name: '基础关卡', desc: '适合预习入门', coin: 10 },
    { key: 'consolidated', name: '巩固关卡', desc: '适合复习巩固', coin: 20 },
    { key: 'final', name: '期末冲刺', desc: '综合挑战模式', coin: 30 }
  ];

  var TYPES = [
    { key: 'single', name: '单选题' },
    { key: 'judge', name: '判断题' },
    { key: 'fill', name: '填空题' }
  ];

  var JUDGE_OPTIONS = ['正确', '错误'];

  function subjectByKey(key) {
    for (var i = 0; i < SUBJECTS.length; i++) if (SUBJECTS[i].key === key) return SUBJECTS[i];
    return SUBJECTS[0];
  }
  function subjectByName(name) {
    for (var i = 0; i < SUBJECTS.length; i++) if (SUBJECTS[i].name === name) return SUBJECTS[i];
    return null;
  }

  /* ============================================================
   * 题库
   * answer 一律用"选项字母"，与教师端选题方式一致；
   * accept 用于填空题的等价写法（可写多种）。
   * ============================================================ */

  var QUESTION_BANK = [
    /* ---------- 数学 ---------- */
    { id: 'math-01', subject: 'math', stage: 'primary', difficulty: 'basic', type: 'single', chapter: '两位数加法',
      content: '计算：24 + 37 = ?', options: ['51', '59', '61', '71'], answer: 'C',
      analysis: '个位 4 + 7 = 11，向十位进 1；十位 2 + 3 + 1 = 6，所以结果是 61。', source: '内置题库', verified: true },
    { id: 'math-02', subject: 'math', stage: 'primary', difficulty: 'basic', type: 'fill', chapter: '乘法口诀',
      content: '计算：7 × 8 = ____', options: [], answer: '56', accept: ['五十六'],
      analysis: '七八五十六，乘法口诀表中 7 × 8 = 56。', source: '内置题库', verified: true },
    { id: 'math-03', subject: 'math', stage: 'primary', difficulty: 'basic', type: 'judge', chapter: '三角形',
      content: '任意三角形的内角和都是 180°。', options: JUDGE_OPTIONS.slice(), answer: 'A',
      analysis: '三角形内角和定理：任意三角形的三个内角之和为 180°。', source: '内置题库', verified: true },
    { id: 'math-04', subject: 'math', stage: 'primary', difficulty: 'basic', type: 'fill', chapter: '长方形面积',
      content: '一个正方形的边长是 5 厘米，它的面积是 ____ 平方厘米。', options: [], answer: '25', accept: ['二十五'],
      analysis: '正方形面积 = 边长 × 边长 = 5 × 5 = 25（平方厘米）。', source: '内置题库', verified: true },
    { id: 'math-05', subject: 'math', stage: 'junior', difficulty: 'basic', type: 'single', chapter: '一元二次方程',
      content: '方程 x² - 5x + 6 = 0 的两个根是？', options: ['x = 1 或 x = 6', 'x = 2 或 x = 3', 'x = -2 或 x = -3', 'x = 1 或 x = -6'], answer: 'B',
      analysis: '因式分解得 (x - 2)(x - 3) = 0，所以 x = 2 或 x = 3；也可用求根公式验证。', source: '内置题库', verified: true },
    { id: 'math-06', subject: 'math', stage: 'junior', difficulty: 'basic', type: 'fill', chapter: '一元一次方程',
      content: '若 2x + 3 = 11，则 x = ____', options: [], answer: '4', accept: ['四'],
      analysis: '两边同时减去 3 得 2x = 8，再除以 2 得 x = 4。', source: '内置题库', verified: true },
    { id: 'math-07', subject: 'math', stage: 'junior', difficulty: 'consolidated', type: 'single', chapter: '函数求值',
      content: '已知函数 f(x) = x² + 2x + 1，求 f(2) 的值为？', options: ['5', '7', '9', '11'], answer: 'C',
      analysis: 'f(2) = 2² + 2×2 + 1 = 4 + 4 + 1 = 9。', source: '原版内置题（答案判定已修复）', verified: true },
    { id: 'math-08', subject: 'math', stage: 'junior', difficulty: 'consolidated', type: 'single', chapter: '勾股定理',
      content: '直角三角形两条直角边分别为 3 和 4，斜边长为？', options: ['5', '6', '7', '25'], answer: 'A',
      analysis: '勾股定理：3² + 4² = 9 + 16 = 25，斜边 = √25 = 5。', source: '内置题库', verified: true },
    { id: 'math-09', subject: 'math', stage: 'junior', difficulty: 'consolidated', type: 'judge', chapter: '有理数',
      content: '0 是有理数。', options: JUDGE_OPTIONS.slice(), answer: 'A',
      analysis: '整数都是有理数，0 是整数，所以 0 也是有理数。', source: '内置题库', verified: true },
    { id: 'math-10', subject: 'math', stage: 'senior', difficulty: 'final', type: 'single', chapter: '函数与导数',
      content: '一元二次方程 ax² + bx + c = 0（a ≠ 0）的求根公式是？',
      options: ['x = (-b ± √(b²-4ac)) / 2a', 'x = (b ± √(b²-4ac)) / 2a', 'x = (-b + √(b²-4ac)) / a', 'x = (-b ± √(b²+4ac)) / 2a'],
      answer: 'A', analysis: '由配方法推导：x = [-b ± √(b² - 4ac)] / (2a)，判别式 Δ = b² - 4ac。',
      source: '原版内置题（答案判定已修复）', verified: true },

    /* ---------- 语文 ---------- */
    { id: 'chinese-01', subject: 'chinese', stage: 'primary', difficulty: 'basic', type: 'judge', chapter: '古诗词',
      content: '“床前明月光，疑是地上霜”出自李白的《静夜思》。', options: JUDGE_OPTIONS.slice(), answer: 'A',
      analysis: '这两句出自唐代诗人李白的《静夜思》，全诗抒发思乡之情。', source: '原版内置题（答案判定已修复）', verified: true },
    { id: 'chinese-02', subject: 'chinese', stage: 'primary', difficulty: 'basic', type: 'single', chapter: '古诗词',
      content: '“春眠不觉晓”的下一句是？', options: ['处处闻啼鸟', '夜来风雨声', '花落知多少', '疑是地上霜'], answer: 'A',
      analysis: '孟浩然《春晓》：春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。', source: '内置题库', verified: true },
    { id: 'chinese-03', subject: 'chinese', stage: 'primary', difficulty: 'basic', type: 'fill', chapter: '古诗词',
      content: '补全诗句：欲穷千里目，____。', options: [], answer: '更上一层楼',
      analysis: '出自王之涣《登鹳雀楼》，意思是想要看得更远，就要站得更高。', source: '内置题库', verified: true },
    { id: 'chinese-04', subject: 'chinese', stage: 'primary', difficulty: 'basic', type: 'judge', chapter: '名著阅读',
      content: '《西游记》的作者是吴承恩。', options: JUDGE_OPTIONS.slice(), answer: 'A',
      analysis: '《西游记》是明代小说家吴承恩创作的长篇章回体神魔小说。', source: '内置题库', verified: true },
    { id: 'chinese-05', subject: 'chinese', stage: 'primary', difficulty: 'basic', type: 'single', chapter: '古诗词',
      content: '“千山鸟飞绝，万径人踪灭”的作者是？', options: ['柳宗元', '李白', '白居易', '王维'], answer: 'A',
      analysis: '出自唐代柳宗元的《江雪》，描写大雪中孤舟独钓的画面。', source: '内置题库', verified: true },
    { id: 'chinese-06', subject: 'chinese', stage: 'junior', difficulty: 'basic', type: 'single', chapter: '古诗词鉴赏',
      content: '“会当凌绝顶，一览众山小”出自哪位诗人？', options: ['李白', '杜甫', '王维', '白居易'], answer: 'B',
      analysis: '出自杜甫《望岳》，表现诗人登临绝顶、俯瞰群山的壮志豪情。', source: '内置题库', verified: true },
    { id: 'chinese-07', subject: 'chinese', stage: 'junior', difficulty: 'consolidated', type: 'fill', chapter: '古诗词',
      content: '补全诗句：____，江枫渔火对愁眠。', options: [], answer: '月落乌啼霜满天',
      analysis: '出自张继《枫桥夜泊》，全诗以"月落乌啼霜满天"起句，写羁旅愁思。', source: '内置题库', verified: true },
    { id: 'chinese-08', subject: 'chinese', stage: 'junior', difficulty: 'basic', type: 'single', chapter: '文学常识',
      content: '“不亦乐乎”出自哪部经典？', options: ['《论语》', '《孟子》', '《庄子》', '《诗经》'], answer: 'A',
      analysis: '《论语·学而》："有朋自远方来，不亦乐乎？"', source: '内置题库', verified: true },

    /* ---------- 英语 ---------- */
    { id: 'english-01', subject: 'english', stage: 'primary', difficulty: 'basic', type: 'single', chapter: '一般现在时',
      content: 'Choose the correct answer: She ___ to school every day.', options: ['go', 'goes', 'going', 'went'], answer: 'B',
      analysis: '主语 She 是第三人称单数，一般现在时动词要加 -es，所以用 goes。', source: '原版内置题（答案判定已修复）', verified: true },
    { id: 'english-02', subject: 'english', stage: 'primary', difficulty: 'basic', type: 'single', chapter: '名词单复数',
      content: 'Choose the correct answer: I have two ___.', options: ['book', 'books', 'bookes', 'a book'], answer: 'B',
      analysis: 'two 后面要接可数名词复数，book 的复数是 books。', source: '内置题库', verified: true },
    { id: 'english-03', subject: 'english', stage: 'primary', difficulty: 'basic', type: 'fill', chapter: '反义词',
      content: 'The opposite of "big" is ____.', options: [], answer: 'small', accept: ['Small', 'SMALL'],
      analysis: 'big 表示"大"，其反义词是 small（小）。', source: '内置题库', verified: true },
    { id: 'english-04', subject: 'english', stage: 'primary', difficulty: 'basic', type: 'single', chapter: '词汇',
      content: 'Which word means "苹果"?', options: ['banana', 'apple', 'orange', 'pear'], answer: 'B',
      analysis: 'apple 意为"苹果"，banana 香蕉，orange 橙子，pear 梨。', source: '内置题库', verified: true },
    { id: 'english-05', subject: 'english', stage: 'junior', difficulty: 'basic', type: 'single', chapter: '过去进行时',
      content: 'He ___ TV when I called him.', options: ['watches', 'watched', 'was watching', 'is watching'], answer: 'C',
      analysis: 'when 引导的从句用一般过去时，主句表示"当时正在做"，要用过去进行时 was watching。', source: '内置题库', verified: true },
    { id: 'english-06', subject: 'english', stage: 'junior', difficulty: 'basic', type: 'judge', chapter: '动词变化',
      content: 'go 的过去式是 goed。', options: JUDGE_OPTIONS.slice(), answer: 'B',
      analysis: 'go 是不规则动词，过去式为 went，因此 go 的过去式是 goed 的说法错误。', source: '内置题库', verified: true },
    { id: 'english-07', subject: 'english', stage: 'junior', difficulty: 'consolidated', type: 'fill', chapter: 'be 动词',
      content: '用所给动词的适当形式填空：They ____ (be) happy yesterday.', options: [], answer: 'were', accept: ['Were'],
      analysis: 'yesterday 表示过去，主语 They 是复数，be 动词过去式用 were。', source: '内置题库', verified: true },
    { id: 'english-08', subject: 'english', stage: 'junior', difficulty: 'consolidated', type: 'single', chapter: '固定搭配',
      content: 'I am looking forward to ___ you.', options: ['see', 'seeing', 'saw', 'sees'], answer: 'B',
      analysis: 'look forward to 中的 to 是介词，后面接动名词，所以用 seeing。', source: '内置题库', verified: true },

    /* ---------- 物理 ---------- */
    { id: 'physics-01', subject: 'physics', stage: 'junior', difficulty: 'consolidated', type: 'judge', chapter: '力学基础',
      content: '牛顿第二定律的公式是 F = ma。', options: JUDGE_OPTIONS.slice(), answer: 'A',
      analysis: '牛顿第二定律：物体加速度的大小与所受合外力成正比、与质量成反比，即 F = ma。', source: '原版内置题（解析已修正）', verified: true },
    { id: 'physics-02', subject: 'physics', stage: 'junior', difficulty: 'basic', type: 'single', chapter: '单位',
      content: '下列哪一个是国际单位制中力的单位？', options: ['牛顿（N）', '焦耳（J）', '瓦特（W）', '帕斯卡（Pa）'], answer: 'A',
      analysis: '力的国际单位是牛顿（N）；焦耳是功和能量的单位，瓦特是功率的单位，帕斯卡是压强的单位。', source: '内置题库', verified: true },
    { id: 'physics-03', subject: 'physics', stage: 'junior', difficulty: 'basic', type: 'fill', chapter: '重力',
      content: '物体所受重力 G 与质量 m 的关系式是 G = ____。', options: [], answer: 'mg', accept: ['Mg', 'm g', 'gm'],
      analysis: '重力 G = mg，其中 g 是重力加速度，通常取 9.8 N/kg（粗略计算取 10 N/kg）。', source: '内置题库', verified: true },
    { id: 'physics-04', subject: 'physics', stage: 'junior', difficulty: 'consolidated', type: 'single', chapter: '光现象',
      content: '光在真空中的传播速度约为？', options: ['3×10⁸ m/s', '3×10⁶ m/s', '340 m/s', '1.5×10⁸ m/s'], answer: 'A',
      analysis: '真空中光速约 3×10⁸ m/s（约 30 万千米每秒），340 m/s 是空气中声速。', source: '内置题库', verified: true },
    { id: 'physics-05', subject: 'physics', stage: 'junior', difficulty: 'basic', type: 'judge', chapter: '声现象',
      content: '声音可以在真空中传播。', options: JUDGE_OPTIONS.slice(), answer: 'B',
      analysis: '声音的传播需要介质，真空不能传声，因此该说法错误。', source: '内置题库', verified: true },
    { id: 'physics-06', subject: 'physics', stage: 'junior', difficulty: 'consolidated', type: 'fill', chapter: '重力计算',
      content: '一个物体质量为 2 千克，g 取 10 N/kg，它受到的重力是 ____ N。', options: [], answer: '20', accept: ['20N', '二十'],
      analysis: 'G = mg = 2 kg × 10 N/kg = 20 N。', source: '内置题库', verified: true },

    /* ---------- 化学 ---------- */
    { id: 'chemistry-01', subject: 'chemistry', stage: 'junior', difficulty: 'basic', type: 'fill', chapter: '化学式',
      content: '水的化学式是 ____。', options: [], answer: 'H2O', accept: ['h2o', 'H₂O'],
      analysis: '水分子由 2 个氢原子和 1 个氧原子构成，化学式为 H₂O。', source: '原版内置题（答案判定已修复）', verified: true },
    { id: 'chemistry-02', subject: 'chemistry', stage: 'junior', difficulty: 'basic', type: 'single', chapter: '空气组成',
      content: '空气中体积分数约占 21% 的气体是？', options: ['氮气', '氧气', '二氧化碳', '稀有气体'], answer: 'B',
      analysis: '空气中氮气约占 78%、氧气约占 21%、稀有气体约占 0.94%、二氧化碳约占 0.03%。', source: '内置题库', verified: true },
    { id: 'chemistry-03', subject: 'chemistry', stage: 'junior', difficulty: 'basic', type: 'fill', chapter: '化学式',
      content: '二氧化碳的化学式是 ____。', options: [], answer: 'CO2', accept: ['co2', 'CO₂'],
      analysis: '二氧化碳由 1 个碳原子和 2 个氧原子构成，化学式为 CO₂。', source: '内置题库', verified: true },
    { id: 'chemistry-04', subject: 'chemistry', stage: 'junior', difficulty: 'consolidated', type: 'judge', chapter: '物质变化',
      content: '铁生锈属于物理变化。', options: JUDGE_OPTIONS.slice(), answer: 'B',
      analysis: '铁生锈生成了新物质氧化铁，属于化学变化，因此该说法错误。', source: '内置题库', verified: true },
    { id: 'chemistry-05', subject: 'chemistry', stage: 'junior', difficulty: 'basic', type: 'single', chapter: '物质的分类',
      content: '下列物质中属于纯净物的是？', options: ['空气', '食盐水', '氧气', '矿泉水'], answer: 'C',
      analysis: '氧气只由一种物质组成，属于纯净物；空气、食盐水、矿泉水都由多种物质混合而成。', source: '内置题库', verified: true },
    { id: 'chemistry-06', subject: 'chemistry', stage: 'junior', difficulty: 'consolidated', type: 'fill', chapter: '相对分子质量',
      content: '水的相对分子质量是 ____。（H = 1，O = 16）', options: [], answer: '18', accept: ['十八'],
      analysis: '1×2 + 16 = 18，所以水的相对分子质量为 18。', source: '内置题库', verified: true },

    /* ---------- 生物 ---------- */
    { id: 'biology-01', subject: 'biology', stage: 'junior', difficulty: 'consolidated', type: 'fill', chapter: '细胞结构',
      content: '被称为细胞"能量工厂"的结构是 ____。', options: [], answer: '线粒体',
      analysis: '线粒体是细胞进行有氧呼吸的主要场所，被称为细胞的"动力车间"。', source: '原版内置题（答案判定已修复）', verified: true },
    { id: 'biology-02', subject: 'biology', stage: 'junior', difficulty: 'basic', type: 'single', chapter: '光合作用',
      content: '植物进行光合作用的主要器官是？', options: ['根', '茎', '叶', '花'], answer: 'C',
      analysis: '叶片中含有大量叶绿体，是植物进行光合作用的主要器官。', source: '内置题库', verified: true },
    { id: 'biology-03', subject: 'biology', stage: 'junior', difficulty: 'basic', type: 'judge', chapter: '血液',
      content: '血液呈红色是因为红细胞中含有血红蛋白。', options: JUDGE_OPTIONS.slice(), answer: 'A',
      analysis: '红细胞内含血红蛋白，血红蛋白呈红色，使血液呈红色。', source: '内置题库', verified: true },
    { id: 'biology-04', subject: 'biology', stage: 'junior', difficulty: 'consolidated', type: 'single', chapter: '呼吸系统',
      content: '人体进行气体交换的主要场所是？', options: ['气管', '支气管', '肺泡', '鼻腔'], answer: 'C',
      analysis: '肺泡壁很薄、外面缠绕着丰富的毛细血管，是气体交换的主要场所。', source: '内置题库', verified: true },
    { id: 'biology-05', subject: 'biology', stage: 'junior', difficulty: 'basic', type: 'fill', chapter: '细胞结构',
      content: '细胞的控制中心是 ____。', options: [], answer: '细胞核',
      analysis: '细胞核内有遗传物质，是细胞的控制中心。', source: '内置题库', verified: true },
    { id: 'biology-06', subject: 'biology', stage: 'junior', difficulty: 'basic', type: 'judge', chapter: '微生物',
      content: '细菌没有成形的细胞核。', options: JUDGE_OPTIONS.slice(), answer: 'A',
      analysis: '细菌属于原核生物，没有成形的细胞核，只有 DNA 集中的区域。', source: '内置题库', verified: true },

    /* ---------- 历史 ---------- */
    { id: 'history-01', subject: 'history', stage: 'junior', difficulty: 'basic', type: 'single', chapter: '中国古代史',
      content: '中国历史上第一个统一的中央集权封建国家是？', options: ['夏朝', '秦朝', '汉朝', '唐朝'], answer: 'B',
      analysis: '公元前 221 年秦始皇统一六国，建立秦朝，这是中国历史上第一个统一的中央集权封建国家。',
      source: '原版内置题（答案判定已修复）', verified: true },
    { id: 'history-02', subject: 'history', stage: 'junior', difficulty: 'basic', type: 'single', chapter: '秦汉时期',
      content: '秦朝建立于哪一年？', options: ['公元前 221 年', '公元前 202 年', '公元 618 年', '公元前 1046 年'], answer: 'A',
      analysis: '公元前 221 年秦灭六国完成统一；公元前 202 年西汉建立；公元 618 年唐朝建立。', source: '内置题库', verified: true },
    { id: 'history-03', subject: 'history', stage: 'junior', difficulty: 'basic', type: 'judge', chapter: '四大发明',
      content: '造纸术是中国古代四大发明之一。', options: JUDGE_OPTIONS.slice(), answer: 'A',
      analysis: '中国古代四大发明为造纸术、印刷术、指南针和火药。', source: '内置题库', verified: true },
    { id: 'history-04', subject: 'history', stage: 'junior', difficulty: 'consolidated', type: 'fill', chapter: '近代史',
      content: '1919 年爆发的反对帝国主义和封建主义的爱国运动是 ____ 运动。', options: [], answer: '五四', accept: ['五四运动', '5·4', '5.4'],
      analysis: '1919 年 5 月 4 日，北京学生发起爱国运动，史称五四运动，是中国新民主主义革命的开端。', source: '内置题库', verified: true },
    { id: 'history-05', subject: 'history', stage: 'junior', difficulty: 'basic', type: 'single', chapter: '现代史',
      content: '中华人民共和国成立于哪一年？', options: ['1945 年', '1949 年', '1951 年', '1956 年'], answer: 'B',
      analysis: '1949 年 10 月 1 日，中华人民共和国成立。', source: '内置题库', verified: true },
    { id: 'history-06', subject: 'history', stage: 'junior', difficulty: 'consolidated', type: 'single', chapter: '新文化运动',
      content: '新文化运动的主要阵地是？', options: ['《新青年》', '《民报》', '《每周评论》', '《时务报》'], answer: 'A',
      analysis: '1915 年陈独秀创办《青年杂志》（后改名《新青年》），成为新文化运动的主要阵地。', source: '内置题库', verified: true },

    /* ---------- 政治 ---------- */
    { id: 'politics-01', subject: 'politics', stage: 'junior', difficulty: 'basic', type: 'judge', chapter: '宪法',
      content: '我国宪法规定，中华人民共和国的一切权力属于人民。', options: JUDGE_OPTIONS.slice(), answer: 'A',
      analysis: '《宪法》第二条规定：中华人民共和国的一切权力属于人民。', source: '内置题库', verified: true },
    { id: 'politics-02', subject: 'politics', stage: 'junior', difficulty: 'basic', type: 'single', chapter: '政治制度',
      content: '我国的根本政治制度是？', options: ['人民代表大会制度', '中国共产党领导的多党合作和政治协商制度', '民族区域自治制度', '基层群众自治制度'], answer: 'A',
      analysis: '人民代表大会制度是我国的根本政治制度，其余三项是基本政治制度。', source: '内置题库', verified: true },
    { id: 'politics-03', subject: 'politics', stage: 'junior', difficulty: 'basic', type: 'fill', chapter: '国家常识',
      content: '我国的国庆节是每年的 ____ 月 1 日。', options: [], answer: '10', accept: ['十'],
      analysis: '1949 年 10 月 1 日中华人民共和国成立，因此每年 10 月 1 日为国庆节。', source: '内置题库', verified: true },
    { id: 'politics-04', subject: 'politics', stage: 'junior', difficulty: 'consolidated', type: 'single', chapter: '公民权利',
      content: '公民最基本、最重要的权利是？', options: ['选举权和被选举权', '人身自由权', '受教育权', '财产权'], answer: 'B',
      analysis: '教材指出：人身自由是公民最基本、最重要的权利，是享有其他权利的基础。', source: '内置题库', verified: true },
    { id: 'politics-05', subject: 'politics', stage: 'junior', difficulty: 'basic', type: 'judge', chapter: '法治',
      content: '在我国，法律面前人人平等。', options: JUDGE_OPTIONS.slice(), answer: 'A',
      analysis: '我国宪法规定，公民在法律面前一律平等，任何组织和个人都没有超越法律的特权。', source: '内置题库', verified: true },
    { id: 'politics-06', subject: 'politics', stage: 'junior', difficulty: 'consolidated', type: 'fill', chapter: '国家性质',
      content: '我国是 ____ 专政的社会主义国家。', options: [], answer: '人民民主', accept: ['人民民主专政'],
      analysis: '我国的国家性质是工人阶级领导的、以工农联盟为基础的人民民主专政的社会主义国家。', source: '内置题库', verified: true },

    /* ---------- 地理 ---------- */
    { id: 'geography-01', subject: 'geography', stage: 'junior', difficulty: 'basic', type: 'single', chapter: '大洲大洋',
      content: '世界上面积最大的大洲是？', options: ['非洲', '亚洲', '北美洲', '南美洲'], answer: 'B',
      analysis: '亚洲面积约 4400 万平方千米，是七大洲中面积最大、人口最多的洲。', source: '内置题库', verified: true },
    { id: 'geography-02', subject: 'geography', stage: 'junior', difficulty: 'basic', type: 'fill', chapter: '世界之最',
      content: '世界上海拔最高的山峰是 ____ 峰。', options: [], answer: '珠穆朗玛', accept: ['珠峰', '珠穆朗玛峰'],
      analysis: '珠穆朗玛峰位于中国与尼泊尔边界，是世界上海拔最高的山峰。', source: '内置题库', verified: true },
    { id: 'geography-03', subject: 'geography', stage: 'junior', difficulty: 'basic', type: 'judge', chapter: '非洲',
      content: '赤道穿过非洲大陆的中部。', options: JUDGE_OPTIONS.slice(), answer: 'A',
      analysis: '赤道横穿非洲大陆中部，因此非洲气候南北对称分布。', source: '内置题库', verified: true },
    { id: 'geography-04', subject: 'geography', stage: 'junior', difficulty: 'consolidated', type: 'single', chapter: '中国地理',
      content: '我国面积最大的岛屿是？', options: ['海南岛', '台湾岛', '崇明岛', '舟山岛'], answer: 'B',
      analysis: '台湾岛面积约 3.6 万平方千米，是我国面积最大的岛屿；海南岛位居第二。', source: '内置题库', verified: true },
    { id: 'geography-05', subject: 'geography', stage: 'junior', difficulty: 'basic', type: 'fill', chapter: '地球运动',
      content: '地球自转一周的时间大约是 ____ 小时。', options: [], answer: '24', accept: ['二十四'],
      analysis: '地球自转一周约 24 小时，形成昼夜交替现象。', source: '内置题库', verified: true },
    { id: 'geography-06', subject: 'geography', stage: 'junior', difficulty: 'consolidated', type: 'single', chapter: '中国河流',
      content: '长江发源于哪一高原？', options: ['黄土高原', '青藏高原', '云贵高原', '内蒙古高原'], answer: 'B',
      analysis: '长江发源于青藏高原唐古拉山脉，自西向东注入东海。', source: '内置题库', verified: true }
  ];

  /* ============================================================
   * 答案判定引擎
   * ============================================================ */

  var FULLWIDTH_MAP = (function () {
    // 全角 ASCII（U+FF01 起）与半角 ASCII（U+0021 起）相差 0xFEE0
    var map = {};
    for (var code = 0x21; code <= 0x7e; code++) {
      map[String.fromCharCode(0xfee0 + code)] = String.fromCharCode(code);
    }
    map['　'] = ' ';
    return map;
  })();

  var SUBSCRIPT_MAP = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };

  var CN_DIGITS = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  // 大写（财务）数字同样支持：壹贰叁肆伍陆柒捌玖拾佰仟
  var CN_UPPER_DIGITS = { '壹': 1, '贰': 2, '叁': 3, '肆': 4, '伍': 5, '陆': 6, '柒': 7, '捌': 8, '玖': 9 };
  var CN_UPPER_UNITS = { '拾': 10, '佰': 100, '仟': 1000 };
  var CN_UNITS = { '十': 10, '百': 100, '千': 1000 };

  /** 半角化 + 去空白 + 小写 + 统一标点 */
  function normalizeText(input) {
    if (input === null || input === undefined) return '';
    var s = String(input);
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      out += FULLWIDTH_MAP[ch] !== undefined ? FULLWIDTH_MAP[ch] : ch;
    }
    out = out.replace(/ō|ó|ò|ǒ|ō/g, 'o');
    out = out.replace(/[₀-₉]/g, function (c) { return SUBSCRIPT_MAP[c] || c; });
    out = out.replace(/²/g, '^2').replace(/³/g, '^3');
    out = out.replace(/[\s\u3000]/g, '');
    out = out.toLowerCase();
    // 注意：保留小数点，避免 "5.4" 被归一化成 "54"
    out = out.replace(/[。，,；;：:！!？?、“”"'（）()《》〈〉【】\[\]·]/g, '');
    out = out.replace(/\.+$/, '');
    out = out.replace(/×/g, '*').replace(/÷/g, '/').replace(/－/g, '-');
    return out;
  }

  /** 去除常见单位后缀，便于"25"与"25平方厘米"相互匹配 */
  var UNIT_SUFFIXES = [
    '平方厘米', '平方分米', '平方米', '平方千米', '立方厘米', '立方分米', '立方米',
    '厘米', '分米', '千米', '毫米', '米', '千克', '毫升', '克', '吨', '升',
    '牛顿', '牛', '帕斯卡', '焦耳', '瓦特', '小时', '分钟', '秒钟', '秒', '分钟',
    '摄氏度', '度', '个', '只', '元', '岁', '天', '年', '月', '日', '倍', 'n'
  ];

  function stripUnit(s) {
    for (var i = 0; i < UNIT_SUFFIXES.length; i++) {
      var u = UNIT_SUFFIXES[i];
      if (s.length > u.length && s.slice(-u.length) === u) return s.slice(0, s.length - u.length);
    }
    return s;
  }

  /** 中文数字转阿拉伯数字（支持 0-9999 的常见写法） */
  function cnToNumber(str) {
    if (!/^[零一二两三四五六七八九十百千壹贰叁肆伍陆柒捌玖拾佰仟]+$/.test(str)) return null;
    var digits = Object.assign({}, CN_DIGITS, CN_UPPER_DIGITS);
    var units = Object.assign({}, CN_UNITS, CN_UPPER_UNITS);
    if (str === '零') return 0;
    if (str.indexOf('十') === 0 || str.indexOf('拾') === 0) str = '一' + str;
    var total = 0;
    var section = 0;
    var number = 0;
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (digits[ch] !== undefined) {
        number = digits[ch];
      } else if (units[ch] !== undefined) {
        var unit = units[ch];
        if (unit === 10) {
          section += (number === 0 ? 1 : number) * 10;
          number = 0;
        } else if (unit === 100) {
          section += (number === 0 ? 1 : number) * 100;
          number = 0;
        } else {
          section += (number === 0 ? 1 : number) * 1000;
          number = 0;
        }
      } else {
        return null;
      }
    }
    total = section + number;
    return total;
  }

  /** 把答案文本转成数值（支持整数、小数、分数、中文数字） */
  function toNumber(text) {
    var s = normalizeText(text);
    if (!s) return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
    var frac = s.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
    if (frac) {
      var den = parseFloat(frac[2]);
      if (den !== 0) return parseFloat(frac[1]) / den;
    }
    var cn = cnToNumber(s);
    if (cn !== null) return cn;
    return null;
  }

  /** 判断题的多种写法归一化：返回 0=正确 / 1=错误 */
  function normalizeJudgeToken(text) {
    var s = normalizeText(text);
    if (!s) return null;
    var yes = ['正确', '对', '是', '真', '√', 'v', 't', 'true', 'y', 'yes', 'a'];
    var no = ['错误', '错', '不对', '不是', '假', '×', '*', 'x', 'f', 'false', 'n', 'no', 'b'];
    var i;
    for (i = 0; i < yes.length; i++) if (s === yes[i]) return 0;
    for (i = 0; i < no.length; i++) if (s === no[i]) return 1;
    return null;
  }

  /**
   * 把「任意形式的选项答案」解析为选项下标。
   * 支持：字母(A/B/C/D)、下标(0/1/2/3 或 1/2/3/4)、选项原文、判断题口语写法。
   */
  function resolveChoiceIndex(question, input) {
    var options = question.options || [];
    if (input === null || input === undefined) return null;

    if (typeof input === 'number' && isFinite(input)) {
      var n = Math.trunc(input);
      if (n >= 0 && n < options.length) return n;
      if (n >= 1 && n <= options.length) return n - 1;
      return null;
    }

    var raw = String(input);
    var s = normalizeText(raw);
    if (!s) return null;

    // 1) 字母 A/B/C...
    if (/^[a-z]{1,2}$/.test(s)) {
      var letter = s.toUpperCase();
      if (letter.length === 1) {
        var idx = letter.charCodeAt(0) - 65;
        if (idx >= 0 && idx < options.length) return idx;
      }
    }

    // 2) 选项原文匹配（含归一化后匹配）
    for (var i = 0; i < options.length; i++) {
      if (normalizeText(options[i]) === s) return i;
    }

    // 3) 判断题口语写法
    var judgeToken = normalizeJudgeToken(raw);
    if (judgeToken !== null && options.length === 2) {
      var optA = normalizeText(options[0]);
      if (optA === '正确' || optA === '对' || optA === '√') return judgeToken === 0 ? 0 : 1;
      if (optA === '错误' || optA === '错' || optA === '×') return judgeToken === 0 ? 1 : 0;
    }

    // 4) 纯数字下标（返回"选项原文恰好是数字"时不误判，故放在最后）
    if (/^\d+$/.test(s)) {
      var num = parseInt(s, 10);
      if (num >= 0 && num < options.length) return num;
      if (num >= 1 && num <= options.length) return num - 1;
    }

    return null;
  }

  /** 填空题匹配：归一化 + 等价数值 + 去单位 */
  function fillMatches(input, accepted) {
    var given = normalizeText(input);
    if (!given) return { matched: false, hit: null, reason: 'empty' };
    var i;
    for (i = 0; i < accepted.length; i++) {
      var target = normalizeText(accepted[i]);
      if (!target) continue;
      if (given === target) return { matched: true, hit: accepted[i], reason: 'exact' };
      if (stripUnit(given) === target) return { matched: true, hit: accepted[i], reason: 'unit' };
      if (given === stripUnit(target)) return { matched: true, hit: accepted[i], reason: 'unit' };
      var gNum = toNumber(given);
      var tNum = toNumber(target);
      if (gNum !== null && tNum !== null && Math.abs(gNum - tNum) < 1e-9) {
        return { matched: true, hit: accepted[i], reason: 'numeric' };
      }
      var gUnitless = stripUnit(given);
      var tUnitless = stripUnit(target);
      var g2 = toNumber(gUnitless);
      var t2 = toNumber(tUnitless);
      if (g2 !== null && t2 !== null && Math.abs(g2 - t2) < 1e-9) {
        return { matched: true, hit: accepted[i], reason: 'numeric-unit' };
      }
      // 英文单词：允许复数/大小写差异
      if (/^[a-z]+$/.test(given) && /^[a-z]+$/.test(target)) {
        if (given.replace(/s$/, '') === target.replace(/s$/, '')) return { matched: true, hit: accepted[i], reason: 'plural' };
      }
    }
    return { matched: false, hit: null, reason: 'mismatch' };
  }

  /**
   * 统一判分入口。
   * @param {Object} question 题目
   * @param {*} input 学生作答：选项字母 / 下标 / 选项原文 / 填空文本
   * @returns {{correct:boolean, expectedIndex:(number|null), expectedText:string, givenIndex:(number|null), givenText:string, reason:string}}
   */
  function grade(question, input) {
    var type = question.type || question.questionType;
    var options = question.options || [];

    if (type === 'single' || type === 'judge' || type === 'multiple') {
      var expectedIndex = resolveChoiceIndex(question, question.answer);
      var givenIndex = resolveChoiceIndex(question, input);
      var expectedText = expectedIndex === null ? String(question.answer) : options[expectedIndex];
      var givenText = givenIndex === null ? String(input === undefined || input === null ? '' : input) : options[givenIndex];
      return {
        correct: givenIndex !== null && expectedIndex !== null && givenIndex === expectedIndex,
        expectedIndex: expectedIndex,
        expectedText: expectedText,
        givenIndex: givenIndex,
        givenText: givenText,
        reason: givenIndex === null ? 'unparsable' : (givenIndex === expectedIndex ? 'match' : 'mismatch')
      };
    }

    // 填空题
    var accepted = [question.answer].concat(question.accept || []).filter(function (v) { return v !== undefined && v !== null && String(v) !== ''; });
    var res = fillMatches(input, accepted);
    return {
      correct: res.matched,
      expectedIndex: null,
      expectedText: String(question.answer === undefined ? '' : question.answer),
      givenIndex: null,
      givenText: input === undefined || input === null ? '' : String(input),
      reason: res.reason
    };
  }

  /**
   * 复刻原版（线上版本）的判分逻辑，用于对比说明"答案为什么会出错"。
   * 原版：选择题直接拿「选项文字」与 answer（存的是 A/B/C/D）比较。
   */
  function legacyGrade(question, optionTextOrFillText) {
    var type = question.type || question.questionType;
    var input = optionTextOrFillText === undefined || optionTextOrFillText === null ? '' : String(optionTextOrFillText);
    if (type === 'single' || type === 'judge') {
      return input === question.answer;
    }
    if (!question.answer) return false;
    return input.trim().toLowerCase().replace(/\s/g, '') === String(question.answer).toLowerCase().replace(/\s/g, '');
  }

  /** 原版"高亮正确答案"的写法：选项文字 === answer，同样会失效 */
  function legacyHighlightIndex(question) {
    var options = question.options || [];
    for (var i = 0; i < options.length; i++) if (options[i] === question.answer) return i;
    return -1;
  }

  /* ============================================================
   * 自检：结构校验 + 正误判定校验 + 原版对比
   * ============================================================ */

  function selfTest(bank) {
    var questions = bank || QUESTION_BANK;
    var failures = [];
    var legacyBroken = [];
    var legacyFixed = [];
    var seenIds = {};
    var stats = { total: questions.length, single: 0, judge: 0, fill: 0 };

    questions.forEach(function (q) {
      var where = q.id || q.content;
      function fail(msg) { failures.push({ id: where, message: msg }); }

      if (seenIds[q.id]) fail('题目 ID 重复');
      seenIds[q.id] = true;
      if (!q.content || !String(q.content).trim()) fail('题干为空');
      if (!q.analysis || !String(q.analysis).trim()) fail('缺少解析');
      if (!subjectByKey(q.subject)) fail('学科非法：' + q.subject);
      if (!q.stage) fail('缺少学段');
      if (!q.difficulty) fail('缺少难度');
      if (q.verified !== true) fail('题目未标记已校验');

      var type = q.type;
      if (type === 'single') stats.single++;
      else if (type === 'judge') stats.judge++;
      else if (type === 'fill') stats.fill++;
      else fail('题型非法：' + type);

      if (type === 'fill') {
        if (!q.answer || !String(q.answer).trim()) fail('填空题缺少答案');
        if (grade(q, q.answer).correct !== true) fail('填空题标准答案无法判为正确');
        (q.accept || []).forEach(function (a) {
          if (!grade(q, a).correct) fail('等价答案无法判为正确：' + a);
        });
      } else {
        var options = q.options || [];
        if (options.length < 2) fail('选项少于 2 个');
        var norm = options.map(normalizeText);
        for (var i = 0; i < norm.length; i++) {
          if (!norm[i]) fail('存在空选项');
          for (var j = i + 1; j < norm.length; j++) if (norm[i] === norm[j]) fail('存在重复选项');
        }
        var expected = resolveChoiceIndex(q, q.answer);
        if (expected === null) fail('无法解析正确答案：' + q.answer);

        if (type === 'judge') {
          if (options.length !== 2) fail('判断题应为 2 个选项');
          if (normalizeText(options[0]) !== '正确' || normalizeText(options[1]) !== '错误') fail('判断题选项应为 ["正确","错误"]');
        }

        // 正确答案必须判对
        if (expected !== null) {
          if (!grade(q, options[expected]).correct) fail('用选项原文作答应判为正确');
          if (!grade(q, expected).correct) fail('用选项下标作答应判为正确');
          if (!grade(q, String.fromCharCode(65 + expected)).correct) fail('用选项字母作答应判为正确');
        }
        // 其它选项必须判错
        options.forEach(function (text, idx) {
          if (idx === expected) return;
          if (grade(q, text).correct) fail('错误选项被判定为正确：' + text);
        });

        // 与原版逻辑对比
        if (expected !== null) {
          var legacyOk = legacyGrade(q, options[expected]);
          var legacyHl = legacyHighlightIndex(q);
          var broken = !legacyOk || legacyHl !== expected;
          if (broken) {
            legacyBroken.push({ id: q.id, content: q.content, legacyOk: legacyOk, legacyHighlight: legacyHl, expectedIndex: expected });
          } else {
            legacyFixed.push(q.id);
          }
        }
      }

      // 干扰测试：选项字母与下标混用不应导致误判
      if (type !== 'fill') {
        var lower = String(q.answer || '').toLowerCase();
        if (lower && !grade(q, lower).correct && resolveChoiceIndex(q, lower) !== null) {
          fail('小写字母答案解析失败');
        }
      }
    });

    var bySubject = {};
    SUBJECTS.forEach(function (s) { bySubject[s.key] = { name: s.name, count: 0, single: 0, judge: 0, fill: 0 }; });
    questions.forEach(function (q) {
      var bucket = bySubject[q.subject];
      if (!bucket) return;
      bucket.count++;
      bucket[q.type] = (bucket[q.type] || 0) + 1;
    });

    return {
      total: stats.total,
      passed: stats.total - failures.length,
      ok: failures.length === 0,
      stats: stats,
      bySubject: bySubject,
      failures: failures,
      legacyBrokenCount: legacyBroken.length,
      legacyBroken: legacyBroken,
      legacyOk: legacyFixed.length
    };
  }

  /* ============================================================
   * 实时积分榜单（本地实时模拟内核）
   * 真实部署时，把 tick() 换成后端推送 / 轮询即可。
   * ============================================================ */

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var PEER_SEED = [
    { id: 'p1', name: '王雨欣', emoji: '🐰', klass: '三年级 1 班', subject: 'chinese', level: 1.28 },
    { id: 'p2', name: '李泽宇', emoji: '🐯', klass: '三年级 1 班', subject: 'math', level: 1.22 },
    { id: 'p3', name: '陈思远', emoji: '🐼', klass: '三年级 2 班', subject: 'physics', level: 1.18 },
    { id: 'p4', name: '张浩然', emoji: '🦊', klass: '三年级 2 班', subject: 'math', level: 1.12 },
    { id: 'p5', name: '刘梓涵', emoji: '🐨', klass: '三年级 1 班', subject: 'english', level: 1.08 },
    { id: 'p6', name: '赵一诺', emoji: '🐹', klass: '四年级 1 班', subject: 'biology', level: 1.03 },
    { id: 'p7', name: '孙嘉禾', emoji: '🐻', klass: '四年级 1 班', subject: 'history', level: 0.98 },
    { id: 'p8', name: '周子航', emoji: '🐵', klass: '四年级 2 班', subject: 'geography', level: 0.94 },
    { id: 'p9', name: '吴梦琪', emoji: '🦄', klass: '四年级 2 班', subject: 'chinese', level: 0.9 },
    { id: 'p10', name: '郑清越', emoji: '🐬', klass: '五年级 1 班', subject: 'chemistry', level: 0.86 },
    { id: 'p11', name: '何书瑶', emoji: '🐧', klass: '五年级 1 班', subject: 'english', level: 0.82 },
    { id: 'p12', name: '徐嘉宸', emoji: '🐙', klass: '五年级 2 班', subject: 'politics', level: 0.78 },
    { id: 'p13', name: '林语桐', emoji: '🦋', klass: '五年级 2 班', subject: 'math', level: 0.74 },
    { id: 'p14', name: '高梓睿', emoji: '🐢', klass: '六年级 1 班', subject: 'physics', level: 0.7 }
  ];

  function createLeaderboard(config) {
    config = config || {};
    var rand = mulberry32(config.seed || 20261009);
    var tickCount = 0;
    var listeners = [];
    var timer = null;

    function blankPoints() { return { today: 0, week: 0, total: 0 }; }

    var me = config.me || {
      id: 'me',
      name: '我',
      emoji: '🐱',
      klass: '三年级 1 班',
      isMe: true,
      // 给"我"一个合理的初始积分，榜单上能看到自己并逐步超越同学
      points: { today: 240, week: 880, total: 3260 },
      correct: 0,
      total: 0,
      streak: 0,
      subjectPoints: { math: 980, chinese: 620, english: 540, physics: 320, chemistry: 280, biology: 180, history: 160, politics: 100, geography: 80 }
    };
    if (!me.points) me.points = blankPoints();
    if (!me.subjectPoints) me.subjectPoints = {};
    me.isMe = true;

    var peers = PEER_SEED.map(function (p, i) {
      var base = Math.round(760 * p.level + rand() * 260);
      var pts = {
        today: Math.round(base * 0.28 + rand() * 90),
        week: Math.round(base * 0.72 + rand() * 140),
        total: base * 3 + Math.round(rand() * 800)
      };
      return {
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        klass: p.klass,
        isMe: false,
        focus: p.subject,
        level: p.level,
        points: pts,
        lastGain: 0,
        subjectPoints: (function () {
          var sp = {};
          SUBJECTS.forEach(function (s) { sp[s.key] = Math.round(pts.total * (0.05 + rand() * 0.12)); });
          sp[p.subject] += Math.round(pts.total * 0.2);
          return sp;
        })(),
        correct: Math.round(pts.total * 0.82),
        streak: 1 + Math.floor(rand() * 12)
      };
    });

    var events = [];
    var riseNames = ['连击', '满血通关', '首次答对', '错题修复', '限时挑战'];

    function pushEvent(entry) {
      events.unshift(entry);
      if (events.length > 40) events.pop();
    }

    function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

    function award(participant, gain, subjectKey, label) {
      participant.points.today += gain;
      participant.points.week += gain;
      participant.points.total += gain;
      participant.subjectPoints[subjectKey] = (participant.subjectPoints[subjectKey] || 0) + gain;
      var subj = subjectByKey(subjectKey);
      pushEvent({
        id: participant.id + '-' + tickCount + '-' + Math.floor(rand() * 10000),
        name: participant.name,
        emoji: participant.emoji,
        isMe: !!participant.isMe,
        subject: subj.name,
        subjectKey: subjectKey,
        gain: gain,
        label: label,
        at: Date.now()
      });
    }

    function tick() {
      tickCount++;
      var bursts = 1 + (rand() < 0.42 ? 1 : 0) + (rand() < 0.12 ? 1 : 0);
      for (var i = 0; i < bursts; i++) {
        var actor = peers[Math.floor(rand() * peers.length)];
        var gain = 20 + Math.round(rand() * 160 * actor.level);
        if (rand() < 0.16) gain += 60;
        award(actor, gain, actor.focus, pick(riseNames));
      }
      if (rand() < 0.05) {
        var lucky = peers[Math.floor(rand() * peers.length)];
        award(lucky, 200, lucky.focus, '通关奖励');
      }
      emit();
    }

    function emit() {
      listeners.forEach(function (fn) {
        try { fn(snapshot()); } catch (e) { /* 忽略单个监听器错误 */ }
      });
    }

    function entries(subjectKey) {
      var list = [me].concat(peers).map(function (p) {
        var pts = subjectKey && subjectKey !== 'all'
          ? { today: Math.round((p.subjectPoints[subjectKey] || 0) * 0.35), week: Math.round((p.subjectPoints[subjectKey] || 0) * 0.75), total: p.subjectPoints[subjectKey] || 0 }
          : p.points;
        return {
          id: p.id,
          name: p.name,
          emoji: p.emoji,
          klass: p.klass,
          isMe: !!p.isMe,
          focus: p.focus,
          level: p.level || 1,
          points: pts,
          streak: p.streak || 0
        };
      });
      return list;
    }

    var prevRanks = {};

    function snapshot(opts) {
      opts = opts || {};
      var range = opts.range || 'today';
      var subjectKey = opts.subject || 'all';
      var list = entries(subjectKey).map(function (e) {
        return Object.assign({}, e, { score: e.points[range] || 0 });
      });
      list.sort(function (a, b) { return b.score - a.score || a.name.localeCompare(b.name, 'zh'); });
      list.forEach(function (e, idx) {
        e.rank = idx + 1;
        var key = range + ':' + subjectKey + ':' + e.id;
        e.prevRank = prevRanks[key] !== undefined ? prevRanks[key] : e.rank;
        e.delta = e.prevRank - e.rank;
        prevRanks[key] = e.rank;
      });
      return { entries: list, events: events.slice(0, 12), range: range, subject: subjectKey, tick: tickCount, at: Date.now() };
    }

    return {
      me: me,
      peers: peers,
      snapshot: snapshot,
      subscribe: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
      start: function (interval) {
        if (timer) return;
        timer = setInterval(tick, interval || 1800);
      },
      stop: function () { if (timer) { clearInterval(timer); timer = null; } },
      tick: tick,
      /** 记录"我"的真实得分（由闯关/竞速产生） */
      addMine: function (gain, subjectKey, label) {
        award(me, gain, subjectKey || me.focus || 'math', label || '答对题目');
        emit();
        return gain;
      },
      addMineAnswer: function (correct, subjectKey, bonus) {
        me.total += 1;
        if (correct) {
          me.correct += 1;
          me.streak += 1;
          var gain = 12 + Math.min(me.streak, 10) * 2 + Math.max(0, Math.min(50, Number(bonus) || 0));
          return this.addMine(gain, subjectKey, me.streak >= 3 ? '连击 ×' + me.streak : '答对题目');
        }
        me.streak = 0;
        return 0;
      },
      toJSON: function () {
        return {
          me: me,
          peers: peers.map(function (p) { return { id: p.id, points: p.points, subjectPoints: p.subjectPoints, streak: p.streak }; }),
          tickCount: tickCount
        };
      },
      load: function (state) {
        if (!state) return;
        if (state.me) {
          me.points = state.me.points || me.points;
          me.correct = state.me.correct || 0;
          me.total = state.me.total || 0;
          me.streak = state.me.streak || 0;
          me.subjectPoints = state.me.subjectPoints || {};
        }
        (state.peers || []).forEach(function (saved) {
          var p = peers.filter(function (x) { return x.id === saved.id; })[0];
          if (!p) return;
          p.points = saved.points || p.points;
          p.subjectPoints = saved.subjectPoints || p.subjectPoints;
          p.streak = saved.streak || p.streak;
        });
        tickCount = state.tickCount || 0;
      }
    };
  }

  /* ============================================================
   * 工具
   * ============================================================ */

  function questionsFor(opts) {
    opts = opts || {};
    var list = QUESTION_BANK.filter(function (q) {
      if (opts.subject && opts.subject !== 'all' && q.subject !== opts.subject) return false;
      if (opts.stage && opts.stage !== 'all' && q.stage !== opts.stage) return false;
      if (opts.difficulty && opts.difficulty !== 'all' && q.difficulty !== opts.difficulty) return false;
      if (opts.type && opts.type !== 'all' && q.type !== opts.type) return false;
      if (opts.ids && opts.ids.indexOf(q.id) === -1) return false;
      return true;
    });
    if (opts.shuffle) list = shuffle(list, opts.seed || Date.now());
    return list;
  }

  function shuffle(list, seed) {
    var rand = mulberry32(seed || 1);
    var arr = list.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  return {
    SUBJECTS: SUBJECTS,
    STAGES: STAGES,
    DIFFICULTIES: DIFFICULTIES,
    TYPES: TYPES,
    JUDGE_OPTIONS: JUDGE_OPTIONS,
    QUESTION_BANK: QUESTION_BANK,
    subjectByKey: subjectByKey,
    subjectByName: subjectByName,
    normalizeText: normalizeText,
    toNumber: toNumber,
    resolveChoiceIndex: resolveChoiceIndex,
    grade: grade,
    legacyGrade: legacyGrade,
    legacyHighlightIndex: legacyHighlightIndex,
    selfTest: selfTest,
    createLeaderboard: createLeaderboard,
    questionsFor: questionsFor,
    shuffle: shuffle
  };
});
