from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
import requests
import os
import logging
import json
import base64

# ==================== 配置 ====================
app = Flask(__name__)
CORS(app)

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

    # 支持两种格式：FormData和Base64
    try:
        audio_data = None
        reference_text = None
        
        if request.is_json:
            # iPhone Base64格式
            data = request.get_json()
            audio_base64 = data.get('audio')
            reference_text = data.get('referenceText')
            if not audio_base64 or not reference_text:
                return json_response({'error': '缺少audio或referenceText字段'}, 400)
            audio_data = base64.b64decode(audio_base64)
        else:
            # FormData格式
            if 'audio' not in request.files:
                return json_response({'error': '缺少音频文件'}, 400)
            if 'referenceText' not in request.form:
                return json_response({'error': '缺少文本'}, 400)
            audio_data = request.files['audio'].read()
            reference_text = request.form['referenceText'].strip()
        
        if not reference_text:
            return json_response({'error': '参考文本不能为空'}, 400)

        # 调用Azure
        headers = {
            'Ocp-Apim-Subscription-Key': AZURE_KEY,
            'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
            'Pronunciation-Assessment': json.dumps({
                "ReferenceText": reference_text,
                "GradingSystem": "HundredMark",
                "Granularity": "Phoneme"
            })
        }
        
        resp = requests.post(
            AZURE_ENDPOINT,
            params={'language': 'en-US', 'format': 'detailed'},
            headers=headers,
            data=audio_data,
            timeout=30
        )
        
        if resp.status_code != 200:
            logging.error(f"Azure错误: {resp.text}")
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
    
    except requests.exceptions.Timeout:
        logging.warning("Azure请求超时")
        return json_response({'error': '请求超时（30秒）'}, 504)
    
    except requests.exceptions.RequestException as e:
        logging.error(f"网络失败: {e}")
        return json_response({'error': '网络失败', 'details': str(e)}, 502)
    
    except KeyError as e:
        logging.error(f"缺少字段: {e}")
        return json_response({'error': '响应格式错误', 'details': str(e)}, 500)
    
    except Exception as e:
        logging.error(f"未知错误: {e}", exc_info=True)
        return json_response({'error': '内部错误', 'details': str(e)}, 500)

# ==================== 启动 ====================
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
