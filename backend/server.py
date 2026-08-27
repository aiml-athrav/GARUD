import os
import sys
import asyncio
import subprocess
import difflib
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import edge_tts
import pyautogui
import json
import mss
import google.generativeai as genai
from PIL import Image

os.environ["GEMINI_API_KEY"] = "YOUR_GEMINI_API_KEY"
genai.configure(api_key=os.environ["GEMINI_API_KEY"])
# Adjust PyAutoGUI safety settings
pyautogui.FAILSAFE = True  # Move mouse to corner to abort execution

app = Flask(__name__)
CORS(app)

# Dictionary mapping simple speakable names to standard macOS app names
APP_MAP = {
    "chrome": "Google Chrome",
    "safari": "Safari",
    "spotify": "Spotify",
    "terminal": "Terminal",
    "finder": "Finder",
    "vscode": "Visual Studio Code",
    "slack": "Slack",
    "discord": "Discord",
    "notes": "Notes",
    "calculator": "Calculator",
    "settings": "System Settings",
    "whatsapp": "WhatsApp",
    "telegram": "Telegram"
}

# 1. Voice Synthesis (TTS) Endpoint
@app.route('/tts', methods=['POST'])
def tts():
    try:
        data = request.json or {}
        text = data.get('text', '').strip()
        if not text:
            return jsonify({'error': 'Text is required'}), 400

        voice = 'en-IN-PrabhatNeural'
        output_file = os.path.join(os.path.dirname(__file__), 'temp_tts.mp3')
        if os.path.exists(output_file):
            try:
                os.remove(output_file)
            except Exception:
                pass

        async def generate():
            communicate = edge_tts.Communicate(text, voice, rate="-5%", pitch="-20Hz")
            await communicate.save(output_file)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(generate())
        loop.close()

        return send_file(output_file, mimetype='audio/mp3')

    except Exception as e:
        print("TTS Error:", str(e))
        return jsonify({'error': str(e)}), 500

# 1.5 Vision Automation Endpoint (Gemini 1.5 Flash)
@app.route('/vision_command', methods=['OPTIONS', 'POST'])
def handle_vision_command():
    if request.method == 'OPTIONS':
        return '', 200
        
    data = request.json
    target = data.get('target', '')
    if not target:
        return jsonify({"status": "error", "message": "No query provided"}), 400
        
    try:
        # 1. Take a screenshot
        with mss.mss() as sct:
            monitor = sct.monitors[1]  # primary monitor
            sct_img = sct.grab(monitor)
            img = Image.frombytes("RGB", sct_img.size, sct_img.bgra, "raw", "BGRX")
            
        # 2. Convert query to Gemini prompt
        model = genai.GenerativeModel('gemini-1.5-flash')
        prompt = f"""You are an advanced UI automation agent. The user wants to: "{target}"
Look at the provided screenshot of the user's screen.
If the user's request requires clicking a specific UI element (like a button, icon, or text input), find its location.
Return your response STRICTLY as a JSON object with this format:
{{
  "action": "click" | "type" | "none",
  "coordinates": [ymin, xmin, ymax, xmax], 
  "text": "text to type if action is type, otherwise empty",
  "explanation": "brief explanation of what you are doing"
}}
Note: coordinates must be integers between 0 and 1000 representing normalized coordinates representing the bounding box. If no click is needed, return empty coordinates array []."""

        response = model.generate_content([prompt, img])
        response_text = response.text
        
        # Parse JSON from response
        import re
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if not json_match:
            return jsonify({"status": "error", "message": "Invalid Gemini response"}), 500
            
        cmd = json.loads(json_match.group())
        
        # 3. Execute PyAutoGUI actions
        action = cmd.get("action")
        if action == "click":
            coords = cmd.get("coordinates", [])
            if len(coords) == 4:
                ymin, xmin, ymax, xmax = coords
                # Convert 0-1000 normalized coordinates to actual screen pixels
                screen_w = monitor["width"]
                screen_h = monitor["height"]
                x_center = (xmin + xmax) / 2.0 / 1000.0 * screen_w
                y_center = (ymin + ymax) / 2.0 / 1000.0 * screen_h
                
                # Move to coordinate (divided by 2 for Retina displays if necessary, but pyautogui on Mac handles this weirdly)
                # On macOS Retina, pyautogui often needs coordinates divided by 2
                pyautogui.moveTo(x_center / 2, y_center / 2, duration=0.3)
                pyautogui.click()
                
        elif action == "type":
            pyautogui.write(cmd.get("text", ""), interval=0.01)
            
        return jsonify({"status": "success", "message": cmd.get("explanation", "Action completed")})
        
    except Exception as e:
        print(f"Vision Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# 2. System Command Automation Endpoint
@app.route('/command', methods=['POST'])
def command():
    try:
        data = request.json or {}
        action = data.get('action', '').strip().lower()
        target = data.get('target', '')

        print(f"Executing action: {action} with target: {target}")

        # Helper function to scan Mac for installed apps
        def get_installed_apps():
            app_dirs = ['/Applications', '/System/Applications', '/System/Applications/Utilities', os.path.expanduser('~/Applications')]
            apps = {}
            for d in app_dirs:
                if os.path.exists(d):
                    for f in os.listdir(d):
                        if f.endswith('.app'):
                            name = f[:-4]
                            apps[name.lower()] = name
            return apps

        # A. Open Applications with Dynamic Smart Resolver
        if action == "open":
            # Clean target name to remove fluff words
            clean_target = target.lower().replace("my ", "").replace("the ", "").replace(" app", "").replace(" application", "").strip()

            installed_apps = get_installed_apps()
            app_name = target # default

            # Resolve name using APP_MAP first
            if clean_target in APP_MAP:
                app_name = APP_MAP[clean_target]
            else:
                # Fuzzy matching & substring search
                target_lower = clean_target
                best_match = None
                
                # Check for substring match (e.g., "visual studio" in "visual studio code")
                for lower_name, real_name in installed_apps.items():
                    if target_lower in lower_name:
                        best_match = real_name
                        break
                
                if not best_match:
                    # Check for fuzzy match
                    matches = difflib.get_close_matches(target_lower, installed_apps.keys(), n=1, cutoff=0.6)
                    if matches:
                        best_match = installed_apps[matches[0]]
                
                if best_match:
                    app_name = best_match

            # WhatsApp Fallback logic with Unicode LRM check
            if clean_target == "whatsapp":
                res = subprocess.run(["open", "-a", "WhatsApp"])
                if res.returncode != 0:
                    res = subprocess.run(["open", "-a", "\u200eWhatsApp"]) # Hidden LRM character fallback
                if res.returncode != 0:
                    subprocess.run(["open", "https://web.whatsapp.com"])
                    return jsonify({"status": "success", "message": "Opening WhatsApp Web in your browser"})
                return jsonify({"status": "success", "message": "Opening WhatsApp Desktop app"})

            # Telegram Fallback logic
            elif clean_target == "telegram":
                res = subprocess.run(["open", "-a", "Telegram"])
                if res.returncode != 0:
                    subprocess.run(["open", "https://web.telegram.org"])
                    return jsonify({"status": "success", "message": "Opening Telegram Web in your browser"})
                return jsonify({"status": "success", "message": "Opening Telegram Desktop app"})

            # Standard macOS launch
            subprocess.run(["open", "-a", app_name])
            return jsonify({"status": "success", "message": f"Opening {app_name}"})

        # B. Close Applications
        elif action == "close":
            if not target:
                return jsonify({"status": "error", "message": "App target required to close"}), 400

            clean_target = target.lower().strip()
            app_name = target # default

            # Use smart resolver to find exact app name if possible
            installed_apps = get_installed_apps()
            if clean_target in installed_apps:
                app_name = installed_apps[clean_target]
            else:
                best_match = None
                for key, val in installed_apps.items():
                    if clean_target in key:
                        best_match = val
                        break
                if not best_match:
                    matches = difflib.get_close_matches(clean_target, installed_apps.keys(), n=1, cutoff=0.6)
                    if matches:
                        best_match = installed_apps[matches[0]]
                if best_match:
                    app_name = best_match

            # Gracefully quit app via AppleScript
            script = f'quit app "{app_name}"'
            subprocess.run(['osascript', '-e', script])
            return jsonify({"status": "success", "message": f"Closing {app_name}"})

        # C. Type Spoken Text
        elif action == "type":
            if not target:
                return jsonify({"status": "error", "message": "Text target required to type"}), 400
            
            # Type text using simulated keyboard inputs
            pyautogui.write(target, interval=0.01)
            return jsonify({"status": "success", "message": f"Typed text successfully"})

        # C. Press Keys / Hotkeys (e.g. "enter", "command space")
        elif action == "press":
            keys = [k.strip().lower() for k in target.split()]
            if len(keys) == 1:
                pyautogui.press(keys[0])
            else:
                pyautogui.hotkey(*keys)
            return jsonify({"status": "success", "message": f"Pressed hotkey: {keys}"})

        # D. Open Website in Active Browser (Focus address bar, type URL, hit enter)
        elif action == "website":
            url = target.strip()
            # Focus address bar (command + l is standard for Chrome/Safari)
            pyautogui.hotkey('command', 'l')
            pyautogui.sleep(0.15)
            # Ensure valid format
            if not url.startswith('http') and not url.startswith('www'):
                url = 'www.' + url
            pyautogui.write(url, interval=0.01)
            pyautogui.sleep(0.15)
            pyautogui.press('enter')
            return jsonify({"status": "success", "message": f"Navigating browser to {url}"})

        # E. Universal App Search (Focus search, type target, press enter)
        elif action == "search":
            pyautogui.hotkey('command', 'f')
            pyautogui.sleep(0.15)
            pyautogui.write(target, interval=0.01)
            pyautogui.sleep(0.15)
            pyautogui.press('enter')
            return jsonify({"status": "success", "message": f"Searching app for: {target}"})

        # F. WhatsApp Contact/Chat Switcher (Focus search index, type contact name, press enter)
        elif action == "whatsapp_search":
            res = subprocess.run(["open", "-a", "WhatsApp"])
            if res.returncode != 0:
                res = subprocess.run(["open", "-a", "\u200eWhatsApp"]) # LRM unicode fallback
            
            if res.returncode != 0:
                # If desktop app is missing, fall back to WhatsApp Web in browser
                subprocess.run(["open", "https://web.whatsapp.com"])
                pyautogui.sleep(1.2) # Wait for web page loading
                pyautogui.hotkey('command', 'alt', '/') # Focus search bar shortcut on WhatsApp Web
            else:
                pyautogui.sleep(0.8) # Wait for app to come to front
                pyautogui.hotkey('command', 'f') # Focus search bar shortcut on WhatsApp Desktop
            
            pyautogui.sleep(0.5)
            pyautogui.write(target, interval=0.01)
            pyautogui.sleep(2.0) # Wait for search results list to fully populate (WhatsApp can be slow)
            pyautogui.press('enter') # Press enter to open the first matched chat directly
            return jsonify({"status": "success", "message": f"Opening WhatsApp chat with {target}"})

        # G. Telegram Contact/Chat Switcher (Focus search, type contact name, press enter)
        elif action == "telegram_search":
            res = subprocess.run(["open", "-a", "Telegram"])
            
            if res.returncode != 0:
                # Fall back to Telegram Web in browser
                subprocess.run(["open", "https://web.telegram.org"])
                pyautogui.sleep(1.2)
            else:
                pyautogui.sleep(0.8)
                pyautogui.hotkey('command', 'f')
            
            pyautogui.sleep(0.3)
            pyautogui.write(target, interval=0.01)
            pyautogui.sleep(1.5) # Wait for list filters to populate
            pyautogui.press('enter') # Open the top chat result directly
            return jsonify({"status": "success", "message": f"Opening Telegram chat with {target}"})

        # G. Simulate Keyboard Shortcuts with App Focusing (e.g., "command t app:Google Chrome")
        elif action == "shortcut":
            parts = target.split("app:")
            keys_str = parts[0].strip()
            app_to_focus = parts[1].strip() if len(parts) > 1 else None

            if app_to_focus:
                # Resolve WhatsApp unicode fallback
                if app_to_focus.lower() == "whatsapp":
                    res = subprocess.run(["open", "-a", "WhatsApp"])
                    if res.returncode != 0:
                        subprocess.run(["open", "-a", "\u200eWhatsApp"])
                else:
                    subprocess.run(["open", "-a", app_to_focus])
                pyautogui.sleep(0.4) # Wait for window transition

            keys = [k.strip().lower() for k in keys_str.split()]
            
            # Self-protection tab closing check (don't close G.A.R.U.D.'s own tab!)
            if keys == ["command", "w"] and app_to_focus and app_to_focus.lower() == "google chrome":
                # Execute intelligent AppleScript that inspects active tab URL
                chrome_script = """
                tell application "Google Chrome"
                    if (count of windows) is 0 then return
                    set tabUrl to URL of active tab of active window
                    if tabUrl contains "localhost:3000" or tabUrl contains "127.0.0.1:3000" then
                        tell active window
                            set tabCount to count of tabs
                            if tabCount > 1 then
                                set currentIndex to active tab index
                                if currentIndex is tabCount then
                                    set active tab index to 1
                                else
                                    set active tab index to currentIndex + 1
                                end if
                                delay 0.15
                            end if
                        end tell
                    end if
                    close active tab of active window
                end tell
                """
                subprocess.run(["osascript", "-e", chrome_script])
            else:
                pyautogui.hotkey(*keys)
                
            return jsonify({"status": "success", "message": f"Executed shortcut: {keys}"})

        # I. Native Finder Folder Navigation (Directly opens directory in a Finder window with smart scanner)
        elif action == "finder_go":
            target_dir = target.strip()
            # If standard absolute/relative path shortcut, run directly
            if target_dir.startswith("~") or target_dir.startswith("/"):
                path = os.path.expanduser(target_dir)
                subprocess.run(["open", path])
                return jsonify({"status": "success", "message": f"Opening path {target_dir} in Finder"})
            
            # Scan standard locations for matching folder name (case-insensitive)
            search_bases = ["~/Desktop", "~/Documents", "~"]
            for base in search_bases:
                base_path = os.path.expanduser(base)
                if not os.path.exists(base_path):
                    continue
                # Try direct join
                direct_path = os.path.join(base_path, target_dir)
                if os.path.exists(direct_path) and os.path.isdir(direct_path):
                    subprocess.run(["open", direct_path])
                    return jsonify({"status": "success", "message": f"Opening folder {target_dir}"})
                
                # Scan subdirectories
                try:
                    for entry in os.scandir(base_path):
                        if entry.is_dir() and entry.name.lower() == target_dir.lower():
                            subprocess.run(["open", entry.path])
                            return jsonify({"status": "success", "message": f"Opening folder {entry.name}"})
                except Exception:
                    pass
            
            # Default fallback: open home directory
            subprocess.run(["open", os.path.expanduser("~")])
            return jsonify({"status": "success", "message": f"Folder {target_dir} not found. Opening home folder."})

        # M. Finder Search File Macro (Focus Finder, press cmd+f, type query, search)
        elif action == "finder_search":
            # Bring Finder to front
            subprocess.run(["open", "-a", "Finder"])
            pyautogui.sleep(0.4)
            # Focus search bar
            pyautogui.hotkey('command', 'f')
            pyautogui.sleep(0.2)
            # Type search term
            pyautogui.write(target, interval=0.01)
            pyautogui.sleep(0.2)
            pyautogui.press('enter')
            return jsonify({"status": "success", "message": f"Searching Finder for: {target}"})

        # J. macOS System Control via AppleScript & PyAutoGUI Media Keys (Volume, Media Playback, Wi-Fi, Brightness)
        elif action == "system":
            script = ""
            if target == "volume_up":
                script = "set volume output volume (output volume of (get volume settings) + 10)"
            elif target == "volume_down":
                script = "set volume output volume (output volume of (get volume settings) - 10)"
            elif target == "mute":
                script = "set volume with output muted"
            elif target == "unmute":
                script = "set volume without output muted"
            elif target == "play_pause":
                pyautogui.press('playpause')
                return jsonify({"status": "success", "message": "Triggered Media Play/Pause"})
            elif target == "next_track":
                pyautogui.press('nexttrack')
                return jsonify({"status": "success", "message": "Triggered Media Next Track"})
            elif target == "prev_track":
                pyautogui.press('prevtrack')
                return jsonify({"status": "success", "message": "Triggered Media Previous Track"})
            elif target == "wifi_on":
                # Toggle wireless cards en0 and en1 (common mac interfaces)
                subprocess.run(["networksetup", "-setairportpower", "en0", "on"])
                subprocess.run(["networksetup", "-setairportpower", "en1", "on"])
                return jsonify({"status": "success", "message": "Wi-Fi turned on"})
            elif target == "wifi_off":
                subprocess.run(["networksetup", "-setairportpower", "en0", "off"])
                subprocess.run(["networksetup", "-setairportpower", "en1", "off"])
                return jsonify({"status": "success", "message": "Wi-Fi turned off"})
            elif target == "brightness_up":
                # Simulates macOS hardware key for brightness up (key code 144) 3 times
                script = 'tell application "System Events" to repeat 3 times \n key code 144 \n end repeat'
            elif target == "brightness_down":
                # Simulates macOS hardware key for brightness down (key code 145) 3 times
                script = 'tell application "System Events" to repeat 3 times \n key code 145 \n end repeat'
            elif target == "lock":
                # Lock Mac shortcut (control + command + q)
                script = 'tell application "System Events" to keystroke "q" using {control down, command down}'
            elif target == "empty_trash":
                script = 'tell application "Finder" to empty trash'
            elif target == "sleep":
                script = 'tell application "Finder" to sleep'
            
            if script:
                subprocess.run(["osascript", "-e", script])
                return jsonify({"status": "success", "message": f"System action {target} completed"})
            
            return jsonify({"status": "error", "message": "Invalid system action"}), 400

        # L. Open macOS Specific Settings Preference Panels
        elif action == "settings_panel":
            panel_map = {
                "bluetooth": "com.apple.BluetoothSettings",
                "sound": "com.apple.preference.sound",
                "displays": "com.apple.Preference.Displays",
                "battery": "com.apple.preference.battery",
                "wifi": "com.apple.preference.network?Wi-Fi",
                "accessibility": "com.apple.preference.universalaccess",
                "general": "com.apple.GeneralSettings"
            }
            panel_id = panel_map.get(target.lower().strip(), "com.apple.GeneralSettings")
            subprocess.run(["open", f"x-apple.systempreferences:{panel_id}"])
            return jsonify({"status": "success", "message": f"Opening {target} panel inside System Settings"})

        # K. YouTube Search on Chrome
        elif action == "play_song_chrome":
            import urllib.parse
            query_encoded = urllib.parse.quote(target)
            url = f"https://www.youtube.com/results?search_query={query_encoded}"
            # Open directly in Google Chrome
            res = subprocess.run(["open", "-a", "Google Chrome", url])
            if res.returncode != 0:
                # Fallback to default browser if Chrome is missing
                subprocess.run(["open", url])
            return jsonify({"status": "success", "message": f"Searching for {target} on YouTube"})

        # L. Apple Music Catalog Search & Play Macro
        elif action == "play_song":
            # Open default macOS Music app (Apple Music)
            subprocess.run(["open", "-a", "Music"])
            pyautogui.sleep(1.8) # Wait for window transition and network loading
            # Focus search bar
            pyautogui.hotkey('command', 'f')
            pyautogui.sleep(0.2)
            # Type song query
            pyautogui.write(target, interval=0.01)
            pyautogui.sleep(0.4)
            pyautogui.press('enter')
            pyautogui.sleep(0.6) # Wait for search results
            # Select first search result card and play
            pyautogui.press('down')
            pyautogui.sleep(0.15)
            pyautogui.press('enter')
            return jsonify({"status": "success", "message": f"Searching and playing {target} on Apple Music"})

        return jsonify({"status": "error", "message": "Unknown action method"}), 400

    except Exception as e:
        print("Command Execution Error:", str(e))
        return jsonify({"status": "error", "message": str(e)}), 500

# 3. Web Search Automation Endpoint
@app.route('/web_search', methods=['POST'])
def web_search():
    try:
        from duckduckgo_search import DDGS
        data = request.json or {}
        query = data.get('query', '').strip()
        if not query:
            return jsonify({'error': 'Query is required'}), 400

        print(f"Executing web search for: {query}")
        results = DDGS().text(query, max_results=3)
        
        # Format the results into a readable context block
        context_block = "Search Results:\n"
        if results:
            for i, res in enumerate(results):
                context_block += f"{i+1}. {res.get('title', '')}: {res.get('body', '')}\n"
        else:
            context_block += "No recent information found."

        return jsonify({"status": "success", "results": context_block})

    except Exception as e:
        print("Web Search Error:", str(e))
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == '__main__':
    # Listen on all interfaces on port 5001 to avoid macOS AirPlay port 5000 conflict
    app.run(host='0.0.0.0', port=5001, debug=False)
