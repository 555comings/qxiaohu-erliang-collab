# 语音识别 (ASR) 技术难题攻克

## 目标
让二两能够听懂用户发的语音，实现语音交互闭环

## 最终方案
使用 **FunASR + SenseVoice** 本地模型

## 硬件
- **显卡**: GTX 1660 SUPER (6GB显存)
- **GPU可用**: ✅ CUDA正常

## 安装步骤

### 1. 安装 PyTorch CUDA 版本
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

### 2. 安装 FunASR
```bash
pip install -U funasr modelscope -i https://mirrors.aliyun.com/pypi/simple/
```

### 3. 设置模型下载镜像
```python
import os
os.environ['MODELSCOPE_SDK_DOWNLOAD_HOST'] = 'https://modelscope.cn'
```

## 使用代码

```python
import os
os.environ['MODELSCOPE_SDK_DOWNLOAD_HOST'] = 'https://modelscope.cn'

import torch
from funasr import AutoModel

# 加载模型到GPU
model = AutoModel(
    model='iic/SenseVoiceSmall',
    device='cuda',
    disable_update=True,
    hub='ms'
)

# 识别音频
result = model.generate(
    input='你的音频文件.ogg',
    language='zh'
)

# 提取文字
text = result[0]['text']
import re
clean_text = re.sub(r'<\|[^|]+\|>', '', text)
print(clean_text)
```

## 测试结果

| 音频文件 | 识别结果 |
|---------|---------|
| 94eb0951.ogg | 你可以给我发语音吗 |
| 7cad5443.ogg | （部分识别）|
| a1514a9d.ogg | （空，太短）|

## 性能
- **GPU**: NVIDIA GeForce GTX 1660 SUPER
- **识别速度**: ~0.3秒/音频
- **显存占用**: ~2GB

## 待优化
1. 音频文件太短识别效果差
2. 编码显示问题（终端乱码，文件写入正常）
3. 接入飞书语音消息

## 创建日期
2026-03-13

## 作者
二两 🐾
