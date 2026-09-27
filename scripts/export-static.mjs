/**
 * 从本地 D1（miniflare sqlite）导出"真数据静态版"的数据文件。
 *
 * 输出（public/data/）：
 *   meta.json                      —— 筛选器选项 + 统计
 *   score-segments.json            —— 一分一段 { 省: { 科类: { 年: [[分, 位次]] } } }
 *   admission-<省>-<年>.json       —— 字典压缩后的录取数据（字典 + 行数组）
 *
 * 字典压缩的原因：院校名/专业名/城市这些字段每行重复，直接存对象会膨胀到 90MB；
 * 拆成"字典 + 索引行"后每年约 1MB。
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DB_FILE = process.argv[2];
const OUT_DIR = process.argv[3];
if (!DB_FILE || !OUT_DIR) {
  console.error("用法: node export-static.mjs <d1.sqlite> <输出目录>");
  process.exit(1);
}

const PROVINCE = "浙江";
const PROVINCE_SLUG = { 浙江: "zhejiang" };
const slug = PROVINCE_SLUG[PROVINCE] || encodeURIComponent(PROVINCE);

const dataDir = path.join(OUT_DIR, "data");
fs.mkdirSync(dataDir, { recursive: true });
for (const f of fs.readdirSync(dataDir)) fs.unlinkSync(path.join(dataDir, f));

const db = new DatabaseSync(DB_FILE, { readOnly: true });

const SELECT_SQL = `
  SELECT a.id, a.year, a.subject_category, a.batch,
         a.university_code, a.university_name, a.major_code, a.major_name,
         a.min_score, a.min_rank, a.plan_count,
         COALESCE(u.province, '') AS university_province,
         COALESCE(u.city, '')     AS university_city,
         COALESCE(u.type, '')     AS university_type,
         COALESCE(u.nature, '')   AS university_nature,
         COALESCE(u.tags, '')     AS university_tags,
         COALESCE(m.category, '')     AS major_category,
         COALESCE(m.sub_category, '') AS major_sub_category,
         COALESCE(m.degree, '')       AS major_degree
  FROM admission_score a
  LEFT JOIN university u ON u.id = a.university_id OR (a.university_id IS NULL AND u.name = a.university_name)
  LEFT JOIN major      m ON m.id = a.major_id      OR (a.major_id      IS NULL AND m.name = a.major_name)
  WHERE a.province = ? AND a.year = ?
  ORDER BY a.min_rank IS NULL, a.min_rank
`;

const years = db
  .prepare("SELECT DISTINCT year FROM admission_score WHERE province = ? ORDER BY year DESC")
  .all(PROVINCE)
  .map((r) => Number(r.year));

const batches = new Set();
const subjects = new Set();
const allUniversities = new Set();
const allMajors = new Set();
let totalRows = 0;

for (const year of years) {
  const rows = db.prepare(SELECT_SQL).all(PROVINCE, year);

  const batchList = [];
  const batchIndex = new Map();
  const subjectList = [];
  const subjectIndex = new Map();
  const uniList = [];
  const uniIndex = new Map();
  const majorList = [];
  const majorIndex = new Map();

  const idx = (list, map, key, factory) => {
    let i = map.get(key);
    if (i === undefined) {
      i = list.length;
      map.set(key, i);
      list.push(factory());
    }
    return i;
  };

  const outRows = [];
  for (const r of rows) {
    batches.add(r.batch);
    subjects.add(r.subject_category);
    allUniversities.add(r.university_name);
    allMajors.add(r.major_name);
    totalRows += 1;

    const b = idx(batchList, batchIndex, r.batch, () => r.batch);
    const s = idx(subjectList, subjectIndex, r.subject_category, () => r.subject_category);
    const u = idx(uniList, uniIndex, r.university_name, () => [
      r.university_code || "",
      r.university_name,
      r.university_province || "",
      r.university_city || "",
      r.university_type || "",
      r.university_nature || "",
      r.university_tags || "",
    ]);
    const m = idx(majorList, majorIndex, `${r.major_name}|${r.major_code || ""}`, () => [
      r.major_code || "",
      r.major_name,
      r.major_category || "",
      r.major_sub_category || "",
      r.major_degree || "",
    ]);

    outRows.push([u, m, s, b, r.min_score ?? null, r.min_rank ?? null, r.plan_count ?? null, r.id]);
  }

  const payload = {
    v: 1,
    province: PROVINCE,
    year,
    subjects: subjectList,
    batches: batchList,
    universities: uniList,
    majors: majorList,
    rows: outRows,
  };
  const file = path.join(dataDir, `admission-${slug}-${year}.json`);
  fs.writeFileSync(file, JSON.stringify(payload), "utf8");
  const kb = Math.round(fs.statSync(file).size / 1024);
  console.log(`${year}: ${outRows.length} 行 / 院校 ${uniList.length} / 专业 ${majorList.length} -> ${path.basename(file)} (${kb} KB)`);
}

const segRows = db
  .prepare(
    "SELECT year, subject_category, score, rank FROM score_segment WHERE province = ? ORDER BY year DESC, score DESC"
  )
  .all(PROVINCE);

const segTree = { [PROVINCE]: {} };
for (const row of segRows) {
  const subject = row.subject_category || "综合";
  const byYear = (segTree[PROVINCE][subject] ||= {});
  (byYear[String(row.year)] ||= []).push([Number(row.score), Number(row.rank)]);
}
fs.writeFileSync(path.join(dataDir, "score-segments.json"), JSON.stringify(segTree), "utf8");

const warning =
  "数据来源：浙江省教育考试院公开投档数据（2017–2025）整理，仅供参考，请以官方发布为准。" +
  "页面为静态版，全部计算在你自己的浏览器里完成。";

const meta = {
  generatedAt: new Date().toISOString(),
  dataset: "static",
  warning,
  provinces: [PROVINCE],
  years,
  batches: [...batches],
  subjectsByProvince: { [PROVINCE]: [...subjects] },
  files: Object.fromEntries(
    years.map((y) => [String(y), `data/admission-${slug}-${y}.json`])
  ),
  stats: {
    admissionRows: totalRows,
    universities: allUniversities.size,
    majors: allMajors.size,
    segmentRows: segRows.length,
    provinces: 1,
    years: years.length,
  },
};
fs.writeFileSync(path.join(dataDir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
console.log("meta:", JSON.stringify(meta.stats));

const totalKB = fs
  .readdirSync(dataDir)
  .reduce((sum, f) => sum + fs.statSync(path.join(dataDir, f)).size, 0) / 1024;
console.log(`data 目录合计 ${totalKB.toFixed(0)} KB`);
