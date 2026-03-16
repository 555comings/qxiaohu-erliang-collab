#!/usr/bin/env node

/**
 * MCP 配置扫描脚本
 * 用途：扫描 mcporter.json，生成可用 MCP 服务提示
 * 位置：qxiaohu-erliang-collab/scripts/mcp-scan.mjs
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_CONFIG_PATH = join(__dirname, "..", "..", "config", "mcporter.json");

/**
 * 解析 MCP 服务
 */
function parseMcpServers(config) {
  const servers = config?.mcpServers || {};
  const result = [];

  for (const [name, details] of Object.entries(servers)) {
    const server = {
      name,
      baseUrl: details.baseUrl || "",
      headers: details.headers || {},
      // 解析 tools 参数
      tools: []
    };

    // 从 URL 中提取 tools
    if (details.baseUrl) {
      try {
        const url = new URL(details.baseUrl);
        const toolsParam = url.searchParams.get("tools");
        if (toolsParam) {
          server.tools = toolsParam.split(",").map(t => t.trim());
        }
      } catch {
        // URL 解析失败，忽略
      }
    }

    // 隐藏敏感 header
    const safeHeaders = { ...server.headers };
    if (safeHeaders.Authorization) {
      safeHeaders.Authorization = "[HIDDEN]";
    }

    result.push({
      ...server,
      headers: safeHeaders
    });
  }

  return result;
}

/**
 * 归类 MCP 服务
 */
function categorizeServers(serverList) {
  const result = {};
  
  for (const s of serverList) {
    let cat = "其他";
    if (s.name.includes("exa") || s.name.includes("tavily") || s.name.includes("bocha")) {
      cat = "搜索引擎";
    } else if (s.name.includes("code") || s.name.includes("context")) {
      cat = "代码相关";
    } else if (s.name.includes("research") || s.name.includes("company") || s.name.includes("people")) {
      cat = "研究/调研";
    }
    
    if (!result[cat]) result[cat] = [];
    result[cat].push(s);
  }
  
  return result;
}

/**
 * 生成使用提示
 */
function generateUsageHints(servers) {
  const hints = [];

  for (const server of servers) {
    const hint = {
      name: server.name,
      url: server.baseUrl.split("?")[0], // 去掉查询参数
      tools: server.tools.slice(0, 5), // 只显示前5个
      toolCount: server.tools.length
    };
    hints.push(hint);
  }

  return hints;
}

/**
 * 主函数
 */
async function main() {
  console.log("=== MCP 配置扫描 ===\n");

  // 读取配置
  const configContent = await readFile(MCP_CONFIG_PATH, "utf8");
  const config = JSON.parse(configContent);

  // 解析服务
  const servers = parseMcpServers(config);
  const categories = categorizeServers(servers);
  const hints = generateUsageHints(servers);
  const usage = {
    exa: "可用工具: web_search_exa, web_search_advanced_exa, deep_researcher_start 等",
    tavily: "可用工具: search, get_search_results, get_topic_overview 等",
    bocha: "搜索服务，需 Bearer 认证"
  };

  console.log(`共扫描到 ${servers.length} 个 MCP 服务:\n`);

  for (const server of servers) {
    console.log(`【${server.name}】`);
    console.log(`  URL: ${server.baseUrl.split("?")[0]}`);
    if (server.tools.length > 0) {
      console.log(`  工具: ${server.tools.slice(0, 3).join(", ")}${server.tools.length > 3 ? "..." : ""}`);
      console.log(`  共 ${server.tools.length} 个工具`);
    }
    console.log("");
  }

  console.log("=== 分类汇总 ===");
  for (const [cat, list] of Object.entries(categories)) {
    console.log(`【${cat}】: ${list.map(s => s.name).join(", ")}`);
  }

  console.log("\n=== 使用提示 ===");
  for (const [name, hint] of Object.entries(usage)) {
    console.log(`- ${name}: ${hint}`);
  }

  console.log("\n=== JSON Output ===");
  console.log(JSON.stringify({ servers, categories, hints }, null, 2));

  return { servers, categories, hints };
}

main().catch(console.error);
