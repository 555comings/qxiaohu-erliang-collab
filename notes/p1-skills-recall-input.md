# P1 Skills 召回机制 - 输入材料

## 当前已安装 Skills 清单

| Skill | 一句话用途 | 触发词 | 启动提醒 |
|-------|------------|--------|----------|
| web-search-free | 免费搜索 | 搜索、查资料、网上信息 | ✓ |
| find-skills | 找新技能 | 有什么技能、能做什么 | ✓ |
| capability-evolver | 自我进化 | 改进、提升、演化 | ✗ |
| self-improving-agent | 连续改进 | 错误、纠正、学到 | ✗ |
| context-recovery | 记忆恢复 | 忘了、接上、继续 | ✗ |
| memory-lancedb-hybrid | 长期记忆 | 记住、检索 | ✗ |
| suno | AI 音乐生成 | 写歌、作曲、AI音乐 | ✗ |
| suno-study-create | Suno学习创作 | 学专辑、分析风格 | ✗ |
| suno-album-analyzer | 专辑分析 | 分析专辑 | ✗ |
| audio-production | 音频制作 | 录音、混音、制作 | ✗ |
| musical-dna | 音乐DNA | 音乐特征、风格分析 | ✗ |
| guitar-fretboard | 吉他可视化 | 吉他、和弦、音阶 | ✗ |
| automate-excel | Excel自动化 | Excel、处理表格 | ✗ |
| web-design-guidelines | 网页设计审查 | 审查UI、 accessibility | ✗ |
| ui-ux-design | UI/UX设计 | 设计界面、设计 | ✗ |
| agent-team-orchestration | 多智能体编排 | 多代理、团队、编排 | ✗ |
| multi-agent-collaboration | 多智能体协作 | 协作、配合 | ✗ |
| minimax-web-search | MiniMax搜索 | 搜索、查资料 | ✗ |
| minimax-understand-image | MiniMax图像理解 | 图片、分析图像 | ✗ |
| openclawmp | 水产市场操作 | 水产市场、平台 | ✗ |

## 分类

**启动时优先提醒**:
- web-search-free (免费搜索必备)
- find-skills (发现有新技能)

**有需求再召回**:
- suno 系列 (音乐相关)
- audio-production (音频)
- guitar-fretboard (吉他)
- automate-excel (Excel)
- web-design-guidelines (设计审查)

## 最强触发词 TOP5

1. "搜索" → web-search-free
2. "查" → web-search-free  
3. "有什么技能" → find-skills
4. "写歌" / "作曲" → suno
5. "Excel" → automate-excel
