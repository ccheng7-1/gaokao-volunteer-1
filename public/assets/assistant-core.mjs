/**
 * AI 助手共享内核 —— 浏览器、本地服务（dev-server.mjs）、Cloudflare Worker 三端共用。
 *
 * 职责：回答用户关于「志愿通」平台与高考志愿填报的问题。
 *
 * 两种工作模式（由调用方决定）：
 *   1. LLM 模式：调用方传入 llm = { baseUrl, apiKey, model }（OpenAI 兼容接口，
 *      DeepSeek / 通义 / Kimi / OpenAI 都能用），助手通过工具调用（function calling）
 *      实时查库再作答，不编造分数线。
 *   2. 本地模式：llm 为 null 时自动降级为内置规则引擎 —— 意图识别 + 调 deps 查真实数据 +
 *      模板化总结。零配置即可用，纯静态托管（如 GitHub Pages）时浏览器里也能跑。
 *
 * deps 由调用方注入（数据从哪来是调用方的事）：
 *   deps.query(params)    -> 与 GET /api/query 同形状的结果（含 rows / total）
 *   deps.recommend(params)-> 与 GET /api/recommend 同形状的结果（含 buckets）
 */

/* ------------------------------ 消息清洗 ------------------------------ */

/** 只保留 user/assistant 两种角色、内容必须是有限长度的字符串，最多 16 条。 */
export function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
}

export const BUCKET_LABELS = { chong: "冲", wen: "稳", bao: "保" };

/* ------------------------------ 系统提示词 ------------------------------ */

export function buildSystemPrompt(meta) {
  const provinces = (meta?.provinces || []).join("、") || "暂无";
  const years = (meta?.years || []).join("、") || "暂无";
  const stats = meta?.stats || {};
  const subjects = Object.entries(meta?.subjectsByProvince || {})
    .map(([p, list]) => `${p}（${list.join("/")}）`)
    .join("；");

  return [
    "你是「志愿通」高考志愿填报查询平台网站上的 AI 客服助手，负责解答考生和家长的疑问。",
    "",
    "## 平台介绍",
    "- 平台核心流程：查询 → 结果 → 推荐，共三个页面（移动端底部标签栏切换）。",
    "- 查询页：按省份 / 年份 / 科类 / 批次 / 院校 / 专业筛选录取数据；",
    "  结果页：展示院校专业的最低分、最低位次、招生计划、学费，支持排序与分页；",
    "  推荐页：输入分数或位次，输出冲 / 稳 / 保三档学校（按院校聚合，附可报专业）。",
    "",
    "## 当前数据库",
    `- 省份：${provinces}；年份：${years}；科类：${subjects || "见筛选器"}`,
    `- 录取记录 ${stats.admissionRows ?? "?"} 条，覆盖 ${stats.universities ?? "?"} 所院校、${stats.majors ?? "?"} 个专业。`,
    "- 数据来源：各省教育考试院公开投档数据整理，仅供参考，请以官方发布为准。",
    "",
    "## 冲稳保分档规则（位次法）",
    "gap = (该专业往年最低位次 − 考生位次) ÷ max(考生位次, 500)：",
    "- -30% ≤ gap ≤ -8% → 冲（往年录取位次比考生靠前 8%~30%）",
    "- -8% < gap ≤ 12% → 稳；12% < gap ≤ 45% → 保。超出范围不列出。",
    "没有一分一段表时退回分数法：比往年最低分低 0~20 分为冲、高 0~12 分为稳、高 12~30 分为保。",
    "位次比分数更稳定：每年题目难度不同，同一位次对应的分数会变化，建议优先用位次。",
    "",
    "## 可用工具",
    "- query_admissions：查询录取记录（最低分 / 最低位次 / 招生计划等）。用户问某大学、某专业的分数线时必须调用，不要凭记忆回答。",
    "- get_recommend：输入分数或位次生成冲稳保三档推荐。用户问“xxx 分 / 位次 xxx 能上什么学校”时必须调用。",
    "",
    "## 回答要求",
    "- 用简体中文，语气友好、简洁，适合手机阅读；列表不超过 8 项。",
    "- 涉及具体院校、分数、位次时一律以工具返回的真实数据为准，禁止编造。",
    "- 数据库只覆盖上述省份与年份，用户问范围外的省份 / 年份时如实说明，并建议用查询页确认。",
    "- 回答录取相关结论时提醒“仅供参考，正式填报以省考试院公布为准”。",
    "- 不讨论与高考志愿无关的政治敏感话题，礼貌地把话题带回志愿填报。",
  ].join("\n");
}

/* --------------------------- 工具结果压缩 --------------------------- */
/* LLM 上下文有限，把接口返回压成精简结构再喂给模型。 */

export function compactQuery(result) {
  return {
    total: result?.total ?? 0,
    universityCount: result?.universityCount ?? 0,
    page: result?.page,
    rows: (result?.rows || []).slice(0, 10).map((r) => ({
      university: r.university_name,
      major: r.major_name,
      year: r.year,
      batch: r.batch,
      city: r.university_city,
      tags: r.university_tags,
      minScore: r.min_score,
      minRank: r.min_rank,
      plan: r.plan_count,
    })),
  };
}

export function compactRecommend(result) {
  const buckets = {};
  for (const [key, bucket] of Object.entries(result?.buckets || {})) {
    buckets[key] = {
      label: bucket.label || BUCKET_LABELS[key] || key,
      total: bucket.total ?? (bucket.schools || []).length,
      schools: (bucket.schools || []).slice(0, 6).map((s) => ({
        name: s.university_name,
        city: s.university_city,
        tags: s.university_tags,
        minScore: s.min_score,
        minRank: s.min_rank,
        majorCount: s.majorCount,
        topMajors: (s.topMajors || []).slice(0, 3).map((m) => m.major_name),
      })),
    };
  }
  return { basis: result?.basis, input: result?.input, buckets };
}

/* ------------------------------ 统一入口 ------------------------------ */

/**
 * @param {object} params
 * @param {Array}  params.messages 会话历史 [{role, content}]
 * @param {object} params.meta     /api/meta 的结果（数据集概况）
 * @param {object} params.deps     { query(params), recommend(params) }
 * @param {object|null} params.llm { baseUrl, apiKey, model } | null
 * @returns {Promise<{reply: string, engine: "llm"|"local", degraded?: boolean, intent?: string}>}
 */
export async function runAssistant({ messages, meta, deps, llm }) {
  const clean = sanitizeMessages(messages);
  if (!clean.length) {
    return { reply: "你好，请问有什么可以帮你？可以直接问我怎么使用这个平台，或者告诉我分数帮你推荐学校。", engine: "local" };
  }

  if (llm && llm.apiKey) {
    try {
      return await llmAnswer(clean, { meta, deps, llm });
    } catch (error) {
      const local = await localAnswer(clean, { meta, deps });
      return { ...local, degraded: true, error: String(error?.message || error) };
    }
  }
  return localAnswer(clean, { meta, deps });
}

/* ------------------------------ LLM 模式 ------------------------------ */

const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "query_admissions",
      description: "查询历年录取记录（最低分、最低位次、招生计划）。用户询问某院校/专业的分数线时调用。",
      parameters: {
        type: "object",
        properties: {
          province: { type: "string", description: "省份，如 浙江" },
          year: { type: "number", description: "年份，如 2025" },
          subject: { type: "string", description: "科类，如 综合/物理类" },
          batch: { type: "string", description: "批次，如 普通类一段" },
          university: { type: "string", description: "院校名称关键词（模糊匹配）" },
          major: { type: "string", description: "专业名称关键词（模糊匹配）" },
          sort: { type: "string", enum: ["rank", "score", "score_asc", "university", "plan"] },
          page: { type: "number" },
          pageSize: { type: "number", description: "1-100，默认 20" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recommend",
      description: "输入分数或位次，生成冲/稳/保三档院校推荐。用户问“多少分/什么位次能上什么学校”时调用。",
      parameters: {
        type: "object",
        properties: {
          province: { type: "string" },
          year: { type: "number" },
          subject: { type: "string" },
          batch: { type: "string" },
          score: { type: "number", description: "高考分数（与 rank 二选一）" },
          rank: { type: "number", description: "全省位次（与 score 二选一）" },
        },
        required: [],
      },
    },
  },
];

async function callChatCompletions(llm, body) {
  const base = String(llm.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${llm.apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM 接口 ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function runToolCall(call, deps) {
  try {
    const args = JSON.parse(call.function?.arguments || "{}");
    if (call.function?.name === "query_admissions") return compactQuery(await deps.query(args));
    if (call.function?.name === "get_recommend") return compactRecommend(await deps.recommend(args));
    return { error: `unknown_tool:${call.function?.name}` };
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}

async function llmAnswer(messages, { meta, deps, llm }) {
  const convo = [{ role: "system", content: buildSystemPrompt(meta) }, ...messages];

  for (let round = 0; round < 4; round++) {
    const data = await callChatCompletions(llm, {
      model: llm.model,
      messages: convo,
      tools: TOOL_SCHEMAS,
      tool_choice: "auto",
      temperature: 0.4,
      max_tokens: 1200,
    });

    const message = data.choices?.[0]?.message;
    if (!message) throw new Error("LLM 返回为空");

    if (message.tool_calls?.length) {
      convo.push({ role: "assistant", content: message.content || "", tool_calls: message.tool_calls });
      for (const call of message.tool_calls) {
        convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(await runToolCall(call, deps)) });
      }
      continue;
    }

    const reply = String(message.content || "").trim();
    if (!reply) throw new Error("LLM 返回内容为空");
    return { reply, engine: "llm" };
  }
  throw new Error("工具调用轮次超限");
}

/* ------------------------------ 本地模式 ------------------------------ */
/* 规则引擎：意图识别 → 调 deps 查真实数据 → 模板化作答。零配置可用。 */

const lastUserText = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "user") return messages[i].content.trim();
  return "";
};

function extractScore(text) {
  const m = text.match(/(\d{2,3})\s*分/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 100 && n <= 750 ? n : null;
}

function extractRank(text) {
  const m =
    text.match(/(?:位次|名次|排名|排位)[^\d]{0,6}(\d{3,7})/) ||
    text.match(/(\d{3,7})\s*(?:名|位次|位)/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 100 && n <= 500000 ? n : null;
}

function extractUniversity(text) {
  const m = text.match(/([\u4e00-\u9fa5A-Za-z]{2,14}?(?:大学|学院|专科学校))/);
  return m ? m[1] : null;
}

function extractMajor(text) {
  /* 先把院校名从句子中剔掉，避免「浙江大学的计算机专业」把前缀一起吞进专业名。 */
  let rest = text;
  const university = extractUniversity(text);
  if (university) rest = rest.split(university).join(" ");
  const quoted = rest.match(/[「“"]([^」”"]{2,12})[」”"]/);
  if (quoted) return quoted[1];
  const m = rest.match(/([\u4e00-\u9fa5A-Za-z]{2,12}?)专业/);
  if (!m) return null;
  const major = m[1].replace(/^[的了吗呢吧是有在、，。\s]+/, "").replace(/[的了吗呢吧、，。\s]+$/, "");
  return major.length >= 2 ? major : null;
}

function defaultContext(meta) {
  const province = (meta?.provinces || [])[0] || "浙江";
  const year = String((meta?.years || [])[0] || "");
  const subject = meta?.subjectsByProvince?.[province]?.[0] || "综合";
  return { province, year, subject };
}

const fmt = (n) => (n == null || n === "" ? "—" : String(n));

function formatSchoolLine(s) {
  const tags = String(s.university_tags || "").split(/[,，;；\s]+/).filter((t) => /985|211|双一流|双高/.test(t));
  const tagText = tags.length ? `（${tags.join("/")}）` : "";
  const majorText = (s.topMajors || []).slice(0, 2).map((m) => m.major_name).join("、");
  return `· ${s.university_name}${tagText} ${s.university_city || ""} 最低 ${fmt(s.min_score)} 分 / 位次 ${fmt(s.min_rank)}${
    majorText ? `，如 ${majorText}` : ""
  }`;
}

async function localRecommendAnswer(text, { meta, deps }) {
  const score = extractScore(text);
  const rank = extractRank(text);
  if (score == null && rank == null) return null;

  const ctx = defaultContext(meta);
  const result = await deps.recommend({ province: ctx.province, year: Number(ctx.year) || undefined, subject: ctx.subject, score, rank });
  if (!result || result.error) {
    return `抱歉，推荐接口暂时不可用（${result?.message || "请稍后再试"}）。你也可以直接打开「推荐」页输入分数或位次查看三档推荐。`;
  }

  const input = result.input || {};
  const head = `按${result.basis === "score" ? "分数法" : "位次法"}（${ctx.province} ${ctx.year} 年数据）为你分好了三档：`;
  const parts = [head];

  for (const [key, label] of Object.entries(BUCKET_LABELS)) {
    const bucket = result.buckets?.[key];
    const schools = bucket?.schools || [];
    if (!bucket || (!bucket.total && !schools.length)) {
      parts.push(`\n【${label}】暂无合适院校——分数可能超出当前数据库覆盖范围。`);
      continue;
    }
    parts.push(`\n【${label}】共 ${bucket.total ?? schools.length} 所院校，例如：`);
    parts.push(...schools.slice(0, 5).map(formatSchoolLine));
  }

  parts.push("\n以上基于往年投档数据统计，仅供参考；完整名单请到「推荐」页查看，正式填报以省考试院公布为准。");
  return parts.join("\n");
}

async function localQueryAnswer(text, { meta, deps }) {
  const university = extractUniversity(text);
  const major = /专业|分数|线/.test(text) ? extractMajor(text) : null;
  if (!university && !major) return null;

  const ctx = defaultContext(meta);
  const params = {
    province: ctx.province,
    year: Number(ctx.year) || undefined,
    subject: ctx.subject,
    university: university || undefined,
    major: major || undefined,
    sort: "rank",
    pageSize: 8,
  };

  let result = await deps.query(params);
  if (!result?.total && (params.year || params.subject)) {
    /* 换个年份没有就放宽条件：不限年份、科类再试一次。 */
    result = await deps.query({ ...params, year: undefined, subject: undefined, pageSize: 8 });
  }
  let majorMissed = null;
  if (!result?.total && params.major && params.university) {
    /* 专业名没匹配上（不少学校按大类招生，如「工科试验班」），退化为只查该院校。 */
    majorMissed = params.major;
    result = await deps.query({ ...params, major: undefined, pageSize: 8 });
  }
  if (!result || result.error) {
    return `查询接口暂时不可用（${result?.message || "请稍后再试"}），可以先用「查询」页的筛选器查。`;
  }

  const rows = result.rows || [];
  if (!rows.length) {
    const target = [university, major].filter(Boolean).join(" 的 ");
    return `当前数据库（${ctx.province}，${(meta?.years || []).join("/")} 年）里没有找到「${target}」的录取记录。可能是名称写法不同，建议到「查询」页用关键词模糊搜索试试。`;
  }

  const sample = rows[0];
  const headLine = majorMissed
    ? `没找到「${university}」名称含「${majorMissed}」的专业（很多学校按大类招生，如“工科试验班”），先给你这所大学 ${sample.year} 年的招生情况：`
    : `「${university || major}」在 ${ctx.province} 找到 ${result.total} 条记录${
        result.universityCount ? `、涉及 ${result.universityCount} 所院校` : ""
      }（${sample.year} 年 ${sample.batch || ""}），按位次从高到低前几条：`;
  const lines = [
    headLine,
    "",
    ...rows.slice(0, 6).map(
      (r) => `· ${r.university_name} · ${r.major_name}：最低 ${fmt(r.min_score)} 分 / 位次 ${fmt(r.min_rank)}${r.plan_count ? ` · 计划 ${r.plan_count} 人` : ""}`,
    ),
    "",
    "完整结果（含排序、分页、学费）请到「查询」页查看。数据仅供参考，以考试院公布为准。",
  ];
  return lines.join("\n");
}

const LOCAL_FAQ = [
  {
    match: /怎么用|如何使用|使用说明|帮助|能做什么|你会什么|功能|介绍|你是谁|你好|您好|在吗|hi|hello/i,
    reply: [
      "你好！我是这个平台的 AI 助手，可以帮你：",
      "",
      "· 解答平台使用问题（查询 / 结果 / 推荐三个页面怎么配合用）",
      "· 解释冲稳保、位次、一分一段这些概念",
      "· 告诉我分数或位次，直接给你冲稳保三档推荐",
      "· 问某所大学或专业的历年分数线，我帮你查",
      "",
      "比如可以直接问：「620 分能上什么学校」「浙江大学的计算机专业多少分」。",
    ].join("\n"),
  },
  {
    match: /冲稳保|冲一冲|稳一稳|保一保|三档|怎么分档/,
    reply: [
      "「冲稳保」是填报志愿的经典策略，本平台按位次法分三档：",
      "",
      "· 冲：往年录取位次比你靠前 8%~30% 的学校——有希望但没把握，用来博更好的选择；",
      "· 稳：位次和你相当（-8%~+12%）的学校——录取概率较大，是志愿表的主体；",
      "· 保：往年位次比你低 12%~45% 的学校——用来兜底，防止滑档。",
      "",
      "差距太大（冲不上）或太保守（浪费分数）的不会列出。到「推荐」页输入分数或位次即可查看你的三档名单。",
    ].join("\n"),
  },
  {
    match: /位次|排名|一分一段|名次/,
    reply: [
      "位次指你在全省同类考生中的累计排名，比分数更稳定：",
      "",
      "· 每年题目难度不同，同样的分数对应的位次会变化；",
      "· 院校录取本质上是按位次排队，所以参考往年位次更准；",
      "· 一分一段表就是「分数 ↔ 位次」的对照表，本平台会自动用它把你输入的分数换算成位次再分档。",
      "",
      "建议：先在「查询」页看目标院校专业的往年最低位次，再到「推荐」页用你的位次（或分数）生成冲稳保名单。",
    ].join("\n"),
  },
  {
    match: /数据来源|哪些省|什么省|省份|哪一年|多少条|数据量|覆盖|更新/,
    dynamic: (ctx) => {
      const { meta } = ctx;
      const stats = meta?.stats || {};
      return [
        "当前数据库概况：",
        "",
        `· 省份：${(meta?.provinces || []).join("、") || "—"}`,
        `· 年份：${(meta?.years || []).join("、") || "—"}`,
        `· 录取记录 ${stats.admissionRows ?? "?"} 条，覆盖 ${stats.universities ?? "?"} 所院校、${stats.majors ?? "?"} 个专业`,
        "",
        "数据来自各省教育考试院公开投档数据整理，仅供参考，正式填报请以省考试院当年公布为准。",
        "想加别的省份，可以用仓库里的 Excel 导入工具自行灌入数据。",
      ].join("\n");
    },
  },
  {
    match: /学费|多少钱|收费/,
    reply: "结果页的院校专业列表里带有学费信息，到「查询」页选好省份 / 年份 / 科类 / 批次后查询，就能在结果里看到各专业的学费（公办本科大多每年 4000~8000 元，民办和中外合作办学会高不少）。",
  },
  {
    match: /985|211|双一流/,
    reply: "985 / 211 / 双一流是院校层次的标签，结果页和推荐页的学校卡片上都会显示。你可以直接问我某所大学的分数线（比如「浙江大学的计算机专业多少分」），或在「查询」页按院校名称搜索。",
  },
];

export async function localAnswer(messages, { meta, deps }) {
  const text = lastUserText(messages);
  if (!text) {
    return { reply: LOCAL_FAQ[0].reply, engine: "local", intent: "intro" };
  }

  /* 1. 分数 / 位次推荐（优先级最高，因为带数字）。 */
  if (/能上|能报|推荐|可以报|报什么|怎么填|志愿/.test(text) || extractScore(text) || extractRank(text)) {
    const reply = await localRecommendAnswer(text, { meta, deps });
    if (reply) return { reply, engine: "local", intent: "recommend" };
  }

  /* 2. 院校 / 专业分数线查询。 */
  const queryReply = await localQueryAnswer(text, { meta, deps });
  if (queryReply) return { reply: queryReply, engine: "local", intent: "query" };

  /* 3. 常见问题。 */
  for (const item of LOCAL_FAQ) {
    if (item.match.test(text)) {
      const reply = item.dynamic ? item.dynamic({ meta, text }) : item.reply;
      return { reply, engine: "local", intent: "faq" };
    }
  }

  /* 4. 兜底。 */
  return {
    reply: [
      "这个问题我暂时没太理解～你可以换个问法，比如：",
      "",
      "· 「620 分能上什么学校？」（给我分数或位次，出冲稳保三档）",
      "· 「浙江大学的计算机专业分数线多少？」",
      "· 「冲稳保是什么意思？」",
      "",
      "也可以直接用页面上的查询和推荐功能，数据更全。",
    ].join("\n"),
    engine: "local",
    intent: "fallback",
  };
}
