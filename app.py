from flask import Flask, request, jsonify, make_response
import requests
import os
import logging
import json

# ==================== 配置与初始化 ====================

app = Flask(__name__)

# 配置日志格式，方便在Render控制台查看
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# 从环境变量读取Azure配置（Render会自动注入这些变量）
AZURE_KEY = os.environ.get('AZURE_SPEECH_KEY')
AZURE_REGION = os.environ.get('AZURE_SPEECH_REGION', 'eastasia')  # 默认使用东亚区域
AZURE_ENDPOINT = f"https://{AZURE_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1"

# 服务启动时检查配置
if not AZURE_KEY:
    logging.error("⚠️  关键环境变量 AZURE_SPEECH_KEY 未设置！语音测评功能将不可用。")
    logging.info("请前往 Render Dashboard → Settings → Environment Variables 添加")
    # 注意：这里不终止应用，允许其他路由(如/health)正常工作

# ==================== 辅助函数 ====================

def json_response(data, status_code=200):
    """
    统一返回支持中文显示的JSON响应
    解决Unicode转义问题（如\u5065\u5eb7）
    """
    response = make_response(json.dumps(data, ensure_ascii=False))
    response.headers['Content-Type'] = 'application/json; charset=utf-8'
    return response, status_code

# ==================== 路由定义 ====================

@app.route('/')
def home():
    """首页 - 显示服务状态和使用说明"""
    return json_response({
        'service': 'Anki Azure 语音测评后端',
        'status': 'running',
        'azure_configured': AZURE_KEY is not None,  # 显示Azure是否配置成功
        'region': AZURE_REGION,
        'available_endpoints': {
            'POST /evaluate': '语音测评接口',
            'GET /health': '健康检查',
            'GET /keepalive': '防休眠接口'
        },
        'usage': '请在Anki卡片中调用 /evaluate 接口',
        '文档': '确保音频格式为WAV, 采样率16000Hz'
    })


@app.route('/health', methods=['GET'])
def health():
    """健康检查 - 验证服务状态"""
    if not AZURE_KEY:
        return json_response({
            'status': 'error',
            'message': 'Azure Speech Key未配置，语音测评功能不可用',
            'fix': '请在Render环境变量中设置 AZURE_SPEECH_KEY'
        }, 503)
    
    return json_response({
        'status': 'ok',
        'azure_region': AZURE_REGION,
        'message': '服务运行正常'
    })


@app.route('/keepalive', methods=['GET'])
def keepalive():
    """UptimeRobot保活接口 - 防止Render休眠"""
    return json_response({
        'status': 'alive',
        'timestamp': request.args.get('timestamp'),
        'message': '保活成功'
    })


@app.route('/evaluate', methods=['POST'])
def evaluate_pronunciation():
    """
    核心功能：语音测评接口
    接收WAV格式音频和参考文本，返回Azure发音评分
    """
    
    # 验证Azure配置
    if not AZURE_KEY:
        return json_response({'error': '服务未配置Azure Speech Key'}, 503)

    try:
        # 1. 验证请求数据完整性
        if 'audio' not in request.files:
            return json_response({'error': '缺少音频文件(audio字段)'}, 400)
        
        if 'referenceText' not in request.form:
            return json_response({'error': '缺少参考文本(referenceText字段)'}, 400)
        
        audio_data = request.files['audio'].read()
        reference_text = request.form['referenceText'].strip()
        
        if not reference_text:
            return json_response({'error': '参考文本不能为空'}, 400)

        if len(audio_data) == 0:
            return json_response({'error': '音频文件为空'}, 400)

        # 2. 准备Azure API请求头
        headers = {
            'Ocp-Apim-Subscription-Key': AZURE_KEY,
            'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
            # 发音评估参数
            'Pronunciation-Assessment': json.dumps({
                "ReferenceText": reference_text,
                "GradingSystem": "HundredMark",
                "Granularity": "Phoneme"
            })
        }
        
        # 3. 调用Azure语音测评API
        params = {
            'language': 'en-US',
            'format': 'detailed'
        }
        
        azure_response = requests.post(
            AZURE_ENDPOINT,
            params=params,
            headers=headers,
            data=audio_data,
            timeout=30  # 设置30秒超时
        )
        
        # 4. 处理Azure响应
        if azure_response.status_code != 200:
            logging.error(f"Azure API错误: {azure_response.text}")
            return json_response({
                'error': 'Azure语音测评失败',
                'details': azure_response.text,
                'status_code': azure_response.status_code
            }, azure_response.status_code)
        
        result = azure_response.json()
        
        # 5. 提取评分结果
        try:
            assessment = result['NBest'][0]['PronunciationAssessment']
            
            return json_response({
                'status': 'success',
                'pronunciationScore': assessment['PronunciationScore'],
                'accuracyScore': assessment['AccuracyScore'],
                'fluencyScore': assessment['FluencyScore'],
                'completenessScore': assessment['CompletenessScore'],
                'feedback': '评分完成'
            })
            
        except (KeyError, IndexError) as e:
            logging.error(f"解析Azure响应失败: {e}, 原始数据: {result}")
            return json_response({
                'error': '无法解析Azure测评结果',
                'details': f'字段错误: {str(e)}',
                'raw_response': result
            }, 500

    # 6. 错误处理
    except requests.exceptions.Timeout:
        return json_response({'error': '请求超时（Azure响应超过30秒）'}, 504)
    
    except requests.exceptions.RequestException as e:
        logging.error(f"网络请求失败: {e}")
        return json_response({'error': '无法连接到Azure服务', 'details': str(e)}, 502
    
    except (KeyError, IndexError) as e:
        logging.error(f"数据解析失败: {e}")
        return json_response({'error': '响应格式错误', 'details': str(e)}, 500
    
    except Exception as e:
        logging.error(f"未知错误: {e}", exc_info=True)
        return json_response({'error': '服务器内部错误', 'details': str(e)}, 500


# ==================== 错误处理 ====================

@app.errorhandler(404)
def not_found(error):
    """404错误处理"""
    return json_response({
        'error': '接口不存在',
        'requested_path': request.path,
        'available_endpoints': ['GET /', 'GET /health', 'GET /keepalive', 'POST /evaluate']
    }, 404)


@app.errorhandler(500)
def internal_error(error):
    """500错误处理"""
    logging.error(f"500错误: {error}", exc_info=True)
    return json_response({'error': '服务器内部错误'}, 500)


@app.errorhandler(BadRequest)
def bad_request(error):
    """400错误处理"""
    return json_response({'error': '请求格式错误', 'details': str(error)}, 400)


# ==================== 启动应用 ====================

if __name__ == '__main__':
    # 本地调试时使用，Render会自动忽略此行
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port, debug=False)
