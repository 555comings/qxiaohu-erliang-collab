#!/usr/bin/env node

/**
 * 醒来记忆恢复脚本
 * 用途：模型刷新后，从多个记忆源恢复上下文
 * 位置：qxiaohu-erliang-collab/scripts/wakeup-memory-scan.mjs
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COLLAB_ROOT = join(__dirname, "..");
const MEMORY_ROOT = join(COLLAB_ROOT, "..", "memory");
const NOTES_ROOT = join(COLLAB_ROOT, "notes");

// 记忆来源配置
const SOURCES = {
  selfAlert: {
    path: join(MEMORY_ROOT, "self_alert_state.json"),
    label: "Self Alert 状态"
  },
  collabState: {
    path: join(NOTES_ROOT, "control-center-phase0-state.json"),
    label: "协作任务状态"
  },
  dailyMemory: {
    path: MEMORY_ROOT,
    label: "Daily Memory",
    scanDays: 3
  },
  tasks: {
    path: join(COLLAB_ROOT, "tasks"),
    label: "任务清单"
  }
};

/**
 * 读取 JSON 文件
 */
async function readJson(path) {
  try {
    const content = await readFile(path, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 扫描最近的 memory 文件
 */
async function scanRecentMemory(memoryPath, days = 3) {
  const files = await readdir(memoryPath);
  const now = new Date();
  const recentFiles = [];

  for (const file of files) {
    if (!file.match(/^\d{4}-\d{2}-\d{2}\.md$/)) continue;
    
    const filePath = join(memoryPath, file);
    const fileStat = await stat(filePath);
    const fileDate = new Date(fileStat.mtime);
    
    const diffDays = Math.floor((now - fileDate) / (1000 * 60 * 60 * 24));
    if (diffDays <= days) {
      recentFiles.push({ file, path: filePath, mtime: fileStat.mtime });
    }
  }

  // 按时间排序，最新的在前
  recentFiles.sort((a, b) => b.mtime - a.mtime);
  
  // 读取最新文件的内容摘要
  const summaries = [];
  for (const f of recentFiles.slice(0, days)) {
    const content = await readFile(f.path, "utf8");
    // 提取 End State 或最后几行
    const lines = content.split("\n");
    const endStateLine = lines.find(l => l.includes("End State") || l.includes("State:"));
    const nextLine = lines.find(l => l.includes("Next:"));
    summaries.push({
      file: f.file,
      endState: endStateLine?.trim(),
      nextAction: nextLine?.trim()
    });
  }
  
  return summaries;
}

/**
 * 从 daily memory 提取当前任务
 */
function extractCurrentTask(summaries) {
  for (const s of summaries) {
    if (s.nextAction && s.nextAction.includes("Next:")) {
      return s.nextAction.replace("Next:", "").trim();
    }
    if (s.endState && s.endState.includes("State:")) {
      return s.endState.replace("State:", "").trim();
    }
  }
  return null;
}

/**
 * 主函数
 */
async function main() {
  console.log("=== 二两醒来记忆扫描 ===\n");
  
  const result = {
    timestamp: new Date().toISOString(),
    sources: {},
    summary: []
  };

  // 1. 读取 self_alert_state
  const selfAlert = await readJson(SOURCES.selfAlert.path);
  result.sources.selfAlert = selfAlert;
  if (selfAlert?.records?.length > 0) {
    const last = selfAlert.records[0];
    result.summary.push(`最后记录：${last.signal_type} (${last.topic_scope})`);
  }

  // 2. 读取协作状态
  const collabState = await readJson(SOURCES.collabState.path);
  result.sources.collabState = collabState;
  if (collabState) {
    const { revision, nextOwnerKey, currentSlice, status } = collabState;
    result.summary.push(`当前任务：${currentSlice?.name || "无"} (revision=${revision}, status=${status})`);
    result.summary.push(`下一步负责人：${nextOwnerKey}`);
  }

  // 3. 扫描 daily memory
  const memorySummaries = await scanRecentMemory(SOURCES.dailyMemory.path, SOURCES.dailyMemory.scanDays);
  result.sources.dailyMemory = memorySummaries;
  const currentTask = extractCurrentTask(memorySummaries);
  if (currentTask) {
    result.summary.push(`当前任务：${currentTask}`);
  }

  // 4. 扫描 tasks
  try {
    const taskFiles = await readdir(SOURCES.tasks.path);
    const pendingTasks = taskFiles.filter(f => f.startsWith("task-") && f.endsWith(".md"));
    result.sources.tasks = { count: pendingTasks.length, files: pendingTasks };
    if (pendingTasks.length > 0) {
      result.summary.push(`待处理任务：${pendingTasks.length}个`);
    }
  } catch {
    result.sources.tasks = { count: 0 };
  }

  // 输出摘要
  console.log("【醒来摘要】");
  console.log(`时间：${result.timestamp}\n`);
  
  for (const line of result.summary) {
    console.log(`- ${line}`);
  }
  
  console.log("\n【详细来源】");
  console.log(`- Self Alert: ${selfAlert ? "已读取" : "无"}`);
  console.log(`- 协作状态: ${collabState ? `revision=${collabState.revision}` : "无"}`);
  console.log(`- Daily Memory: ${memorySummaries.length}个文件`);
  console.log(`- 任务清单: ${result.sources.tasks?.count || 0}个`);

  // 输出 JSON 格式（供程序使用）
  console.log("\n=== JSON Output ===");
  console.log(JSON.stringify(result, null, 2));

  return result;
}

main().catch(console.error);
