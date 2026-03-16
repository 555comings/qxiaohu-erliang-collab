#!/usr/bin/env node

/**
 * 飞书卡片能力调研脚本
 * 用途：调研当前飞书消息能力，确定卡片增强可行性
 * 位置：qxiaohu-erliang-collab/scripts/feishu-capability-scan.mjs
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_ROOT = join(__dirname, "..", "..", ".openclaw");

/**
 * 飞书消息类型
 */
const FEISHU_MESSAGE_TYPES = {
  TEXT: "文本消息",
  RICH_TEXT: "富文本消息",
  IMAGE: "图片消息",
  FILE: "文件消息",
  INTERACTIVE_CARD: "交互式卡片",
  SHARE_CHAT: "分享群聊",
  VOICE: "语音消息"
};

/**
 * 交互式卡片元素
 */
const CARD_ELEMENTS = {
  BUTTON: "按钮 (action)",
  SELECT: "选择器 (option_select)",
  DATE_PICKER: "日期选择器 (date_picker)",
  TEXT_INPUT: "文本输入 (text_input)",
  IMAGE: "图片 (image)",
  DIVIDER: "分割线 (divider)",
  MARKDOWN: "Markdown"
};

/**
 * 当前 OpenClaw message 工具能力
 */
const CURRENT_CAPABILITIES = {
  send_text: "✓ 支持",
  send_image: "✓ 支持",
  send_file: "✓ 支持",
  send_rich_text: "✓ 支持",
  interactive_card: "✗ 不支持",
  button_interaction: "✗ 不支持",
  form_input: "✗ 不支持"
};

/**
 * 需要的飞书权限
 */
const REQUIRED_PERMISSIONS = {
  interactive_card: "im:message:card (卡片消息)",
  button_action: "im:message:action:callback (按钮回调)",
  form_submit: "im:message:form:submit (表单提交)"
};

/**
 * 替代方案
 */
const ALTERNATIVES = [
  {
    name: "链接跳转",
    desc: "发送带链接的消息，用户点击跳转",
    permission: "无需额外权限"
  },
  {
    name: "多按钮消息",
    desc: "发送多条消息，每条带不同操作提示",
    permission: "无需额外权限"
  },
  {
    name: "飞书机器人菜单",
    desc: "配置机器人菜单，用户点击触发",
    permission: "im:chat.menu_tree"
  },
  {
    name: "开启卡片权限",
    desc: "在飞书开放平台申请消息卡片权限",
    permission: "需要管理员审批"
  }
];

/**
 * 主函数
 */
async function main() {
  console.log("=== 飞书卡片能力调研 ===\n");

  // 当前消息能力
  console.log("【当前消息能力】");
  for (const [cap, status] of Object.entries(CURRENT_CAPABILITIES)) {
    console.log(`- ${cap}: ${status}`);
  }

  // 需要的权限
  console.log("\n【需要的权限】");
  for (const [feature, perm] of Object.entries(REQUIRED_PERMISSIONS)) {
    console.log(`- ${feature}: ${perm}`);
  }

  // 替代方案
  console.log("\n【替代方案】");
  for (const alt of ALTERNATIVES) {
    console.log(`【${alt.name}】`);
    console.log(`  说明: ${alt.desc}`);
    console.log(`  权限: ${alt.permission}`);
    console.log("");
  }

  // 建议
  console.log("【建议】");
  console.log("1. 短期：使用链接跳转 + 多按钮消息（无需额外权限）");
  console.log("2. 中期：配置飞书机器人菜单");
  console.log("3. 长期：申请交互式卡片权限");

  console.log("\n=== JSON Output ===");
  console.log(JSON.stringify({
    currentCapabilities: CURRENT_CAPABILITIES,
    requiredPermissions: REQUIRED_PERMISSIONS,
    alternatives: ALTERNATIVES,
    recommendation: "短期用链接跳转，中期配菜单，长期申请卡片权限"
  }, null, 2));

  return {
    currentCapabilities: CURRENT_CAPABILITIES,
    alternatives: ALTERNATIVES
  };
}

main().catch(console.error);
