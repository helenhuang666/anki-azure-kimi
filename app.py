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

    # ✅ 正确的 try-except 结构
    try:
        # 验证请求
        if 'audio' not in request.files:
            return json_response({'error': '缺少音频'}, 400)
        if 'referenceText' not in request.form:
            return json_response({'error': '缺少文本'}, 400)
        
        audio = request.files['audio'].read()
        text = request.form['referenceText'].strip()
        
        # 调用Azure
        headers = {
            'Ocp-Apim-Subscription-Key': AZURE_KEY,
            'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
            'Pronunciation-Assessment': json.dumps({
                "ReferenceText": text,
                "GradingSystem": "HundredMark",
                "Granularity": "Phoneme"
            })
        }
        
        resp = requests.post(
            AZURE_ENDPOINT,
            params={'language': 'en-US', 'format': 'detailed'},
            headers=headers,
            data=audio,
            timeout=30
        )
        
        if resp.status_code != 200:
            return json_response({'error': 'Azure失败', 'details': resp.text}, resp.status_code)
        
        result = resp.json()
        assessment = result['NBest'][0]['PronunciationAssessment']
        
        return json_response({
            'status': 'success',
            'pronunciationScore': assessment['PronunciationScore'],
            'accuracyScore': assessment['AccuracyScore'],
            'fluencyScore': assessment['FluencyScore'],
            'completenessScore': assessment['CompletenessScore']
        })
    
    # ✅ 所有 except 对齐 try
    except requests.exceptions.Timeout:
        return json_response({'error': '超时'}, 504)
    
    except requests.exceptions.RequestException as e:
        logging.error(f"网络错误: {e}")
        return json_response({'error': '网络失败', 'details': str(e)}, 502
    
    except (KeyError, IndexError) as e:
        logging.error(f"解析失败: {e}")
        return json_response({'error': '解析错误', 'details': str(e)}, 500
    
    except Exception as e:
        logging.error(f"未知错误: {e}", exc_info=True)
        return json_response({'error': '内部错误', 'details': str(e)}, 500

# ==================== 启动 ====================
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
