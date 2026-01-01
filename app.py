from flask import Flask, request, jsonify
import requests
import os
import logging
from werkzeug.exceptions import BadRequest

app = Flask(__name__)

# 配置日志
logging.basicConfig(level=logging.INFO)

# 从环境变量读取Azure配置（Render会自动注入）
AZURE_KEY = os.environ.get('AZURE_SPEECH_KEY')
AZURE_REGION = os.environ.get('AZURE_SPEECH_REGION', 'eastasia')  # 默认东亚区域
AZURE_ENDPOINT = f"https://{AZURE_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1"

# 服务启动时验证配置
if not AZURE_KEY:
    logging.error("⚠️  关键环境变量 AZURE_SPEECH_KEY 未设置！语音测评功能将不可用。")
    logging.info("请前往 Render Dashboard → Settings → Environment Variables 添加")
    # 不终止应用，允许其他路由(如/health)正常工作

# ==================== 路由定义 ====================

@app.route('/')
def home():
    """首页 - 解决404问题，显示服务状态"""
    return jsonify({
        'service': 'Anki Azure 语音测评后端',
        'status': 'running',
        'azure_configured': AZURE_KEY is not None,
        'region': AZURE_REGION,
        'available_endpoints': {
            'POST /evaluate': '语音测评接口',
            'GET /health': '健康检查',
            'GET /keepalive': '防休眠接口'
        },
        'usage': '请在Anki卡片中调用 /evaluate 接口'
    }), 200


@app.route('/health', methods=['GET'])
def health():
    """健康检查 - 验证服务状态"""
    if not AZURE_KEY:
        return jsonify({
            'status': 'error',
            'message': 'Azure Speech Key未配置，语音测评功能不可用',
            'fix': '请在Render环境变量中设置 AZURE_SPEECH_KEY'
        }), 503
    
    return jsonify({
        'status': 'ok',
        'azure_region': AZURE_REGION,
        'message': '服务运行正常'
    }), 200


@app.route('/keepalive', methods=['GET'])
def keepalive():
    """UptimeRobot保活接口"""
    return jsonify({'status': 'alive', 'timestamp': request.args.get('timestamp')}), 200


@app.route('/evaluate', methods=['POST'])
def evaluate_pronunciation():
    """核心功能：语音测评"""
    
    # 验证Azure配置
    if not AZURE_KEY:
        return jsonify({'error': '服务未配置Azure Speech Key'}), 503

    try:
        # 1. 验证请求数据
        if 'audio' not in request.files:
            return jsonify({'error': '缺少音频文件'}), 400
        
        if 'referenceText' not in request.form:
            return jsonify({'error': '缺少参考文本(referenceText)'}), 400
        
        audio_data = request.files['audio'].read()
        reference_text = request.form['referenceText'].strip()
        
        if not reference_text:
            return jsonify({'error': '参考文本不能为空'}), 400

        # 2. 调用Azure语音测评API
        headers = {
            'Ocp-Apim-Subscription-Key': AZURE_KEY,
            'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
            'Pronunciation-Assessment': f'{{"ReferenceText":"{reference_text}","GradingSystem":"HundredMark","Granularity":"Phoneme"}}'
        }
        
        params = {
            'language': 'en-US',
            'format': 'detailed'
        }
        
        # 3. 发送请求到Azure
        azure_response = requests.post(
            AZURE_ENDPOINT,
            params=params,
            headers=headers,
            data=audio_data,
            timeout=30  # 设置超时
        )
        
        # 4. 处理Azure响应
        if azure_response.status_code != 200:
            logging.error(f"Azure API错误: {azure_response.text}")
            return jsonify({
                'error': 'Azure语音测评失败',
                'details': azure_response.text,
                'status_code': azure_response.status_code
            }), azure_response.status_code
        
        result = azure_response.json()
        
        # 5. 提取评分数据
        try:
            assessment = result['NBest'][0]['PronunciationAssessment']
            
            return jsonify({
                'status': 'success',
                'pronunciationScore': assessment['PronunciationScore'],
                'accuracyScore': assessment['AccuracyScore'],
                'fluencyScore': assessment['FluencyScore'],
                'completenessScore': assessment['CompletenessScore'],
                'feedback': '评分完成'
            }), 200
            
        except (KeyError, IndexError) as e:
            logging.error(f"解析Azure响应失败: {e}, 原始数据: {result}")
            return jsonify({
                'error': '无法解析Azure测评结果',
                'details': str(e)
            }), 500

    except requests.exceptions.Timeout:
        return jsonify({'error': '请求超时（Azure响应超过30秒）'}), 504
    
    except requests.exceptions.RequestException as e:
        logging.error(f"网络请求失败: {e}")
        return jsonify({'error': '无法连接到Azure服务', 'details': str(e)}), 502
    
    except Exception as e:
        logging.error(f"未知错误: {e}")
        return jsonify({'error': '服务器内部错误', 'details': str(e)}), 500


# ==================== 错误处理 ====================

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': '接口不存在', 'requested_path': request.path}), 404


@app.errorhandler(500)
def internal_error(error):
    logging.error(f"500错误: {error}")
    return jsonify({'error': '服务器内部错误'}), 500


if __name__ == '__main__':
    # 本地调试时使用，Render会自动忽略此行
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port, debug=False)
