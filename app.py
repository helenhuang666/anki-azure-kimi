from flask import Flask, request, jsonify
import requests
import os
import logging

app = Flask(__name__)

# 从环境变量读取Azure配置（绝对不要在代码中写密钥！）
AZURE_KEY = os.environ.get('AZURE_SPEECH_KEY')
AZURE_REGION = os.environ.get('AZURE_SPEECH_REGION', 'eastasia')
AZURE_ENDPOINT = f"https://{AZURE_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1"

# 验证配置
if not AZURE_KEY:
    logging.error("⚠️  环境变量 AZURE_SPEECH_KEY 未设置！")
    raise ValueError("请在Render环境变量中设置 AZURE_SPEECH_KEY")

@app.route('/evaluate', methods=['POST'])
def evaluate_pronunciation():
    try:
        # 获取音频和参考文本
        audio_data = request.files['audio'].read()
        reference_text = request.form.get('referenceText', '')
        
        if not reference_text:
            return jsonify({'error': '缺少参考文本'}), 400

        # 调用Azure语音测评
        headers = {
            'Ocp-Apim-Subscription-Key': AZURE_KEY,
            'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000'
        }
        
        params = {
            'language': 'en-US',
            'format': 'detailed'
        }
        
        # 发音评估需要特殊header
        headers['Pronunciation-Assessment'] = f'{{"ReferenceText":"{reference_text}","GradingSystem":"HundredMark","Granularity":"Phoneme"}}'
        
        response = requests.post(
            AZURE_ENDPOINT,
            params=params,
            headers=headers,
            data=audio_data
        )
        
        if response.status_code != 200:
            return jsonify({'error': f'Azure API错误: {response.text}'}), response.status_code
            
        result = response.json()
        
        # 提取评分结果
        assessment = result['NBest'][0]['PronunciationAssessment']
        
        return jsonify({
            'pronunciationScore': assessment['PronunciationScore'],
            'accuracyScore': assessment['AccuracyScore'],
            'fluencyScore': assessment['FluencyScore'],
            'completenessScore': assessment['CompletenessScore'],
            'status': 'success'
        })
        
    except Exception as e:
        logging.error(f"测评失败: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/keepalive', methods=['GET'])
def keepalive():
    """用于UptimeRobot防止休眠"""
    return jsonify({'status': 'alive'}), 200

@app.route('/health', methods=['GET'])
def health():
    """健康检查"""
    if not AZURE_KEY:
        return jsonify({'status': 'error', 'message': 'Azure Key未配置'}), 500
    return jsonify({'status': 'ok'}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)