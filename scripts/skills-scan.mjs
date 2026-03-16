#!/usr/bin/env node

/**
 * Skills 召回扫描脚本
 * 用途：启动时扫描所有已安装的skills，生成可用技能提示
 * 位置：qxiaohu-erliang-collab/scripts/skills-scan.mjs
 */

import { readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_ROOT = join(__dirname, "..", "..", "skills");

/**
 * 读取文件内容
 */
async function readFile(path) {
  try {
    const { readFile } = await import("node:fs/promises");
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * 提取 skill 描述
 */
function extractDescription(content) {
  if (!content) return null;
  
  // 优先找 Description
  const descMatch = content.match(/(?:Description|描述)[:：]\s*(.+?)(?:\n|$)/i);
  if (descMatch) return descMatch[1].trim();
  
  // 取第一行
  const lines = content.split("\n").filter(l => l.trim());
  if (lines.length > 0) {
    return lines[0].substring(0, 100);
  }
  return null;
}

/**
 * 扫描 skills 目录
 */
async function scanSkills() {
  const entries = await readdir(SKILLS_ROOT);
  const skills = [];

  for (const entry of entries) {
    // 跳过隐藏目录和 . 开头的
    if (entry.startsWith(".")) continue;
    
    const entryPath = join(SKILLS_ROOT, entry);
    const entryStat = await stat(entryPath);
    
    // 只处理目录
    if (!entryStat.isDirectory()) continue;
    
    // 跳过 skills 目录（那是 clawhub 缓存）
    if (entry === "skills") continue;
    
    // 查找 SKILL.md
    const skillMdPath = join(entryPath, "SKILL.md");
    const description = await extractDescription(await readFile(skillMdPath));
    
    skills.push({
      name: entry,
      path: entryPath,
      description: description || "(无描述)",
      hasSkillMd: !!description
    });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * 生成技能提示
 */
function generateHints(skills) {
  const hints = [];
  
  // 常用技能分类
  const categories = {
    "搜索/查询": skills.filter(s => 
      s.name.includes("search") || s.name.includes("web")
    ),
    "音乐/Suno": skills.filter(s => 
      s.name.includes("suno") || s.name.includes("music") || s.name.includes("audio")
    ),
    "AI/多智能体": skills.filter(s => 
      s.name.includes("agent") || s.name.includes("collaboration") || s.name.includes("evolver")
    ),
    "记忆": skills.filter(s => 
      s.name.includes("memory") || s.name.includes("context")
    ),
    "开发/代码": skills.filter(s => 
      s.name.includes("excel") || s.name.includes("design") || s.name.includes("ui")
    ),
    "飞书/集成": skills.filter(s => 
      s.name.includes("feishu") || s.name.includes("openclaw")
    )
  };

  for (const [cat, list] of Object.entries(categories)) {
    if (list.length > 0) {
      hints.push(`【${cat}】: ${list.map(s => s.name).join(", ")}`);
    }
  }
  
  return hints;
}

/**
 * 主函数
 */
async function main() {
  console.log("=== Skills 召回扫描 ===\n");
  
  const skills = await scanSkills();
  const hints = generateHints(skills);
  
  console.log(`共扫描到 ${skills.length} 个 skills:\n`);
  
  for (const skill of skills) {
    console.log(`- ${skill.name}`);
    console.log(`  描述: ${skill.description}`);
  }
  
  console.log("\n=== 可用技能提示 ===");
  for (const hint of hints) {
    console.log(hint);
  }

  console.log("\n=== JSON Output ===");
  console.log(JSON.stringify({ skills, hints }, null, 2));

  return { skills, hints };
}

main().catch(console.error);
