/*!
 * 汤姆猫跑酷学堂 · 伙伴聊天陪伴引擎
 *
 * 默认「本地陪伴模式」：不联网也能陪聊、出题、讲题、鼓励、讲故事。
 * 支持接入真实大模型（OpenAI 兼容接口，见「AI 设置」），也支持浏览器内置的 window.ai。
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof root !== 'undefined') root.PKChat = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  var PK = root.PK;

  /* ============================================================
   * 伙伴人设
   * ============================================================ */
  var PERSONAS = {
    'partner-cat': {
      id: 'partner-cat', name: '汤姆', emoji: '🐱', tone: '温柔机灵的小猫',
      hey: ['喵～', '喵呜，', '（甩了甩尾巴）', '（歪头看着你）'],
      warm: ['我陪着你呢。', '慢慢来，我等你。', '你已经很棒啦。', '有我在，别怕。'],
      cheer: ['喵！加油喵！', '冲鸭！我陪你一起跑！', '再试一次，这次一定行！', '你不孤单，我在终点等你喵～']
    },
    'partner-dino': {
      id: 'partner-dino', name: '阿古', emoji: '🦖', tone: '憨憨的小恐龙',
      hey: ['吼～', '阿古来啦！', '（跺了跺脚）', '嗷呜——'],
      warm: ['阿古陪你！', '别急，慢慢想。', '你已经比昨天厉害啦。', '阿古最喜欢和你一起学习。'],
      cheer: ['吼吼！加油！', '错题算什么，阿古一脚踩平它！', '再来一次，阿古给你鼓劲！', '我们一起冲过终点！']
    },
    'partner-rocket': {
      id: 'partner-rocket', name: '小火箭', emoji: '🚀', tone: '元气满满的火箭',
      hey: ['3、2、1——', '准备发射！', '引擎预热完成！', '哔——连接成功！'],
      warm: ['我一直在线。', '别慌，我们一步一步点火。', '你的燃料很足，我看得出来。', '我陪你飞到终点。'],
      cheer: ['点火！起飞！', '加速加速！超棒的！', '再来一轮，这次冲上天！', '目标：满分！出发！']
    },
    'partner-unicorn': {
      id: 'partner-unicorn', name: '彩虹', emoji: '🦄', tone: '梦幻的独角兽',
      hey: ['✨', '（鬃毛闪着星光）', '嗨呀～', '星星把你送到我这来啦'],
      warm: ['我会一直在这里陪着你。', '别担心，云会散开的。', '你的努力在发光呢。', '抱抱你，然后继续前进吧。'],
      cheer: ['为你撒一把星星！✨', '你可以的，我相信你！', '再往前一步就是彩虹啦！', '我们一起变得闪闪发光！']
    }
  };
  function personaOf(id) { return PERSONAS[id] || PERSONAS['partner-cat']; }
  function allPersonas() { return Object.keys(PERSONAS).map(function (k) { return PERSONAS[k]; }); }

  /* ============================================================
   * 内容库
   * ============================================================ */
  var JOKES = [
    ['为什么数学书总是很忧郁？', '因为它有太多的问题（problem）。'],
    ['为什么小鱼不上学？', '因为它们已经在「学」校里啦～'],
    ['0 对 8 说了什么？', '「你的腰带真好看！」'],
    ['为什么三角形最适合当领导？', '因为它很稳重，从不歪。'],
    ['什么植物最会数学？', '蒲公英——风一吹它就「乘」着走了。'],
    ['为什么橡皮擦总是很谦虚？', '因为它总是把别人的错误擦掉。']
  ];
  var RIDDLES = [
    ['什么东西越洗越脏？', '水。'],
    ['什么东西你有，别人却比你用得多？', '你的名字。'],
    ['什么东西白天跑，晚上停，从来不上学？', '影子。'],
    ['小猫从 1 楼走到 3 楼用了 30 秒，用同样速度走到 6 楼要多久？', '75 秒（1→3 是 2 层，3→6 是 3 层）。']
  ];
  var STORIES = [
    '从前有一只小猫，它总觉得自己跑得慢。于是它每天多跑一百步，一年后，它成了全校最快的那只。它说：「我不怕慢，我怕停。」',
    '小恐龙阿古第一次考试只对了三道题。它没有哭，而是把错题抄在石头上，每天搬一块。搬完最后一块的那天，它考了满分。',
    '小火箭第一次发射只飞了三米就掉下来。它检查了一百遍燃料管，第一百零一次，它飞过了云。',
    '独角兽彩虹的角一开始不发光。它每天给路过的小动物加油，后来大家都说：彩虹的角是全校最亮的东西。'
  ];
  var POEMS = [
    ['《静夜思》 李白', '床前明月光，疑是地上霜。举头望明月，低头思故乡。'],
    ['《春晓》 孟浩然', '春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。'],
    ['《登鹳雀楼》 王之涣', '白日依山尽，黄河入海流。欲穷千里目，更上一层楼。'],
    ['《江雪》 柳宗元', '千山鸟飞绝，万径人踪灭。孤舟蓑笠翁，独钓寒江雪。'],
    ['《望岳》 杜甫', '会当凌绝顶，一览众山小。']
  ];
  var WORDS = [
    ['apple', '苹果', 'I eat an apple every day.'],
    ['school', '学校', 'We go to school at eight.'],
    ['run', '跑', 'I can run very fast.'],
    ['friend', '朋友', 'You are my best friend.'],
    ['study', '学习', 'We study together every day.'],
    ['brave', '勇敢的', 'You are brave enough to try again.'],
    ['practice', '练习', 'Practice makes perfect.'],
    ['dream', '梦想', 'Follow your dream.'],
    ['courage', '勇气', 'It takes courage to admit a mistake.'],
    ['book', '书', 'This book is very interesting.']
  ];
  var TIPS = [
    '小技巧：做题前先把题干里所有数字圈出来，很多错题都是漏看了一个数字。',
    '小技巧：选择题先排除明显错误的选项，剩下的再比较。',
    '小技巧：背单词最好把单词放进句子里记，比单独抄十遍更牢。',
    '小技巧：错题不要只看答案，一定要遮住答案自己重做一遍。',
    '小技巧：每学 25 分钟休息 5 分钟，效率比一直硬撑高很多。',
    '小技巧：把今天学的讲给别人听一遍，你就真的会了。'
  ];
  var MOODS = [
    '听起来你现在有点累。要不要先做一道最简单的题找找手感？',
    '心情不好也没关系，我们先深呼吸三次，然后一起做一件小事。',
    '我懂你的感觉。错了几道题不代表你不行，只代表还有几题没学会而已。',
    '你已经坚持到这里了，这本身就值得表扬。要不要说说发生了什么？'
  ];

  function pick(arr, seed) {
    if (!arr || !arr.length) return '';
    var i = (seed === undefined || seed === null)
      ? Math.floor(Math.random() * arr.length)
      : Math.abs(Math.round(seed)) % arr.length;
    return arr[i];
  }

  /* ============================================================
   * 简单算式解析（不走 eval）
   * ============================================================ */
  function calc(text) {
    var s = String(text).replace(/[×✕]/g, '*').replace(/[÷]/g, '/')
      .replace(/[＋]/g, '+').replace(/[－—–]/g, '-').replace(/（/g, '(').replace(/）/g, ')')
      .replace(/[０-９]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 65248); });
    var m = s.match(/(\(*-?\d+(?:\.\d+)?\)?(?:\s*[-+*/]\s*\(*-?\d+(?:\.\d+)?\)?)+)/);
    if (!m) return null;
    var expr = m[1].replace(/\s+/g, '');
    var tokens = expr.match(/\d+(?:\.\d+)?|[-+*/()]/g);
    if (!tokens) return null;
    var pos = 0;
    function peek() { return tokens[pos]; }
    function next() { return tokens[pos++]; }
    function parseExpr() {
      var v = parseTerm();
      while (peek() === '+' || peek() === '-') {
        var op = next();
        var r = parseTerm();
        v = op === '+' ? v + r : v - r;
      }
      return v;
    }
    function parseTerm() {
      var v = parseFactor();
      while (peek() === '*' || peek() === '/') {
        var op = next();
        var r = parseFactor();
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }
    function parseFactor() {
      var tk = next();
      if (tk === '-') return -parseFactor();
      if (tk === '(') { var v = parseExpr(); if (peek() === ')') next(); return v; }
      return parseFloat(tk);
    }
    var val = parseExpr();
    if (pos !== tokens.length || !isFinite(val)) return null;
    return { expr: expr, value: Math.round(val * 1e6) / 1e6 };
  }

  function normalize(s) {
    return String(s || '').toLowerCase().replace(/[\s\u3000]/g, '')
      .replace(/[。，,；;：:！!？?、“”"'（）()【】\[\]]/g, '');
  }

  /* ============================================================
   * 伙伴大脑
   * ============================================================ */
  function create(partnerId, getCtx) {
    var me = personaOf(partnerId);
    var ctx = function () { return (typeof getCtx === 'function' ? getCtx() : getCtx) || {}; };
    var state = { pending: null, turns: 0 };

    function hey() { return pick(me.hey); }
    function warm() { return pick(me.warm); }
    function cheer() { return pick(me.cheer); }
    function who() {
      var c = ctx();
      return c.userName ? (c.userName + '，') : '';
    }
    function bank() {
      var qs = (PK && PK.QUESTION_BANK) ? PK.QUESTION_BANK.slice() : [];
      return qs.concat(ctx().customQuestions || []);
    }
    function subjectNameOf(key) {
      var s = PK && PK.subjectByKey ? PK.subjectByKey(key) : null;
      return s ? s.name : '综合';
    }
    function pickQuestion(subject, difficulty) {
      var list = bank().filter(function (q) {
        if (subject && subject !== 'all' && q.subject !== subject) return false;
        if (difficulty && q.difficulty !== difficulty) return false;
        return true;
      });
      if (!list.length) list = bank();
      if (!list.length) return null;
      return list[Math.floor(Math.random() * list.length)];
    }
    function questionCard(q) {
      var lines = [q.content];
      if (q.options && q.options.length) {
        q.options.forEach(function (o, i) { lines.push(String.fromCharCode(65 + i) + '. ' + o); });
      }
      return lines.join('\n');
    }
    function askQuiz(subject, difficulty) {
      var q = pickQuestion(subject, difficulty);
      if (!q) return { text: '题库里暂时没有题目，等一下再来考我吧。', chips: ['讲个笑话', '鼓励我一下'] };
      state.pending = q;
      var diffName = { basic: '基础', consolidated: '巩固', final: '冲刺' }[q.difficulty] || '练习';
      return {
        text: hey() + '来一道【' + subjectNameOf(q.subject) + '·' + diffName + '】题：\n\n' + questionCard(q) +
          '\n\n（想不出来就说「提示」，想换一道就说「换一题」）',
        chips: ['提示', '换一题', '答案是'],
        quiz: q
      };
    }
    function judgePending(raw) {
      var q = state.pending;
      if (!q) return null;
      var t = String(raw || '').trim();
      if (!t) return null;
      if (/换一题|换一道|再来一题|别的题/.test(t)) { state.pending = null; return askQuiz(null, null); }
      if (/提示|不会|不知道|给点线索/.test(t)) {
        var hint = (q.analysis || '').split(/。|；/)[0];
        return { text: '提示来啦：' + (hint ? hint + '……' : '再读一遍题干，注意里面的关键词。') + '\n再想想，你可以的！', chips: ['答案是', '换一题'] };
      }
      // 有题待答时，聊天类的语句不应被当成作答（否则讲笑话、问作业都会被"判错"）
      if (/笑话|谜语|故事|古诗|诗词|单词|出题|出道题|鼓励|加油|难过|不开心|开心|你好|谢谢|再见|拜拜|几点了|时间|作业|学什么|计划|多少分|积分|排名|金币|升级|家园|伙伴|你是谁/.test(t)) return null;
      var payload = t.replace(/^答案(是|：|:)\s*/, '');
      var res = PK.grade(q, payload);
      if (res.correct) {
        state.pending = null;
        return {
          text: cheer() + '\n答对啦！正确答案就是「' + res.expectedText + '」。\n解析：' + (q.analysis || '继续加油！'),
          chips: ['再来一题', '讲讲这道题', '讲个笑话']
        };
      }
      var looksLikeAnswer = q.type === 'fill'
        ? (payload.length > 0 && payload.length <= 24)
        : (/^[a-dA-D]$/.test(payload) || (q.options || []).some(function (o) { return normalize(o) === normalize(payload); }));
      if (looksLikeAnswer) {
        return {
          text: warm() + '\n这道还不对哦。' + (q.type === 'fill' ? '' : '再比较一下其它选项，') +
            '提示：' + ((q.analysis || '').split(/。|；/)[0] || '回到题干找关键信息') + '……',
          chips: ['提示', '答案是', '换一题']
        };
      }
      return null;
    }

    function reply(text) {
      state.turns++;
      var raw = String(text || '').trim();
      var t = normalize(raw);
      var c = ctx() || {};

      var judged = judgePending(raw);
      if (judged) return judged;

      if (!t) return { text: hey() + '我在听，想聊点什么？', chips: ['给我出道题', '讲个笑话', '鼓励我一下'] };
      if (/^(你|您)?好$|^hi$|^hello$|^嗨|在吗|早上好|晚上好|下午好|早安|晚安$/.test(t)) {
        return {
          text: hey() + who() + '我是你的伙伴' + me.name + me.emoji + '，' + warm() +
            (c.userName ? '' : ' 你叫什么名字呀？') + '\n你可以让我出题、讲题、讲笑话，或者随便聊聊。',
          chips: c.userName ? ['给我出道题', '讲个笑话', '鼓励我一下'] : ['我叫小明']
        };
      }
      if (/我叫|我的名字是|我是/.test(raw) && raw.length <= 14) {
        var nm = raw.replace(/^.*(我叫|我的名字是|我是)/, '').replace(/[。！!，,、\s]/g, '').trim().slice(0, 12);
        return {
          text: (nm ? '记住啦，' + nm + '！' : '好呀！') + '以后我就叫你' + (nm || '同学') + '。我们一起把错题都干掉吧～',
          chips: ['给我出道题', '今天学什么', '讲个笑话']
        };
      }
      if (/你叫什么|你是谁|你是什么|介绍.*自己/.test(t)) {
        return { text: '我是' + me.name + me.emoji + '，' + me.tone + '，住在你的「我的家园」里。你答对题目我会更开心，金币还能给我升级哦！', chips: ['怎么升级你', '给我出道题'] };
      }
      if (/你好吗|最近怎么样|心情|你开心吗/.test(t)) {
        return { text: '我很好呀！' + warm() + ' 你呢，今天开心吗？', chips: ['我很开心', '我有点难过', '给我出道题'] };
      }
      if (/难过|不开心|伤心|想哭|累了|好累|郁闷|烦|焦虑|紧张|害怕|压力/.test(t)) {
        return { text: hey() + pick(MOODS) + '\n' + warm(), chips: ['听个笑话', '给我出道简单的题', '陪我聊聊天'] };
      }
      if (/鼓励|加油|打气|我不行|我做不到|太难了|怎么办/.test(t)) {
        return { text: cheer() + '\n' + warm() + ' ' + pick(TIPS), chips: ['给我出道题', '讲个故事'] };
      }
      if (/语文|数学|英语|物理|化学|生物|政治|历史|地理/.test(t) && /出题|出道题|来一题|来一道|练|考|做题/.test(t)) {
        var map = { '语文': 'chinese', '数学': 'math', '英语': 'english', '物理': 'physics', '化学': 'chemistry', '生物': 'biology', '政治': 'politics', '历史': 'history', '地理': 'geography' };
        var found = null;
        Object.keys(map).forEach(function (k) { if (t.indexOf(k) !== -1) found = map[k]; });
        return askQuiz(found, null);
      }
      if (/出题|出道题|来一题|来一道|考考我|考我|练习题|做题|测验|刷题|练练/.test(t)) {
        var subj = (c.subject && c.subject !== 'all') ? c.subject : null;
        var diff = null;
        if (/简单|基础|容易/.test(t)) diff = 'basic';
        else if (/难|冲刺|挑战/.test(t)) diff = 'final';
        else if (/巩固|中等/.test(t)) diff = 'consolidated';
        return askQuiz(subj, diff);
      }
      if (!/笑话|谜语|故事|古诗|诗词|单词/.test(t) && /讲|解释|为什么|什么是|怎么做|不会做/.test(t)) {
        var kw = raw.replace(/[?？。！，,]/g, '').replace(/讲讲|解释一下|解释|为什么|什么是|怎么做|不会做|这道题|一下/g, '').trim();
        var hit = null;
        if (kw) {
          bank().forEach(function (q) {
            if (hit) return;
            if (String(q.content).indexOf(kw) !== -1 || String(q.chapter || '').indexOf(kw) !== -1) hit = q;
          });
        }
        if (hit) return { text: '这道题我会！\n' + questionCard(hit) + '\n\n解析：' + (hit.analysis || '再看一遍题干～'), chips: ['给我出道题', '再讲一遍'] };
        return {
          text: hey() + '这个我得多想想。你告诉我是哪一科、哪道题，我可以一步步讲给你听。\n' + pick(TIPS),
          chips: ['给我出道题', '讲个笑话']
        };
      }
      var math = calc(raw);
      if (math && (/[0-9]/.test(raw) && /[-+*/×÷＋－]/.test(raw)) && /算|计算|等于|是多少|=|\?|？/.test(t)) {
        return { text: '我算一下…… ' + math.expr + ' = ' + math.value + ' ✅', chips: ['再来一道', '给我出道题'] };
      }
      if (/笑话|搞笑|逗我/.test(t)) {
        var j = pick(JOKES);
        return { text: '😄 ' + j[0] + '\n' + j[1], chips: ['再讲一个', '讲个故事', '给我出道题'] };
      }
      if (/谜语|猜谜/.test(t)) {
        var r = pick(RIDDLES);
        return { text: '🤔 ' + r[0] + '\n（想好了告诉我，或者问我「答案是」）', chips: ['答案是', '再换一个'] };
      }
      if (/故事|讲故事/.test(t)) {
        return { text: '📖 ' + pick(STORIES) + '\n\n' + warm(), chips: ['再讲一个', '讲个笑话'] };
      }
      if (/古诗|背诗|诗词/.test(t)) {
        var p = pick(POEMS);
        return { text: '📜 ' + p[0] + '\n' + p[1], chips: ['再来一首', '给我出道题'] };
      }
      if (/单词|英语|背单词/.test(t)) {
        var w = pick(WORDS);
        return { text: '🔤 ' + w[0] + ' —— ' + w[1] + '\n例句：' + w[2], chips: ['再学一个', '给我出道英语题'] };
      }
      if (/今天学什么|学什么|学习计划|计划|安排/.test(t)) {
        return {
          text: '我看了一下你的数据：' + (c.wrongCount ? '错题本里还有 ' + c.wrongCount + ' 道题' : '错题本很干净，厉害！') +
            (c.weakSubject ? '，' + c.weakSubject + ' 的正确率偏低，今天重点练它。' : '，今天可以换个学科挑战一下。') +
            '\n建议：① 先修 3 道错题 ② 再跑一关' + (c.subjectName ? '（' + c.subjectName + '）' : '') + ' ③ 最后让我考你一道。',
          chips: ['给我出道题', '讲个笑话']
        };
      }
      if (/我多少分|多少积分|排名|金币|等级|我厉害|我的成绩/.test(t)) {
        return {
          text: '你现在有 🏆 ' + (c.points || 0) + ' 分、🪙 ' + (c.coins || 0) + ' 金币' +
            (c.rank ? '，班级排名第 ' + c.rank + ' 名' : '') + '；我的等级是 Lv' + (c.level || 1) + '。' +
            (c.level < 10 ? '再攒点金币就能给我升级啦！' : '我已经满级啦，超闪亮！'),
          chips: ['怎么升级你', '给我出道题']
        };
      }
      if (/怎么升级|升级你|升级伙伴/.test(t)) {
        return { text: '在「我的家园」里点我的头像就能升级：每升 1 级，一起跑酷时金币 +4%、分数 +3%。升级要花金币，而这些金币得自己答题赚哦～', chips: ['怎么赚金币', '给我出道题'] };
      }
      if (/怎么赚金币|金币怎么来|金币/.test(t)) {
        return { text: '金币是答对题目时从建筑里爆出来的！题目越难越多（基础 10 / 巩固 20 / 冲刺 30），连击还有加成。答错不给金币，所以要看准了再答～', chips: ['给我出道题', '怎么升级你'] };
      }
      if (/作业/.test(t)) {
        return {
          text: c.homeworkCount
            ? '老师给你留了 ' + c.homeworkCount + ' 项作业，去「学生端 → 待完成作业」点「去完成」就行。做不出来随时来问我！'
            : '现在没有待完成的作业。要不要我出一道题陪你练练？',
          chips: ['给我出道题', '今天学什么']
        };
      }
      if (/几点了|现在时间|今天几号|星期几|日期/.test(t)) {
        var d = new Date();
        var week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
        return { text: '现在是 ' + d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 星期' + week + '，' + d.getHours() + ' 点 ' + String(d.getMinutes()).padStart(2, '0') + ' 分。', chips: ['给我出道题', '今天学什么'] };
      }
      if (/谢谢|感谢|谢啦|thanks/.test(t)) {
        return { text: '不客气！' + warm() + ' 有需要随时叫我～', chips: ['给我出道题', '讲个笑话'] };
      }
      if (/再见|拜拜|byebye|bye/.test(t)) {
        return { text: '再见啦！' + warm() + ' 记得明天回来找我玩哦～', chips: ['给我出道题', '讲个笑话'] };
      }
      if (/提示|答案是|答案/.test(t)) {
        return { text: '想要提示的话，先让我出一道题吧～', chips: ['给我出道题'] };
      }

      return {
        text: hey() + '我听到啦：「' + raw.slice(0, 30) + '」。' + warm() +
          '\n我可以帮你出题、讲题、讲笑话、讲故事，也能陪你聊心情。要不要试试？',
        chips: ['给我出道题', '讲个笑话', '今天学什么', '鼓励我一下']
      };
    }

    function greet() {
      var c = ctx() || {};
      return {
        text: hey() + (c.userName ? c.userName + '，' : '') + '我是你的伙伴' + me.name + me.emoji + '！' +
          '\n今天想做什么？我可以出题考你，也可以陪你聊聊天。',
        chips: ['给我出道题', '讲个笑话', '今天学什么', '鼓励我一下']
      };
    }

    return { reply: reply, greet: greet, persona: me, state: state };
  }

  return {
    create: create,
    personaOf: personaOf,
    allPersonas: allPersonas,
    JOKES: JOKES,
    RIDDLES: RIDDLES,
    STORIES: STORIES,
    POEMS: POEMS,
    WORDS: WORDS,
    TIPS: TIPS,
    calc: calc
  };
});
