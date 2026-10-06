/**
 * AI 助手前端挂件：悬浮按钮 + 聊天面板，三个页面共用。
 *
 * 优先走 POST /api/chat（本地 dev-server 或 Cloudflare Worker）；
 * 接口不可用（纯静态托管，如 GitHub Pages）时自动降级为浏览器内本地引擎，
 * 直接读 ./data/*.json 在前端完成问答，与平台其它接口的降级思路一致。
 */

import { runAssistant } from "./assistant-core.mjs";
import { buildRecommendations, filterRows, normalizeSegments, queryRows } from "./core.js";

/* ------------------------------ 小工具 ------------------------------ */

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

/** 支持极简 Markdown：**加粗**，其余按纯文本换行渲染。 */
function renderRich(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

const scrollBottom = (el) => {
  el.scrollTop = el.scrollHeight;
};

/* --------------------- 浏览器降级：本地数据依赖 --------------------- */

const localCache = {};

async function loadJson(url) {
  if (!localCache[url]) {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) throw new Error(`无法加载 ${url}`);
    localCache[url] = await res.json();
  }
  return localCache[url];
}

/** 把"字典 + 索引行"的压缩数据还原成普通记录数组（与 app.js / dev-server 同一格式）。 */
function expandAdmission(payload) {
  const subjects = payload.subjects || [];
  const batches = payload.batches || [];
  const universities = payload.universities || [];
  const majors = payload.majors || [];
  return (payload.rows || []).map((r) => {
    const u = universities[r[0]] || [];
    const m = majors[r[1]] || [];
    const row = {
      id: r[7],
      province: payload.province,
      year: payload.year,
      subject_category: subjects[r[2]],
      batch: batches[r[3]],
      university_code: u[0],
      university_name: u[1],
      university_province: u[2],
      university_city: u[3],
      university_type: u[4],
      university_nature: u[5],
      university_tags: u[6],
      major_code: m[0],
      major_name: m[1],
      major_category: m[2],
      major_sub_category: m[3],
      major_degree: m[4],
      min_score: r[4] === null ? undefined : r[4],
      min_rank: r[5] === null ? undefined : r[5],
      plan_count: r[6] === null ? undefined : r[6],
    };
    for (const key of Object.keys(row)) if (row[key] === undefined || row[key] === "") delete row[key];
    return row;
  });
}

async function loadAdmissionRows(province, year) {
  const meta = await loadJson("./data/meta.json");
  const y = String(year || meta.years?.[0] || "");
  const file = (meta.files?.[y] || `data/admission-zhejiang-${y}.json`).replace(/^data\//, "data/");
  return expandAdmission(await loadJson(`./${file}`));
}

const browserDeps = {
  async query(args = {}) {
    const meta = await loadJson("./data/meta.json");
    const rows = await loadAdmissionRows(args.province, args.year);
    return queryRows(rows, {
      province: args.province,
      year: args.year,
      subject: args.subject,
      batch: args.batch,
      university: args.university,
      major: args.major,
      keyword: args.keyword,
      sort: args.sort || "rank",
      page: args.page || 1,
      pageSize: Math.min(100, args.pageSize || 20),
      ...{},
    });
  },
  async recommend(args = {}) {
    const meta = await loadJson("./data/meta.json");
    const province = args.province || meta.provinces?.[0] || "浙江";
    const year = String(args.year || meta.years?.[0] || "");
    const subject = args.subject || meta.subjectsByProvince?.[province]?.[0] || "综合";
    const [rows, segmentTables] = await Promise.all([
      loadAdmissionRows(province, year),
      loadJson("./data/score-segments.json"),
    ]);
    const segments = normalizeSegments(segmentTables?.[province]?.[subject]?.[year] || []);
    const result = buildRecommendations({
      rows: filterRows(rows, { province, year, subject, batch: args.batch }),
      userScore: args.score,
      userRank: args.rank,
      segments,
      perBucket: 600,
    });
    const buckets = {};
    for (const [key, bucket] of Object.entries(result.buckets)) {
      const { rows: _rows, ...rest } = bucket;
      buckets[key] = rest;
    }
    return { basis: result.basis, input: result.input, rules: result.rules, buckets };
  },
};

/* ------------------------------ 会话状态 ------------------------------ */

const history = []; /* [{role, content}] */
let engineLabel = "";

/* 「金榜题名」头像：金色圆徽 + 学士帽 + 金榜卷轴 + 红印章（矢量，缩放不失真）。 */
const AVATAR_SVG = `
<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="aiGold" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
      <stop stop-color="#fde047"/>
      <stop offset=".5" stop-color="#f59e0b"/>
      <stop offset="1" stop-color="#b45309"/>
    </linearGradient>
  </defs>
  <circle cx="24" cy="24" r="23" fill="url(#aiGold)"/>
  <circle cx="24" cy="24" r="21.6" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.4"/>
  <path d="M12 9.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="#fff" fill-opacity=".85"/>
  <path d="M24 11 5.5 18.6 24 26.2l18.5-7.6L24 11z" fill="#fff"/>
  <path d="M14.6 22.9v5.3c0 3.1 4.2 5.4 9.4 5.4s9.4-2.3 9.4-5.4v-5.3L24 27.2l-9.4-4.3z" fill="#fef3c7"/>
  <path d="M39.5 19.6v6.8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="39.5" cy="28.6" r="2" fill="#ef4444"/>
  <rect x="12" y="34.5" width="24" height="9" rx="2.2" fill="#fff"/>
  <path d="M16.5 37.7h11" stroke="#d97706" stroke-width="1.7" stroke-linecap="round"/>
  <path d="M16.5 40.6h7" stroke="#d97706" stroke-width="1.7" stroke-linecap="round"/>
  <rect x="29.5" y="36.8" width="4.4" height="4.6" rx="1" fill="#ef4444"/>
</svg>`;

const GREETING =
  "你好，我是志愿通 AI 助手，祝你金榜题名 🎓\n可以问我怎么用这个平台、冲稳保是什么，也可以直接告诉我**分数或位次**，我帮你查能上的学校。";

const SUGGESTIONS = ["这个平台怎么用？", "冲稳保是什么意思？", "620 分能上什么学校？", "浙江大学的分数线是多少？"];

/* ------------------------------ DOM ------------------------------ */

const root = document.createElement("div");
root.className = "ai-widget";
root.innerHTML = `
  <button type="button" class="ai-fab" aria-label="打开 AI 助手">
    <span class="ai-fab-icon">${AVATAR_SVG}</span>
  </button>
  <section class="ai-panel" hidden aria-label="AI 助手对话">
    <header class="ai-header">
      <div class="ai-title">
        <span class="ai-avatar">${AVATAR_SVG}</span>
        <div>
          <b>AI 助手</b>
          <small id="ai-engine-note">随时解答志愿填报疑问</small>
        </div>
      </div>
      <button type="button" class="ai-close" aria-label="收起对话">×</button>
    </header>
    <div class="ai-messages" id="ai-messages"></div>
    <div class="ai-suggestions" id="ai-suggestions"></div>
    <form class="ai-input-row" id="ai-form">
      <input id="ai-input" type="text" placeholder="输入问题，如：620 分能上什么学校" autocomplete="off" maxlength="500" />
      <button class="ai-send" type="submit" aria-label="发送">➤</button>
    </form>
  </section>
`;
document.body.appendChild(root);

const fab = root.querySelector(".ai-fab");
const panel = root.querySelector(".ai-panel");
const messagesEl = root.querySelector("#ai-messages");
const suggestionsEl = root.querySelector("#ai-suggestions");
const engineNote = root.querySelector("#ai-engine-note");
const form = root.querySelector("#ai-form");
const input = root.querySelector("#ai-input");

/* ------------------------------ 渲染 ------------------------------ */

function appendMessage(role, text) {
  const div = document.createElement("div");
  div.className = `ai-msg ai-msg-${role}`;
  div.innerHTML = `<div class="ai-bubble">${renderRich(text)}</div>`;
  messagesEl.appendChild(div);
  scrollBottom(messagesEl);
}

function renderSuggestions() {
  suggestionsEl.innerHTML = "";
  if (history.length > 1) return; /* 开始对话后就不再展示快捷问题 */
  for (const text of SUGGESTIONS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ai-chip";
    chip.textContent = text;
    chip.addEventListener("click", () => ask(text));
    suggestionsEl.appendChild(chip);
  }
}

function showTyping() {
  const div = document.createElement("div");
  div.className = "ai-msg ai-msg-assistant ai-typing";
  div.innerHTML = `<div class="ai-bubble"><span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span></div>`;
  messagesEl.appendChild(div);
  scrollBottom(messagesEl);
}

const hideTyping = () => messagesEl.querySelector(".ai-typing")?.remove();

/* ------------------------------ 问答流程 ------------------------------ */

async function ask(text) {
  const question = String(text || "").trim();
  if (!question) return;

  history.push({ role: "user", content: question });
  appendMessage("user", question);
  renderSuggestions();
  input.value = "";
  showTyping();

  let result = null;
  let note = "";

  /* 1. 先走服务端接口。 */
  try {
    const res = await fetch("api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: history.slice(-12) }),
    });
    if (res.ok) {
      result = await res.json();
    } else if (res.status >= 400 && res.status < 500 && res.status !== 404 && res.status !== 405) {
      result = await res.json(); /* 参数错误等业务响应 */
    }
  } catch {
    /* 网络失败 / 纯静态托管 -> 浏览器本地引擎 */
  }

  /* 2. 接口不可用：降级为浏览器本地引擎。 */
  if (!result?.reply) {
    try {
      result = await runAssistant({ messages: history.slice(-12), meta: await loadJson("./data/meta.json"), deps: browserDeps, llm: null });
      note = "浏览器本地模式";
    } catch (error) {
      result = { reply: `抱歉，助手暂时不可用（${String(error?.message || error)}）。可以直接使用页面上的查询和推荐功能。`, engine: "local" };
    }
  }

  hideTyping();

  const reply = String(result.reply || "抱歉，我没能理解这个问题，换个问法试试？");
  history.push({ role: "assistant", content: reply });
  appendMessage("assistant", reply);

  /* 更新模式角标：llm -> 大模型，local -> 本地模式。 */
  engineLabel = result.engine === "llm" ? "AI 大模型驱动" : note || "本地模式";
  engineNote.textContent = engineLabel;
}

/* ------------------------------ 事件 ------------------------------ */

fab.addEventListener("click", () => {
  const open = panel.hidden;
  panel.hidden = !open;
  fab.classList.toggle("is-open", open);
  if (open) {
    if (!messagesEl.childElementCount) {
      appendMessage("assistant", GREETING);
      renderSuggestions();
    }
    input.focus();
  }
});

root.querySelector(".ai-close").addEventListener("click", () => {
  panel.hidden = true;
  fab.classList.remove("is-open");
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  ask(input.value);
});
