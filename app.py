from flask import Flask, request, jsonify, make_response
import requests
import os
import logging
import json

# ==================== 配置 ====================
app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

AZURE_KEY = os.environ.get('AZURE_SPEECH_KEY')
AZURE_REGION = os.environ.get('AZURE_SPEECH_REGION', 'eastasia')
AZURE_ENDPOINT = f"https://{AZURE_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1"

if not AZURE_KEY:
    logging.error("⚠️  AZURE_SPEECH_KEY 未设置！")

# ==================== 工具函数 ====================
def json_response(data, status_code=200):
    response = make_response(json.dumps(data, ensure_ascii=False))
    response.headers['Content-Type'] = 'application/json; charset=utf-8'
    return response, status_code

# ==================== 路由 ====================
@app.route('/')
def home():
    return json_response({
        'service': 'Anki Azure 语音测评后端',
        'status': 'running',
        'azure_configured': AZURE_KEY is not None,
        'endpoints': ['POST /evaluate', 'GET /health', 'GET /keepalive']
    })

@app.route('/health')
def health():
    if not AZURE_KEY:
        return json_response({'status': 'error'}, 503)
    return json_response({'status': 'ok'})

@app.route('/keepalive')
def keepalive():
    return json_response({'status': 'alive'})

@app.route('/evaluate', methods=['POST'])
def evaluate():
    if not AZURE_KEY:
        return json_response({'error': '未配置Azure Key'}, 503)

    # ✅ 正确的 try-except 结构（所有 except 与 try 同缩进）
    try:
        # 验证请求
        if 'audio' not in request.files:
            return json_response({'error': '缺少音频'}, 400)
        if 'referenceText' not in request.form:
            return json_response({'error': '缺少文本'}, 400)
        
        audio = request.files['audio'].read()
        text = request.form['referenceText'].strip()
        
        if not text:
            return json_response({'error': '参考文本不能为空'}, 400)

        # 准备Azure请求头
        headers = {
            'Ocp-Apim-Subscription-Key': AZURE_KEY,
            'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
            'Pronunciation-Assessment': json.dumps({
                "ReferenceText": text,
                "GradingSystem": "HundredMark",
                "Granularity": "Phoneme"
            })
        }
        
        # 调用Azure API
        resp = requests.post(
            AZURE_ENDPOINT,
            params={'language': 'en-US', 'format': 'detailed'},
            headers=headers,
            data=audio,
            timeout=30
        )
        
        if resp.status_code != 200:
            logging.error(f"Azure API错误: {resp.text}")
            return json_response({'error': 'Azure测评失败', 'details': resp.text}, resp.status_code)
        
        result = resp.json()
        assessment = result['NBest'][0]['PronunciationAssessment']
        
        return json_response({
            'status': 'success',
            'pronunciationScore': assessment['PronunciationScore'],
            'accuracyScore': assessment['AccuracyScore'],
            'fluencyScore': assessment['FluencyScore'],
            'completenessScore': assessment['CompletenessScore']
        })
    
    # ✅ 所有 except 必须和 try 左对齐
    except requests.exceptions.Timeout:
        logging.warning("Azure请求超时")
        return json_response({'error': '请求超时（30秒）'}, 504)
    
    except requests.exceptions.RequestException as e:
        logging.error(f"网络请求失败: {e}")
        return json_response({'error': '无法连接到Azure服务', 'details': str(e)}, 502)
    
    except KeyError as e:
        logging.error(f"Azure响应缺少字段: {e}")
        return json_response({'error': '响应格式错误', 'details': str(e)}, 500)
    
    except Exception as e:
        logging.error(f"未知错误: {e}", exc_info=True)
        return json_response({'error': '服务器内部错误', 'details': str(e)}, 500)

# ==================== 启动 ====================
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port, debug=False)
