from flask import Flask, request, jsonify, make_response
import requests
import os
import logging
import json

# ==================== 配置与初始化 ====================

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

AZURE_KEY = os.environ.get('AZURE_SPEECH_KEY')
AZURE_REGION = os.environ.get('AZURE_SPEECH_REGION', 'eastasia')
AZURE_ENDPOINT = f"https://{AZURE_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1"

if not AZURE_KEY:
    logging.error("⚠️  AZURE_SPEECH_KEY 未设置！语音测评功能不可用。")

# ==================== 辅助函数 ====================

def json_response(data, status_code=200):
    response = make_response(json.dumps(data, ensure_ascii=False))
    response.headers['Content-Type'] = 'application/json; charset=utf-8'
    return response, status_code

# ==================== 路由定义 ====================

@app.route('/')
def home():
    return json_response({
        'service': 'Anki Azure 语音测评后端',
        'status': 'running',
        'azure_configured': AZURE_KEY is not None,
        'region': AZURE_REGION,
        'endpoints': {
            'POST /evaluate': '语音测评',
            'GET /health': '健康检查',
            'GET /keepalive': '保活'
        }
    })

@app.route('/health', methods=['GET'])
def health():
    if not AZURE_KEY:
        return json_response({'status': 'error', 'message': 'Azure Key未配置'}, 503)
    return json_response({'status': 'ok'})

@app.route('/keepalive', methods=['GET'])
def keepalive():
    return json_response({'status': 'alive'})

@app.route('/evaluate', methods=['POST'])
def evaluate_pronunciation():
    if not AZURE_KEY:
        return json_response({'error': '服务未配置Azure Speech Key'}, 503)

    try:
        # 1. 验证请求
        if 'audio' not in request.files:
            return json_response({'error': '缺少音频文件'}, 400)
        if 'referenceText' not in request.form:
            return json_response({'error': '缺少参考文本'}, 400)
        
        audio_data = request.files['audio'].read()
        reference_text = request.form['referenceText'].strip()
        
        if not reference_text:
            return json_response({'error': '参考文本不能为空'}, 400)

        # 2. 调用Azure API
        headers = {
            'Ocp-Apim-Subscription-Key': AZURE_KEY,
            'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
            'Pronunciation-Assessment': json.dumps({
                "ReferenceText": reference_text,
                "GradingSystem": "HundredMark",
                "Granularity": "Phoneme"
            })
        }
        
        params = {'language': 'en-US', 'format': 'detailed'}
        
        azure_response = requests.post(
            AZURE_ENDPOINT,
            params=params,
            headers=headers,
            data=audio_data,
            timeout=30
        )
        
        if azure_response.status_code != 200:
            logging.error(f"Azure API错误: {azure_response.text}")
            return json_response({
                'error': 'Azure语音测评失败',
                'details': azure_response.text
            }, azure_response.status_code)
        
        result = azure_response.json()
        assessment = result['NBest'][0]['PronunciationAssessment']
        
        return json_response({
            'status': 'success',
            'pronunciationScore': assessment['PronunciationScore'],
            'accuracyScore': assessment['AccuracyScore'],
            'fluencyScore': assessment['FluencyScore'],
            'completenessScore': assessment['CompletenessScore']
        })
        
    except requests.exceptions.Timeout:
        return json_response({'error': '请求超时（Azure响应超过30秒）'}, 504)
    
    except requests.exceptions.RequestException as e:
        logging.error(f"网络请求失败: {e}")
        return json_response({'error': '无法连接到Azure服务', 'details': str(e)}, 502
    
    except (KeyError, IndexError) as e:
        logging.error(f"解析Azure响应失败: {e}")
        return json_response({'error': '响应格式错误', 'details': str(e)}, 500
    
    except Exception as e:
        logging.error(f"未知错误: {e}", exc_info=True)
        return json_response({'error': '服务器内部错误', 'details': str(e)}, 500

# ==================== 错误处理 ====================

@app.errorhandler(404)
def not_found(error):
    return json_response({'error': '接口不存在'}, 404)

@app.errorhandler(500)
def internal_error(error):
    return json_response({'error': '服务器内部错误'}, 500

# ==================== 启动 ====================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port, debug=False)
