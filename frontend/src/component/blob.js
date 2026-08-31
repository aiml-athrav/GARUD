import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// ---------------------------------------------------------------------------
// MicReactiveCore
//
// Port of the original earth/core Three.js scene into a single React
// component. The theme-switcher UI has been removed (locked to the
// "Magma & Cyan" palette). Instead, the whole scene now behaves like an
// AI-assistant "blob": it listens to the microphone and grows / brightens /
// pulses faster as input volume rises, and relaxes back to its resting size
// in silence.
//
// Requires: npm install three
// (three/addons/* ship inside the "three" package itself, no extra install)
// ---------------------------------------------------------------------------

const snoise3GLSL = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 = v - i + dot(i, C.xxx) ;
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute( permute( permute( i.z + vec4(0.0, i1.z, i2.z, 1.0 )) + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
    float n_ = 0.142857142857;
    vec3  ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
  }
`;

function createEagleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Clear to transparent black
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 512, 512);

  // Styling for glowing HUD neon lines
  ctx.strokeStyle = '#ff9f1c';
  ctx.lineWidth = 7;
  ctx.shadowColor = '#ff9f1c';
  ctx.shadowBlur = 24;
  ctx.fillStyle = 'rgba(255, 159, 28, 0.15)';

  const cx = 256;
  const cy = 256;

  // Draw Eagle Silhouette
  ctx.beginPath();
  
  // Head
  ctx.moveTo(cx, cy - 120);
  ctx.lineTo(cx + 25, cy - 90);
  ctx.lineTo(cx + 15, cy - 75);
  
  // Right Wing Upper
  ctx.lineTo(cx + 85, cy - 90);
  ctx.lineTo(cx + 165, cy - 50);
  ctx.lineTo(cx + 195, cy + 5);
  ctx.lineTo(cx + 125, cy + 5);
  
  // Right Wing Lower
  ctx.lineTo(cx + 145, cy + 40);
  ctx.lineTo(cx + 95, cy + 25);
  ctx.lineTo(cx + 105, cy + 65);
  ctx.lineTo(cx + 65, cy + 45);
  
  // Tail / Body right
  ctx.lineTo(cx + 30, cy + 105);
  ctx.lineTo(cx, cy + 85);
  
  // Tail / Body left
  ctx.lineTo(cx - 30, cy + 105);
  ctx.lineTo(cx - 65, cy + 45);
  
  // Left Wing Lower
  ctx.lineTo(cx - 105, cy + 65);
  ctx.lineTo(cx - 95, cy + 25);
  ctx.lineTo(cx - 145, cy + 40);
  ctx.lineTo(cx - 125, cy + 5);
  
  // Left Wing Upper
  ctx.lineTo(cx - 195, cy + 5);
  ctx.lineTo(cx - 165, cy - 50);
  ctx.lineTo(cx - 85, cy - 90);
  ctx.lineTo(cx - 15, cy - 75);
  ctx.lineTo(cx - 25, cy - 90);
  
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Internal geometric diamond core lines
  ctx.beginPath();
  ctx.moveTo(cx, cy - 55);
  ctx.lineTo(cx + 45, cy);
  ctx.lineTo(cx, cy + 55);
  ctx.lineTo(cx - 45, cy);
  ctx.closePath();
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}

export default function MicReactiveCore() {
  const mountRef = useRef(null);
  const micLevelRef = useRef(0); // smoothed 0..1, read inside the render loop
  const [micState, setMicState] = useState('standby'); // standby (listening for wake word) | idle | requesting | active | denied
  const micStateRef = useRef('standby');
  const [transcript, setTranscript] = useState(['[SYS]: READY', 'user@garud:~$ ▋']);
  const [lang, setLang] = useState('en-US'); // Hardcoded standard English
  const [coreColor, setCoreColor] = useState('#ff5500'); // Default core color (magma orange)
  const [veinColor, setVeinColor] = useState('#00e1ff'); // Default vein color (cyan)
  const [isSpeakingState, setIsSpeakingState] = useState(false);
  const recognitionRef = useRef(null);
  const transcriptContainerRef = useRef(null);
  const uniformsRef = useRef(null);
  const dustMatRef = useRef(null);
  const logoMatRef = useRef(null);

  const currentQueryRef = useRef('');
  const llmTimeoutRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const chatHistoryRef = useRef([]);
  const activeAppRef = useRef(null);

  // Browser-local fallback in case local Python TTS server is offline
  const fallbackLocalSpeak = (text, langCode) => {
    if (!window.speechSynthesis) {
      isSpeakingRef.current = false;
      setIsSpeakingState(false);
      return;
    }
    const cleanText = text.replace(/garud@sys:~\$/g, '').replace(/\[SYS\]:/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';

    const voices = window.speechSynthesis.getVoices();
    const selectedVoice = voices.find(v => v.name.includes('Daniel') && v.lang.startsWith('en')) 
                       || voices.find(v => v.name.includes('Rishi') && v.lang.startsWith('en'));
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    utterance.volume = 1.0;
    utterance.rate = 0.90;
    utterance.pitch = 0.78;

    const resumeListening = () => {
      isSpeakingRef.current = false;
      setIsSpeakingState(false);
      if (micState === 'active') startSpeechRecognition();
    };
    utterance.onend = resumeListening;
    utterance.onerror = resumeListening;

    window.speechSynthesis.speak(utterance);
  };

  // Read aloud text using local server + Web Audio API (deep filter & cybernetic room echo)
  const speakText = async (text, langCode) => {
    // 1. Mute Speech Recognition immediately to prevent hearing itself
    isSpeakingRef.current = true;
    setIsSpeakingState(true);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch (e) {}
    }

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    try {
      const response = await fetch('http://127.0.0.1:5001/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: text.replace(/garud@sys:~\$/g, '').replace(/G\.A\.R\.U\.D\./gi, 'Garud').replace(/[*#_`|\-~]/g, ' ').trim(),
          lang: 'en-US'
        })
      });

      if (!response.ok) throw new Error('Local TTS Server offline');

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // Initialize Web Audio API Context
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audio = new Audio(audioUrl);
      
      const source = audioContext.createMediaElementSource(audio);

      // A. GODLY BASS (Bhari / Deep but Clear)
      const bassFilter = audioContext.createBiquadFilter();
      bassFilter.type = 'lowshelf';
      bassFilter.frequency.value = 250;
      bassFilter.gain.value = 14;

      // B. VERY SHORT RESONANCE (Adds a metallic edge without killing clarity)
      const delayNode = audioContext.createDelay();
      delayNode.delayTime.value = 0.02; // 20ms

      const feedbackNode = audioContext.createGain();
      feedbackNode.gain.value = 0.15; // very low sustain

      // Connect Delay Feedback Loop
      delayNode.connect(feedbackNode);
      feedbackNode.connect(delayNode);

      // C. DYNAMICS COMPRESSOR (Makes the voice punchy and perfectly clear)
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -28;
      compressor.knee.value = 30;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

      // Pipeline connections
      source.connect(bassFilter);
      
      // Dry Signal directly to Compressor
      bassFilter.connect(compressor);

      // Wet Signal (Resonance) to Compressor
      bassFilter.connect(delayNode);
      delayNode.connect(compressor);

      // Master out
      compressor.connect(audioContext.destination);

      // E. TTS Audio Reactivity (Visualizer)
      const ttsAnalyser = audioContext.createAnalyser();
      ttsAnalyser.fftSize = 256;
      ttsAnalyser.smoothingTimeConstant = 0.8;
      compressor.connect(ttsAnalyser);

      const data = new Uint8Array(ttsAnalyser.frequencyBinCount);
      let animFrame;

      const sampleTTS = () => {
        if (!isSpeakingRef.current) return;
        ttsAnalyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255;
        const targetLevel = Math.min(avg * 4.5, 1.0); // Slightly less sensitive than mic for smoother visual
        
        if (targetLevel > micLevelRef.current) {
          micLevelRef.current += (targetLevel - micLevelRef.current) * 0.45;
        } else {
          micLevelRef.current += (targetLevel - micLevelRef.current) * 0.12;
        }
        
        animFrame = requestAnimationFrame(sampleTTS);
      };
      sampleTTS();

      const resumeListening = () => {
        if (animFrame) cancelAnimationFrame(animFrame);
        micLevelRef.current = 0; // Reset visualizer
        audioContext.close();
        isSpeakingRef.current = false;
        setIsSpeakingState(false);
        if (micStateRef.current === 'active' || micStateRef.current === 'standby') {
          startSpeechRecognition();
        }
      };

      audio.onended = resumeListening;
      audio.onerror = resumeListening;

      await audio.play();

    } catch (err) {
      console.warn("Local echo TTS failed, falling back to clean browser TTS:", err.message);
      fallbackLocalSpeak(text, langCode);
    }
  };

  // Auto-scroll transcript container
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcript]);

  // Send completed voice transcript to Groq LLM with real-time SSE token streaming
  const sendToLLM = async (query) => {
    // 1. Output system connection log to terminal
    setTranscript((prev) => {
      const logs = [...prev];
      if (logs.length >= 200) logs.shift();
      return [...logs, `[SYS]: CONNECTING LLM...`];
    });

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.REACT_APP_GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b', // Highly stable conversational model
          messages: [
            {
              role: 'system',
              content: `You are Garud, an advanced system intelligence console AI. Your sole creator and owner is Atharv Khandelwal (19-year-old, B.Tech 2nd year student). Your name is inspired by the mighty bird Garud Bhagwan from the Ramayana. Only state your name or creator if explicitly asked. Otherwise, answer the user normally. The user is currently using the application: ${activeAppRef.current || 'None'}. Keep this context in mind if they refer to 'it', 'this app', or ask to do something within it. You can control the system and answer complex real-life questions. Think deeply like a human and provide logical, well-explained, and helpful answers to any questions. IMPORTANT: Keep your answers concise, between 2 to 4 sentences maximum. Do NOT use tables, bullet points, or markdown formatting (like *, -, #, |). Speak in plain, conversational sentences that sound natural when spoken aloud. If the user speaks in Hindi, you MUST write the response in Romanized Hinglish using Latin script (e.g., "Main theek hoon. Aap bataiye."). Do NOT use Devanagari script. If English, respond in English.`
            },
            ...chatHistoryRef.current,
            {
              role: 'user',
              content: query
            }
          ],
          max_tokens: 150,
          stream: true
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'API Request Failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let responseText = '';

      // Initialize the LLM print line in console state
      setTranscript((prev) => {
        const logs = [...prev];
        if (logs.length >= 200) logs.shift();
        return [...logs, `garud@sys:~$ ▋`];
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const parsed = JSON.parse(dataStr);
              const content = parsed.choices[0].delta.content || '';
              if (content) {
                responseText += content;
                setTranscript((prev) => {
                  const logs = [...prev];
                  logs[logs.length - 1] = `garud@sys:~$ ${responseText}▋`;
                  if (logs.length > 200) {
                    return logs.slice(logs.length - 200);
                  }
                  return logs;
                });
              }
            } catch (err) {}
          }
        }
      }

      // Update chat history with current query and response
      chatHistoryRef.current = [
        ...chatHistoryRef.current,
        { role: 'user', content: query },
        { role: 'assistant', content: responseText }
      ];
      // Keep only the last 6 messages (3 turns) to not overload context
      if (chatHistoryRef.current.length > 6) {
        chatHistoryRef.current = chatHistoryRef.current.slice(chatHistoryRef.current.length - 6);
      }

      // Finish streaming, remove cursor, and print fresh user prompt ready for next voice query
      setTranscript((prev) => {
        const logs = [...prev];
        logs[logs.length - 1] = `garud@sys:~$ ${responseText}`;
        logs.push(`user@garud:~$ ▋`);
        if (logs.length > 200) {
          return logs.slice(logs.length - 200);
        }
        return logs;
      });

      // Speak the completed LLM response aloud in the active language
      speakText(responseText, lang);

    } catch (err) {
      console.error("Groq connection error:", err);
      setTranscript((prev) => {
        const logs = [...prev];
        if (logs.length >= 200) logs.shift();
        return [...logs, `[SYS_ERR]: ${err.message || 'API TIMEOUT'}`, `user@garud:~$ ▋`];
      });
    }
  };

  // Hook that dynamically compiles hex colors and updates Three.js material states
  useEffect(() => {
    if (uniformsRef.current) {
      const cCore = new THREE.Color(coreColor);
      const cVein = new THREE.Color(veinColor);

      // Generate a dynamic gradient based on core color
      const cDarkVal = cCore.clone().multiplyScalar(0.1);
      const cRedVal = cCore.clone();
      const cOrangeVal = cCore.clone().addScalar(0.2);
      const cYellowVal = cCore.clone().addScalar(0.5);

      // Core uniforms
      uniformsRef.current.cDark.value.copy(cDarkVal);
      uniformsRef.current.cRed.value.copy(cRedVal);
      uniformsRef.current.cOrange.value.copy(cOrangeVal);
      uniformsRef.current.cYellow.value.copy(cYellowVal);

      // Vein surface/core colors
      uniformsRef.current.cSurface.value.copy(cVein);
      uniformsRef.current.cCoreA.value.copy(cCore.clone().lerp(cVein, 0.35));
      uniformsRef.current.cCoreB.value.copy(cCore.clone().lerp(cVein, 0.7));

      // Boundary, volcano, dust
      uniformsRef.current.boundaryColor.value.copy(cVein.clone().multiplyScalar(1.5));
      uniformsRef.current.volcanoColor.value.copy(cCore.clone().multiplyScalar(1.2));
      
      if (dustMatRef.current) {
        dustMatRef.current.color.copy(cVein.clone().multiplyScalar(0.5));
      }
      if (logoMatRef.current) {
        logoMatRef.current.color.copy(cCore.clone().addScalar(0.35));
      }
    }
  }, [coreColor, veinColor]);

  // Execute an OS automation command via our dedicated backend server
  const sendOSCommand = async (action, target) => {
    try {
      setTranscript((prev) => {
        const logs = [...prev];
        if (logs.length >= 200) logs.shift();
        return [...logs, `[SYS]: EXECUTE COMMAND -> ${action.toUpperCase()} [${target}]`];
      });

      const url = action === 'vision_automation' 
        ? 'http://127.0.0.1:5001/vision_command' 
        : 'http://127.0.0.1:5001/command';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action, target })
      });

      if (!response.ok) throw new Error('OS Command failed');
      const data = await response.json();

      // Track active application
      if (action === 'open' && target) {
        activeAppRef.current = target;
      }

      speakText(data.message || `Command ${action} executed`, 'en-US');

    } catch (err) {
      console.error("OS Command Error:", err);
      setTranscript((prev) => {
        const logs = [...prev];
        if (logs.length >= 200) logs.shift();
        return [...logs, `[SYS_ERR]: Command failed - ${err.message}`];
      });
      speakText("Command execution failed", 'en-US');
    }
  };

  // AI-Powered Voice Intent Parsing
  const handleVoiceIntent = async (queryText) => {
    const cleanQuery = queryText.toLowerCase().trim();

    // 1. Wake word hardcoded bypass
    if (cleanQuery === "radhe radhe" || cleanQuery.includes("radhe radhe")) {
      speakText("Radhe Radhe, main Garud aapka swagat karta hu.");
      return;
    }

    try {
      setTranscript((prev) => {
        const logs = [...prev];
        if (logs.length >= 200) logs.shift();
        return [...logs, `[SYS]: PARSING INTENT...`];
      });

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.REACT_APP_GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b',
          messages: [
            {
              role: 'system',
              content: `You are Garud's Intent Parser. Extract OS system commands from the user's natural language input (Hindi, Hinglish, or English). 
The currently active application on screen is: ${activeAppRef.current || 'None'}. If the user gives a command like "close it", "search for x on it", or implies an action without naming the app, assume they mean the active application: ${activeAppRef.current}.
Return ONLY a valid JSON array of command objects. No other text. If there are no system commands (e.g., just a conversational question), return an empty array [].
Available actions:
- open (target: app name)
- close (target: app name)
- type (target: text to type)
- press (target: key like 'enter', 'command w')
- whatsapp_search (target: contact name)
- telegram_search (target: contact name)
- website (target: url or domain)
- search (target: query)
- play_song (target: song name)
- play_song_chrome (target: song name)
- system (target: volume_up, volume_down, mute, play_pause, next_track, prev_track, wifi_on, wifi_off, brightness_up, brightness_down, lock, sleep)
- finder_go (target: folder like downloads, desktop)
- vision_automation (target: the exact user query. Use this if the user asks to click a specific visual button, icon, or if they give a command like "add 52" or "click 5" that implies interacting with the current screen).
- web_search (target: search query. Use this if the user asks for real-time information, news, current events, or anything requiring internet access).

Examples:
- "whatsapp m papa ki chat khol k hi type kr aur bhej de": [{"action": "whatsapp_search", "target": "papa"}, {"action": "type", "target": "hi"}, {"action": "press", "target": "enter"}]
- "chrome open karo aur type karo github": [{"action": "open", "target": "Google Chrome"}, {"action": "type", "target": "github"}]
- "add 52": [{"action": "type", "target": "+52"}]
- "aaj ki news batao": [{"action": "web_search", "target": "today's top news India"}]
- "screen par plus button dabao": [{"action": "vision_automation", "target": "click plus button"}]
- "brightness kam karo": [{"action": "system", "target": "brightness_down"}]
- "aawaz badhao": [{"action": "system", "target": "volume_up"}]
- "wifi band kar de": [{"action": "system", "target": "wifi_off"}]
- "what is artificial intelligence?": []`
            },
            {
              role: 'user',
              content: queryText
            }
          ],
          temperature: 0.1,
          max_tokens: 200
        })
      });

      if (!response.ok) {
        throw new Error("Intent Parser offline");
      }

      const data = await response.json();
      const rawOutput = data.choices[0].message.content.trim();
      
      let commands = [];
      try {
        // Find JSON array in the output
        const jsonMatch = rawOutput.match(/\[.*\]/s);
        if (jsonMatch) {
          commands = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        console.error("Failed to parse intent JSON:", rawOutput);
      }

      if (commands && commands.length > 0) {
        // Execute the parsed system commands sequentially
        for (const cmd of commands) {
          if (cmd.action && cmd.target !== undefined) {
             if (cmd.action === 'web_search') {
                try {
                  const wsResponse = await fetch('http://127.0.0.1:5001/web_search', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ query: cmd.target })
                  });
                  if (wsResponse.ok) {
                     const wsData = await wsResponse.json();
                     if (wsData.status === 'success') {
                         chatHistoryRef.current.push({ role: 'system', content: wsData.results });
                     }
                  }
                } catch(e) {
                   console.error("Web search failed", e);
                }
                sendToLLM(queryText);
                return; // Stop further commands and let LLM answer
             } else {
                 await sendOSCommand(cmd.action, cmd.target);
                 // Small delay between commands to allow OS to catch up
                 await new Promise(r => setTimeout(r, 600));
             }
          }
        }
      } else {
        // No OS commands found, fall back to conversational LLM
        sendToLLM(queryText);
      }

    } catch (err) {
      console.error("Intent parsing error:", err);
      // Fallback to conversational AI if intent parsing fails
      sendToLLM(queryText);
    }
  };

  const startSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setTranscript(["[SYS_ERR]: Speech recognition not supported in this browser."]);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang; // Dynamically set active language (hi-IN, mr-IN, en-IN)

    recognition.onresult = (event) => {
      const newLines = [];
      let currentInterim = '';
      let hasNewFinal = false;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript.trim();
        if (!text) continue;
        
        if (event.results[i].isFinal) {
           newLines.push(text);
           hasNewFinal = true;
        } else {
           currentInterim = text;
        }
      }

      // Hide all interim text if we are in standby, so the user doesn't think it's listening to regular commands
      if (micStateRef.current === 'standby') {
         currentInterim = '';
      }

      // Update the accumulated voice query buffer on final transcription segments
      if (hasNewFinal) {
        const finalString = newLines.join(' ');
        
        // Wake Word Detection
        if (micStateRef.current === 'standby' && finalString.toLowerCase().includes("radhe radhe")) {
           setMicState('active');
           micStateRef.current = 'active';
           handleVoiceIntent("radhe radhe");
           return;
        } else if (micStateRef.current === 'standby') {
           return; // Ignore other speech in standby without updating buffer
        }
        
        currentQueryRef.current = (currentQueryRef.current + ' ' + finalString).trim();
      }

      // Update the live terminal view, dynamically refreshing the active query line
      setTranscript((prev) => {
        const logs = [...prev];
        const historyLogs = logs.filter(line => !line.startsWith('user@garud:~$'));
        
        const promptText = currentInterim 
          ? `user@garud:~$ ${(currentQueryRef.current + ' ' + currentInterim).trim()}▋` 
          : `user@garud:~$ ${currentQueryRef.current.trim()}▋`;
          
        const result = [...historyLogs, promptText];
        if (result.length > 6) {
          return result.slice(result.length - 6);
        }
        return result;
      });

      // VAD Debounce silence detection (650ms of silence triggers voice intent parser for near-zero delay)
      if (hasNewFinal && currentQueryRef.current.trim()) {
        if (llmTimeoutRef.current) clearTimeout(llmTimeoutRef.current);
        llmTimeoutRef.current = setTimeout(() => {
          if (currentQueryRef.current.trim()) {
            handleVoiceIntent(currentQueryRef.current.trim());
            currentQueryRef.current = '';
          }
        }, 650);
      }
    };

    recognition.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn("Speech recognition error:", e.error);
      }
    };

    recognition.onend = () => {
      // Re-create and restart a fresh recognition session only if this is the active instance and not speaking
      if ((micStateRef.current === 'active' || micStateRef.current === 'standby') && recognitionRef.current === recognition && !isSpeakingRef.current) {
        setTimeout(() => {
          if ((micStateRef.current === 'active' || micStateRef.current === 'standby') && recognitionRef.current === recognition && !isSpeakingRef.current) {
            startSpeechRecognition();
          }
        }, 100);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      console.error("Speech recognition start failed:", err);
    }
  };

  useEffect(() => {
    // Log setup transitions in terminal format
    const langLabel = lang === 'hi-IN' ? 'HI_IN' : lang === 'mr-IN' ? 'MR_IN' : 'EN_IN';
    currentQueryRef.current = '';
    if (llmTimeoutRef.current) clearTimeout(llmTimeoutRef.current);

    setTranscript([
      `[SYS]: ENGINE RESTART`,
      `[SYS]: LANG_SET -> ${langLabel}`,
      `user@garud:~$ ▋`
    ]);

    if (micState === 'active' || micState === 'standby') {
      startSpeechRecognition();
    }
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (llmTimeoutRef.current) clearTimeout(llmTimeoutRef.current);
      if (recognitionRef.current) {
        const tempRef = recognitionRef.current;
        tempRef.onend = null; // Clean up handler to prevent restart loops
        tempRef.onerror = null;
        try {
          tempRef.stop();
        } catch (e) {}
        recognitionRef.current = null;
      }
    };
  }, [micState, lang]); // Restart when microphone state OR language changes

  // --- microphone setup -----------------------------------------------
  const startMic = async () => {
    setMicState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);

      const sample = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        const avg = sum / data.length / 255; // 0..1 raw volume
        
        // Amplify sensitivity (6.5x multiplier for much higher mic reaction)
        const targetLevel = Math.min(avg * 6.5, 1.0);
        
        // Snappy rise (attack), smooth slow fall (decay)
        if (targetLevel > micLevelRef.current) {
          micLevelRef.current += (targetLevel - micLevelRef.current) * 0.45; // quick reaction
        } else {
          micLevelRef.current += (targetLevel - micLevelRef.current) * 0.12; // smooth decay
        }
        
        requestAnimationFrame(sample);
      };
      sample();
      setMicState('standby'); // Default to standby (waiting for wake word)
      micStateRef.current = 'standby';
    } catch (err) {
      console.error('Microphone access failed:', err);
      setMicState('denied');
      micStateRef.current = 'denied';
    }
  };

  const toggleMic = () => {
    if (micState === 'active' || micState === 'standby') {
      setMicState('idle');
      micStateRef.current = 'idle';
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    } else {
      startMic();
    }
  };


  // --- three.js scene ----------------------------------------------------
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.012);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 30);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const textureLoader = new THREE.TextureLoader();
    const earthTex = textureLoader.load(
      'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg'
    );

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      2.0,
      0.5,
      0.85
    );
    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;
    controls.maxDistance = 50;
    controls.minDistance = 12;
    controls.target.set(0, -1.5, 0);

    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    const CORE_RADIUS = 2.2;
    const OUTER_RADIUS = 10.0;
    const NUM_VEINS = 1200;
    const POINTS_PER_VEIN = 45;

    const initialCore = new THREE.Color(coreColor);
    const initialVein = new THREE.Color(veinColor);

    const uniforms = {
      time: { value: 0 },
      micLevel: { value: 0 },
      cDark: { value: initialCore.clone().multiplyScalar(0.1) },
      cRed: { value: initialCore.clone() },
      cOrange: { value: initialCore.clone().addScalar(0.2) },
      cYellow: { value: initialCore.clone().addScalar(0.5) },
      cSurface: { value: initialVein.clone() },
      cCoreA: { value: initialCore.clone().lerp(initialVein, 0.35) },
      cCoreB: { value: initialCore.clone().lerp(initialVein, 0.7) },
      boundaryColor: { value: initialVein.clone().multiplyScalar(1.5) },
      volcanoColor: { value: initialCore.clone().multiplyScalar(1.2) },
      tEarth: { value: earthTex },
    };
    uniformsRef.current = uniforms;

    // dust
    const dustGeo = new THREE.BufferGeometry();
    const dustPositions = [];
    for (let i = 0; i < 2000; i++) {
      dustPositions.push(
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.5) * 100,
        (Math.random() - 0.5) * 100
      );
    }
    dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3));
    const dustMat = new THREE.PointsMaterial({
      color: initialVein.clone().multiplyScalar(0.5),
      size: 0.1,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    });
    dustMatRef.current = dustMat;
    const dustMesh = new THREE.Points(dustGeo, dustMat);
    scene.add(dustMesh);

    // core sphere (displacement now also driven by mic level)
    const coreGeo = new THREE.SphereGeometry(CORE_RADIUS, 128, 128);
    const coreMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        uniform float time;
        uniform float micLevel;
        varying vec3 vPosition;
        varying vec3 vNormal;
        ${snoise3GLSL}
        void main() {
          vPosition = position;
          vNormal = normal;
          float speed = 0.4 + micLevel * 2.2;
          float frequency = 1.8 + micLevel * 1.5;
          float displacement = snoise(position * frequency + time * speed) * (0.15 + micLevel * 0.65);
          vec3 newPosition = position + normal * displacement;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float micLevel;
        uniform vec3 cDark;
        uniform vec3 cRed;
        uniform vec3 cOrange;
        uniform vec3 cYellow;
        varying vec3 vPosition;
        varying vec3 vNormal;
        ${snoise3GLSL}
        void main() {
          float scrollSpeed = 0.5 + micLevel * 2.0;
          float n1 = snoise(vPosition * 1.5 - time * scrollSpeed);
          float n2 = snoise(vPosition * 4.0 + time * (scrollSpeed * 0.6));
          float noiseVal = n1 * 0.6 + n2 * 0.4;

          vec3 color;
          if (noiseVal < -0.1) {
            color = mix(cDark, cRed, smoothstep(-0.5, -0.1, noiseVal));
          } else if (noiseVal < 0.3) {
            color = mix(cRed, cOrange, smoothstep(-0.1, 0.3, noiseVal));
          } else {
            color = mix(cOrange, cYellow, smoothstep(0.3, 0.8, noiseVal));
          }

          float fresnel = dot(vNormal, vec3(0.0, 0.0, 1.0));
          fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
          color += cOrange * pow(fresnel, 2.0) * 0.8;

          color *= 1.5 + micLevel * 1.2;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    mainGroup.add(coreMesh);

    // Glowing Eagle HUD logo sprite floating in the center of the core
    const eagleTexture = createEagleTexture();
    const logoMat = new THREE.SpriteMaterial({
      map: eagleTexture,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.75,
      color: initialCore.clone().addScalar(0.35)
    });
    logoMatRef.current = logoMat;
    const logoSprite = new THREE.Sprite(logoMat);
    logoSprite.scale.set(3.4, 3.4, 1);
    mainGroup.add(logoSprite);

    function getPointOnSphere(radius) {
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      return new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi)
      );
    }

    const volcanoPoints = [];
    for (let i = 0; i < 150; i++) volcanoPoints.push(getPointOnSphere(OUTER_RADIUS));

    const veinPositions = [];
    const veinProgress = [];
    const veinOffsets = [];
    const veinRands = [];

    for (let i = 0; i < NUM_VEINS; i++) {
      const start = getPointOnSphere(OUTER_RADIUS);
      const end = start.clone().normalize().multiplyScalar(CORE_RADIUS * 0.85);

      const mid = new THREE.Vector3().lerpVectors(start, end, 0.5);
      mid.normalize().multiplyScalar(OUTER_RADIUS * 0.55);

      const tangent = new THREE.Vector3().crossVectors(start, new THREE.Vector3(0, 1, 0)).normalize();
      const bitangent = new THREE.Vector3().crossVectors(start, tangent).normalize();

      mid.add(tangent.multiplyScalar((Math.random() - 0.5) * 6));
      mid.add(bitangent.multiplyScalar((Math.random() - 0.5) * 6));

      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const points = curve.getPoints(POINTS_PER_VEIN);
      const offset = Math.random();
      const randSeed = Math.random();

      for (let j = 0; j < POINTS_PER_VEIN; j++) {
        veinPositions.push(points[j].x, points[j].y, points[j].z);
        veinPositions.push(points[j + 1].x, points[j + 1].y, points[j + 1].z);
        veinProgress.push(j / POINTS_PER_VEIN, (j + 1) / POINTS_PER_VEIN);
        veinOffsets.push(offset, offset);
        veinRands.push(randSeed, randSeed);
      }
    }

    const veinGeo = new THREE.BufferGeometry();
    veinGeo.setAttribute('position', new THREE.Float32BufferAttribute(veinPositions, 3));
    veinGeo.setAttribute('progress', new THREE.Float32BufferAttribute(veinProgress, 1));
    veinGeo.setAttribute('offset', new THREE.Float32BufferAttribute(veinOffsets, 1));
    veinGeo.setAttribute('randomSeed', new THREE.Float32BufferAttribute(veinRands, 1));

    const veinMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        attribute float progress;
        attribute float offset;
        attribute float randomSeed;
        varying float vProgress;
        varying float vOffset;
        varying float vRandom;
        void main() {
          vProgress = progress;
          vOffset = offset;
          vRandom = randomSeed;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float micLevel;
        uniform vec3 cSurface;
        uniform vec3 cCoreA;
        uniform vec3 cCoreB;
        varying float vProgress;
        varying float vOffset;
        varying float vRandom;
        void main() {
          vec3 targetCoreColor = mix(cCoreA, cCoreB, vRandom);
          vec3 color = mix(cSurface, targetCoreColor, pow(vProgress, 1.5));

          float speed = 0.3 + micLevel * 0.9;
          float phase = vProgress - time * speed + vOffset * 10.0;
          float flow = fract(phase);
          float pulse = exp(-flow * 10.0);

          vec3 pulseGlow = color * pulse * (10.0 + micLevel * 8.0);
          color += pulseGlow;

          float alphaBase = 0.02;
          float alphaPulse = pulse * 0.9;
          float alpha = alphaBase + alphaPulse;

          alpha *= smoothstep(0.0, 0.05, vProgress) * smoothstep(1.0, 0.8, vProgress);

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const veinMesh = new THREE.LineSegments(veinGeo, veinMat);
    mainGroup.add(veinMesh);

    const earthGlobeGeo = new THREE.SphereGeometry(OUTER_RADIUS * 0.995, 128, 128);
    const earthGlobeMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tEarth;
        uniform vec3 boundaryColor;
        uniform float micLevel;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vec2 texel = vec2(1.5 / 2048.0, 1.5 / 1024.0);
          float c = texture2D(tEarth, vUv).r;
          float r = texture2D(tEarth, vUv + vec2(texel.x, 0.0)).r;
          float u = texture2D(tEarth, vUv + vec2(0.0, texel.y)).r;
          float l = texture2D(tEarth, vUv + vec2(-texel.x, 0.0)).r;
          float d = texture2D(tEarth, vUv + vec2(0.0, -texel.y)).r;
          float edge = abs(4.0 * c - r - u - l - d);
          float outline = smoothstep(0.1, 0.8, edge);
          vec3 color = boundaryColor * outline;
          color *= 2.5 + micLevel * 1.5;
          float fresnel = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
          color += boundaryColor * fresnel * 0.5;
          float alpha = outline * 0.8 + fresnel * 0.2;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const earthGlobeMesh = new THREE.Mesh(earthGlobeGeo, earthGlobeMat);
    mainGroup.add(earthGlobeMesh);

    const volcanoGeo = new THREE.BufferGeometry().setFromPoints(volcanoPoints);
    const volcanoMat = new THREE.ShaderMaterial({
      uniforms: {
        color: uniforms.volcanoColor,
        size: { value: 7.0 * window.devicePixelRatio },
        time: uniforms.time,
        micLevel: uniforms.micLevel,
      },
      vertexShader: `
        uniform float size;
        uniform float micLevel;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (1.0 + micLevel) * (20.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float time;
        void main() {
          vec2 pt = gl_PointCoord - vec2(0.5);
          if(abs(pt.x) > 0.35 || abs(pt.y) > 0.35) discard;
          float throb = sin(time * 3.0 + gl_FragCoord.x) * 0.5 + 0.5;
          gl_FragColor = vec4(color * (1.5 + throb), 0.9);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const volcanoMesh = new THREE.Points(volcanoGeo, volcanoMat);
    mainGroup.add(volcanoMesh);

    const clock = new THREE.Clock();
    let displayScale = 1;
    let displayBloom = bloomPass.strength;
    let animId;

    function animate() {
      animId = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();
      const mic = micLevelRef.current; // 0..1

      uniforms.time.value = elapsedTime;
      uniforms.micLevel.value = mic;

      // blob-like scale reaction: scaled down to fit the background center box
      const targetScale = 0.52 + mic * 0.35;
      displayScale += (targetScale - displayScale) * 0.15;
      mainGroup.scale.setScalar(displayScale);

      const targetBloom = 2.0 + mic * 2.5;
      displayBloom += (targetBloom - displayBloom) * 0.15;
      bloomPass.strength = displayBloom;

      // Animate eagle logo scale and opacity in sync with voice levels
      if (logoSprite && logoMat) {
        const targetLogoScale = 3.2 * (1.0 + mic * 0.45);
        logoSprite.scale.setScalar(targetLogoScale);
        logoMat.opacity = 0.65 + mic * 0.35;
      }
      bloomPass.strength = displayBloom;

      // Dynamic rotation reactions
      dustMesh.rotation.y += (0.02 + mic * 0.12) * delta;
      controls.autoRotateSpeed = 0.8 + mic * 4.5;
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      composer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);
    renderer.setClearColor(0x000000, 0);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      renderer.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      veinGeo.dispose();
      veinMat.dispose();
      earthGlobeGeo.dispose();
      earthGlobeMat.dispose();
      volcanoGeo.dispose();
      volcanoMat.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      earthTex.dispose();
      eagleTexture.dispose();
      logoMat.dispose();
      if (container && renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="hud-root">
      {/* 1. Futuristic Header */}
      <header className="hud-header">
        {/* Text removed as requested */}
      </header>

      {/* 2. Main HUD Body Workspace */}
      <div className="hud-workspace">
        
        {/* Left Sidebar (Color Config) */}
        <aside className="hud-sidebar-left">
          <div className="cyber-box" style={{ height: '100%', display: 'flex', flexDirection: 'column', paddingTop: '70px', paddingLeft: '40px', paddingRight: '30px' }}>
            <div
              style={{
                fontSize: '10px',
                opacity: 0.75,
                fontWeight: 'bold',
                letterSpacing: '1px',
                marginBottom: '16px',
                borderBottom: '1px solid rgba(255, 159, 28, 0.2)',
                paddingBottom: '6px',
                color: '#ff9f1c'
              }}
            >
              COLOR CONFIGURATION
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', color: '#ff9f1c' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>CORE ENERGY:</span>
                <input
                  type="color"
                  value={coreColor}
                  onChange={(e) => setCoreColor(e.target.value)}
                  style={{
                    border: 'none',
                    width: '20px',
                    height: '20px',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: 0
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>VEIN STREAMS:</span>
                <input
                  type="color"
                  value={veinColor}
                  onChange={(e) => setVeinColor(e.target.value)}
                  style={{
                    border: 'none',
                    width: '20px',
                    height: '20px',
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: 0
                  }}
                />
              </div>
            </div>
          </div>
        </aside>

        {/* Center Interactive Core Canvas */}
        <main className="hud-center-core">
          {/* Mount Three.js canvas container absolutely to fill this core panel */}
          <div ref={mountRef} style={{ position: 'absolute', inset: 0, zIndex: 1 }} />
          
          {/* Centered Microphone Action Overlay */}
          <div
            style={{
              position: 'absolute',
              bottom: 95,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 10,
            }}
          >
            <button
              onClick={toggleMic}
              disabled={micState === 'requesting'}
              style={{
                padding: '12px 22px',
                borderRadius: 28,
                border: '1px solid rgba(255,255,255,0.15)',
                background: (micState === 'active' || micState === 'standby') ? 'rgba(255,50,50,0.6)' : 'rgba(10,12,18,0.6)',
                backdropFilter: 'blur(12px)',
                color: '#fff',
                fontFamily: 'sans-serif',
                fontSize: 14,
                cursor: micState === 'requesting' ? 'default' : 'pointer',
              }}
            >
              {micState === 'requesting' ? 'INITIALIZING...' : (micState === 'active' ? 'DEACTIVATE MIC (ACTIVE)' : (micState === 'standby' ? 'DEACTIVATE MIC (STANDBY)' : 'ENABLE WAKE WORD (RADHE RADHE)'))}
            </button>
          </div>
        </main>

        {/* Right Sidebar (System Status + Buttons + Console Terminal) */}
        <aside className="hud-sidebar-right">
          
          {/* A. SYSTEM STATUS Box */}
          <div className="cyber-box cyber-box-cyan" style={{ height: '48%', display: 'flex', flexDirection: 'column', paddingTop: '62px', paddingLeft: '15px', paddingRight: '45px' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 'bold',
                letterSpacing: '2px',
                marginBottom: '14px',
                borderBottom: '1px solid rgba(0, 255, 204, 0.25)',
                paddingBottom: '5px',
                textAlign: 'center',
                textTransform: 'uppercase',
                color: '#00ffcc'
              }}
            >
              SYSTEM STATUS
            </div>
            <style>{`
              @keyframes led-glow-green {
                0%, 100% { background-color: #00ffcc; box-shadow: 0 0 6px #00ffcc, 0 0 10px #00ffcc; }
                50% { background-color: #004433; box-shadow: 0 0 1px #004433; }
              }
              @keyframes led-glow-red {
                0%, 100% { background-color: #ff3366; box-shadow: 0 0 6px #ff3366, 0 0 10px #ff3366; }
                50% { background-color: #550011; box-shadow: 0 0 1px #550011; }
              }
              @keyframes led-glow-gray {
                0%, 100% { background-color: #333333; box-shadow: none; }
              }
            `}</style>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', color: '#00ffcc', fontSize: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>SYSTEM ONLINE</span>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', animation: 'led-glow-green 2.5s infinite ease-in-out' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>J.A.R.U.D. ACTIVE</span>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', animation: 'led-glow-green 2.5s infinite ease-in-out' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>MICROPHONE</span>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', animation: micState === 'active' ? 'led-glow-green 0.8s infinite ease-in-out' : 'led-glow-gray 1s infinite' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>MIC PERMISSION</span>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', animation: micState === 'denied' ? 'led-glow-red 2.5s infinite ease-in-out' : 'led-glow-green 2.5s infinite ease-in-out' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>TTS SPEAKING</span>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', animation: isSpeakingState ? 'led-glow-green 0.6s infinite ease-in-out' : 'led-glow-gray 1s infinite' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>API CONNECTION</span>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', animation: 'led-glow-green 2.5s infinite ease-in-out' }} />
              </div>
            </div>
          </div>

          {/* B & C. STATUS STATS & TERMINAL CONSOLE LOGS */}
          <div className="cyber-box" style={{ height: '40%', display: 'flex', flexDirection: 'column', paddingTop: '75px', paddingLeft: '0px', paddingRight: '40px', paddingBottom: '60px', gap: '6px' }}>
            
            {/* Status Stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '10px', color: '#ff9f1c', borderBottom: '1px solid rgba(255, 159, 28, 0.25)', paddingBottom: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.8 }}>
                <span>HUD MODE:</span> <span>STABLE</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.8 }}>
                <span>LOCALE:</span> <span>EN-IN</span>
              </div>
            </div>

            {/* Terminal Console Logs */}
            <div 
              ref={transcriptContainerRef}
              style={{ 
                flexGrow: 1, 
                overflowY: 'auto', 
                lineHeight: '1.45', 
                wordBreak: 'break-word', 
                color: '#ff9f1c',
                fontSize: '11px',
                fontFamily: 'monospace',
                paddingRight: '4px'
              }}
            >
              <style>{`
                @keyframes cursor-blink {
                  50% { opacity: 0; }
                }
                ::-webkit-scrollbar {
                  width: 5px;
                }
                ::-webkit-scrollbar-track {
                  background: rgba(0, 0, 0, 0.2);
                  border-radius: 4px;
                }
                ::-webkit-scrollbar-thumb {
                  background: rgba(255, 159, 28, 0.6);
                  border-radius: 4px;
                }
                ::-webkit-scrollbar-thumb:hover {
                  background: rgba(255, 159, 28, 0.9);
                }
              `}</style>
              {transcript.map((line, idx) => {
                const hasCursor = line.endsWith('▋');
                const cleanLine = hasCursor ? line.slice(0, -1) : line;
                return (
                  <div key={idx} style={{ minHeight: '1.45em', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>{cleanLine}</span>
                    {hasCursor && (
                      <span
                        style={{
                          display: 'inline-block',
                          width: '7px',
                          height: '11px',
                          background: '#ff9f1c',
                          marginLeft: '3px',
                          animation: 'cursor-blink 1s step-start infinite',
                          boxShadow: '0 0 4px #ff9f1c'
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </aside>

      </div>
    </div>
  );
}
