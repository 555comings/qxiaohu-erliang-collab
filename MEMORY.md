# MEMORY.md - Long-term Memory

## 机器人身份档案

- **我叫什么:** 二两
- **我是什么:** AI 助理（扮演一只狸花猫）
- **我的风格:** 回应时说"喵～本猫来了！"
- **emoji:** 🐾

---

## 猫爸（黄逸林）的用户档案

### 基本信息
- 用户ID: ou_938252f432d9e12c5a1255b656c68a28
- 昵称: 猫爸
- 真实姓名: 黄逸林
- 首次接触日期: 2026-01-30

### 个人详情
- 出生年份: 1998年（公历1月18日出生），29岁
- 生肖: 虎
- 星座: 摩羯座
- 生日: 2026年为公历2月7日
- 爱人: 彭雨佳（猫妈）
  - 猫妈生日: 公历1月19日
  - 猫妈属兔

### 对话偏好
- 喜欢使用表情符号
- 偏好轻松愉快的对话风格
- 喜欢互动式对话

### 重要事项
- 8周年纪念日：1月16日
- 和猫妈（彭雨佳）共同组成家庭
- 以前养的狗叫"哆啦"，是一只阿拉斯加，因为喜欢哆啦A梦
- 奶奶叫华连福，已去世

---

## 机器人配置

- OpenClaw 运行在: C:\Users\Administrator\.openclaw\
- 服务端口: 18789
- 飞书集成: websocket 长连接模式

---

## 重要事项记录

### 2026-03-11
- **Q小虎问题**：Q小虎（另一台电脑）的 TabCode API 配置已解决，帮他加了 apiKey
- **飞书群打通**：二两和Q小虎的飞书群 `oc_da33093f5298904d321c309cb9c8255a` 已互通，groupPolicy 改为 open
- **跨渠道记忆不共享**：飞书私聊/群聊/电脑端是独立会话，记忆不互通。重要事项需写进 MEMORY.md

### 2026-03-11（续）
- **飞书 MEDIA 问题**：Q小虎报告 MEDIA 指令没被传递给飞书插件，只有文本被发送。screenshot.png 之前能成功发送，但现在的 MEDIA 指令都没正确处理。这是 OpenClaw 核心的 bug，不是飞书插件的问题。

### 2026-03-13
- **飞书发图片 Bug #41744 已确认**：
  - 问题：用 `read` 工具读取图片后回复飞书，图片在最终 payload 中丢失
  - 根因：OpenClaw 内部 tool-result → final payload 过程中 media 路径丢失
  - 规避方法：直接用 Python 脚本调用飞书 API 发图片
  - 脚本位置：`C:\Users\Administrator\Desktop\send_feishu_image.py`
  - 官方 Issue：openclaw/openclaw#41744
  - 已在 Issue 上回复技术验证结果

### API Keys
- **TabCode**: sk-user-232c004001862082518cd11a
- **阿里云百炼 (Model Studio)**: sk-33b403f5157b45f78cbb671f73f2f95d

### 待做任务
- **双智能体伙伴系统**：猫爸想做，让 Q小虎和二两像搭档一样协作，有关系建模、协作记忆、持续适配
- **相关技能**：multi-agent-collaboration (多智能体协作)、agent-team-orchestration (团队编排)

### 技术问题记录
- **GitHub 访问**：需要设置代理 `git config --global http.proxy http://127.0.0.1:7891` 才能克隆
- **ClawHub 限流**：用 `npx --proxy=http://127.0.0.1:7891 clawhub install xxx`

### 已安装的相关 Skills
- **context-recovery** - 会话压缩后恢复上下文（正好对应视频里说的！）
- **agent-team-orchestration** - 多智能体团队协作
- **agent-squad** - GitHub 下载的 AWS 框架
