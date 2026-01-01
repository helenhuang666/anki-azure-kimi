from flask import Flask, request, jsonify, make_response
from flask_cors import CORS  # 核心修复：支持Anki卡片跨域请求
import requests
import os
import logging
import json
import base64  # 核心修复：支持iPhone Base64编码

# ==================== 配置与初始化 ====================
app = Flask(__name__)
CORS(app)  # 允许所有来源（包括Anki的file://协议）

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

AZURE_KEY = os.environ.get('AZURE_SPEECH_KEY')
AZURE_REGION = os.environ.get('AZURE_SPEECH_REGION', 'eastasia')
AZURE_ENDPOINT = f"https://{AZURE_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1"

if not AZURE_KEY:
    logging.error("⚠️  关键环境变量 AZURE_SPEECH_KEY 未设置！语音测评功能将不可用。")

# ==================== 工具函数 ====================
def json_response(data, status_code=200):
    """返回中文JSON（解决Unicode转义问题）"""
    response = make_response(json.dumps(data, ensure_ascii=False))
    response.headers['Content-Type'] = 'application/json; charset=utf-8'
    return response, status_code

# ==================== 路由定义 ====================
@app.route('/')
def home():
    """服务状态页"""
    return json_response({
        'service': 'Anki Azure 语音测评后端',
        'status': 'running',
        'azure_configured': AZURE_KEY is not None,
        'region': AZURE_REGION,
        'endpoints': {
            'POST /evaluate': '语音测评（支持Base64和FormData）',
            'GET /health': '健康检查',
            'GET /keepalive': '防休眠接口'
        }
    })

@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    if not AZURE_KEY:
        return json_response({'status': 'error', 'message': 'Azure Key未配置'}, 503)
    return json_response({'status': 'ok', 'region': AZURE_REGION})

@app.route('/keepalive', methods=['GET'])
def keepalive():
    """UptimeRobot保活"""
    return json_response({'status': 'alive', 'timestamp': request.args.get('timestamp')})

@app.route('/evaluate', methods=['POST'])
def evaluate():
    """核心功能：语音测评（支持FormData和Base64两种格式）"""
    if not AZURE_KEY:
        return json_response({'error': '服务未配置Azure Speech Key'}, 503)

    try:
        # ✅ 支持两种请求格式：FormData（桌面/Android）和Base64（iPhone）
        audio_data = None
        reference_text = None
        
        # 1. 判断请求类型
        if request.is_json:
            # iPhone Base64格式
            data = request.get_json()
            audio_base64 = data.get('audio')
            reference_text = data.get('referenceText')
            
            if not audio_base64 or not reference_text:
                return json_response({'error': '缺少audio或referenceText字段'}, 400)
            
            audio_data = base64.b64decode(audio_base64)
            
        else:
            # 桌面/Android FormData格式
            if 'audio' not in request.files:
                return json_response({'error': '缺少音频文件'}, 400)
            if 'referenceText' not in request.form:
                return json_response({'error': '缺少参考文本'}, 400)
            
            audio_data = request.files['audio'].read()
            reference_text = request.form['referenceText'].strip()
        
        if not reference_text:
            return json_response({'error': '参考文本不能为空'}, 400)

        # 2. 调用Azure语音测评
        headers = {
            'Ocp-Apim-Subscription-Key': AZURE_KEY,
            'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
            'Pronunciation-Assessment': json.dumps({
                "ReferenceText": reference_text,
                "GradingSystem": "HundredMark",
                "Granularity": "Phoneme"
            })
        }
        
        azure_resp = requests.post(
            AZURE_ENDPOINT,
            params={'language': 'en-US', 'format': 'detailed'},
            headers=headers,
            data=audio_data,
            timeout=30
        )
        
        if azure_resp.status_code != 200:
            logging.error(f"Azure API错误: {azure_resp.text}")
            return json_response({
                'error': 'Azure测评失败',
                'details': azure_resp.text[:200]  # 只返回前200字符避免日志爆炸
            }, azure_resp.status_code)
        
        result = azure_resp.json()
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
        logging.error(f"网络请求失败: {e}")
        return json_response({'error': '无法连接到Azure服务', 'details': str(e)}, 502)
    
    except KeyError as e:
        logging.error(f"Azure响应缺少字段: {e}, 原始响应: {azure_resp.text[:200]}")
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
    return json_response({'error': '服务器内部错误'}, 500)

# ==================== 启动 ====================
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port, debug=False)
