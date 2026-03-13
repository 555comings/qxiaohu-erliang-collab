# OpenClaw 接入飞书语音技术方案

## 项目概述

让 OpenClaw 能够通过阿里云语音合成能力，向飞书发送语音消息。

## 技术架构

```
用户(飞书) → OpenClaw → 阿里云语音API → 语音文件 → 飞书API → 用户(飞书)
```

## 所需组件

| 组件 | 说明 |
|------|------|
| OpenClaw | AI 助手运行框架 |
| 阿里云 DashScope | 语音合成服务 |
| 飞书开放平台 | 消息发送服务 |

## 阿里云配置

### 1. 获取 API Key

1. 访问 [阿里云百炼](https://www.aliyun.com/product/bailian)
2. 注册/登录账号
3. 获取 API Key（注意保护，不要泄露）

### 2. 可用语音模型

| 模型 | 说明 |
|------|------|
| sambert-zhiqi-v1 | 稳定可用 |
| cosyvoice-v3.5-flash | 需要额外配置 |

## 代码实现

### 依赖安装

```bash
pip install dashscope requests
```

### 语音合成脚本

```python
import dashscope
from dashscope import SpeechSynthesizer

# 设置 API Key
dashscope.api_key = 'YOUR_API_KEY'

# 生成语音
response = SpeechSynthesizer.call(
    model='sambert-zhiqi-v1',
    text='你好，我是二两！喵～',
    sample_rate=16000
)

# 获取音频数据
audio_data = response.get_audio_data()

# 保存文件
with open('output.wav', 'wb') as f:
    f.write(audio_data)
```

### 飞书发送语音

```python
import requests

# 配置
APP_ID = 'your_app_id'
APP_SECRET = 'your_app_secret'
USER_ID = 'user_open_id'

# 1. 获取 token
def get_token():
    url = "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal"
    data = {"app_id": APP_ID, "app_secret": APP_SECRET}
    resp = requests.post(url, json=data)
    return resp.json()["tenant_access_token"]

# 2. 上传音频
def upload_audio(token, audio_path):
    url = "https://open.feishu.cn/open-apis/im/v1/files"
    files = {
        "file_type": (None, "opus"),
        "file": ("voice.ogg", open(audio_path, "rb"), "audio/ogg")
    }
    resp = requests.post(url, headers={"Authorization": f"Bearer {token}"}, files=files)
    return resp.json()["data"]["file_key"]

# 3. 发送语音消息
def send_audio(token, user_id, file_key):
    url = "https://open.feishu.cn/open-apis/im/v1/messages"
    params = {"receive_id_type": "open_id"}
    data = {
        "receive_id": user_id,
        "msg_type": "audio",
        "content": f'{{"file_key": "{file_key}"}}'
    }
    resp = requests.post(url, params=params, headers={"Authorization": f"Bearer {token}"}, json=data)
    return resp.json()

# 执行
token = get_token()
file_key = upload_audio(token, 'output.wav')
result = send_audio(token, USER_ID, file_key)
```

## 注意事项

1. **API Key 安全**：不要将 API Key 提交到 GitHub
2. **音频格式**：飞书要求 opus 格式
3. **免费额度**：阿里云百炼有免费额度，到期时间注意检查
4. **错误处理**：添加适当的异常处理逻辑

## 扩展方向

- [ ] 语音识别（语音转文字）
- [ ] 多音色选择
- [ ] 实时语音对话

## 参考资料

- [阿里云 DashScope 文档](https://dashscope.aliyuncs.com/)
- [飞书开放平台文档](https://open.feishu.cn/)
- [OpenClaw 官方文档](https://docs.openclaw.ai/)

---

**作者**：二两 & Q小虎  
**创建时间**：2026-03-13  
**项目状态**：✅ 已验证可用
