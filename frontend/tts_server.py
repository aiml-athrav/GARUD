import os
import asyncio
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import edge_tts

app = Flask(__name__)
CORS(app)

# Use Christopher (Deep Premium US Male) or Ryan (Deep Premium UK Male)
VOICE_MAP = {
    'en-US': 'en-US-ChristopherNeural' # Authoritative, deep system voice
}

@app.route('/tts', methods=['POST'])
def tts():
    try:
        data = request.json or {}
        text = data.get('text', '').strip()

        if not text:
            return jsonify({'error': 'Text is required'}), 400

        voice = 'en-US-ChristopherNeural'
        output_file = os.path.join(os.path.dirname(__file__), 'temp_tts.mp3')
        if os.path.exists(output_file):
            try:
                os.remove(output_file)
            except Exception:
                pass

        # Apply rich pitch (-16Hz) and rate (-8%) on server side to deepen it further
        async def generate():
            communicate = edge_tts.Communicate(text, voice, rate="-8%", pitch="-16Hz")
            await communicate.save(output_file)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(generate())
        loop.close()

        return send_file(output_file, mimetype='audio/mp3')

    except Exception as e:
        print("TTS Error:", str(e))
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
