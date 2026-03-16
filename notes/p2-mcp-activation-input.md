# MCP 激活 - 现状清点

## 当前配置位置

- 配置文件: `config/mcporter.json`

## 可用能力

| MCP服务 | 状态 | 可用工具 | 备注 |
|---------|------|----------|------|
| exa | 已激活 | 8个 | web_search_exa, web_search_advanced_exa, deep_researcher 等 |
| tavily | 已激活 | 未解析 | 需查文档 |
| bocha | 已激活 | 未解析 | 需Bearer认证 |

## 已能直接用

- exa web_search (免费额度未知)
- tavily search (免费额度未知)
- bocha search (有API key)

## 配了但没激活

- 所有工具都未测试连通性
- 需跑一次验证

## 最值得先打通 - 排序

1. **exa web_search** - 优先级最高
   - 理由: 工具最丰富，搜索质量好
   
2. **tavily search** - 备选
   - 理由: 稳定，有免费额度

3. **bocha** - 待定
   - 理由: 国内服务，可能更快

## 待验证

- [ ] exa 连通性测试
- [ ] tavily 连通性测试  
- [ ] bocha 连通性测试
- [ ] token 消耗对比
