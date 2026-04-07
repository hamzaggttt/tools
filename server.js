require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
// Using native FormData (Node 18+) for better compatibility with fetch
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const { AssemblyAI } = require('assemblyai');
const ffmpegPath = process.env.NODE_ENV === 'production' ? 'ffmpeg' : require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);
console.log(`Using FFmpeg path: ${ffmpegPath}`);

const aaiClient = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY
});

const app = express();
app.use(morgan('combined'));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
if (!fs.existsSync('output')) fs.mkdirSync('output');
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
app.use('/output', express.static(path.join(__dirname, 'output')));

const upload = multer({ dest: 'uploads/' });

const jobs = {};

// Health Check for Railway
app.get('/health', (req, res) => res.status(200).send('OK'));

app.post('/api/process', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video provided' });
  
  const jobId = uuidv4();
  const config = {
    enhanceAudio: req.body.enhanceAudio === 'true',
    targetFormat: req.body.targetFormat || 'original', 
    cropX: req.body.cropX ? parseFloat(req.body.cropX) : null,
    cropY: req.body.cropY ? parseFloat(req.body.cropY) : null,
    cropW: req.body.cropW ? parseFloat(req.body.cropW) : null,
    cropH: req.body.cropH ? parseFloat(req.body.cropH) : null
  };
  
  const ext = path.extname(req.file.originalname) || '.mp4';
  const outputPath = path.join('output', `${jobId}.mp4`); // Always output standard MP4
  
  jobs[jobId] = { status: 'processing', progress: 0, file: `/output/${jobId}.mp4` };
  
  let command = ffmpeg(req.file.path);
  
  // Audio Enhancement Pipeline
  if (config.enhanceAudio) {
    command.audioFilters([
      { filter: 'afftdn', options: 'nf=-25' }, // Noise reduction
      { filter: 'highpass', options: 'f=200' }, // Cut low rumble
      { filter: 'lowpass', options: 'f=3000' }, // Cut extreme highs
      { filter: 'loudnorm', options: 'I=-16:TP=-1.5:LRA=11' } // Normalization for social/web
    ]);
  }

  // Social Media Formatting (Cropping)
  if (config.targetFormat !== 'original' && config.cropW && config.cropH) {
    // If face tracking coordinates were provided from frontend
    command.videoFilters(`crop=${Math.floor(config.cropW)}:${Math.floor(config.cropH)}:${Math.floor(config.cropX)}:${Math.floor(config.cropY)}`);
  }

  // Optimize for fast web delivery
  command.outputOptions([
    '-c:v libx264',
    '-preset fast', // fast processing
    '-crf 23',      // good quality
    '-c:a aac',
    '-movflags +faststart'
  ]);

  command.on('progress', (progress) => {
    jobs[jobId].progress = Math.min(Math.floor(progress.percent || 0), 99);
  });

  command.on('end', () => {
    jobs[jobId].status = 'completed';
    jobs[jobId].progress = 100;
    fs.unlink(req.file.path, () => {}); // Cleanup upload
  });

  command.on('error', (err) => {
    console.error('FFmpeg error:', err);
    jobs[jobId].status = 'error';
    jobs[jobId].error = err.message;
  });

  command.save(outputPath);
  res.json({ jobId });
});

app.get('/api/status/:id', (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(job);
});

// API KEYS (LOADED FROM .ENV)
const AUPHONIC_KEY = process.env.AUPHONIC_KEY;
const REMOVE_BG_API_KEY = process.env.REMOVE_BG_API_KEY || process.env['bg remover'];
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

// Log key status on startup
function logKey(name, val) {
  if (!val) {
    console.log(`${name}: MISSING ❌`);
  } else {
    // Show first/last to verify sync without leaking full key
    const preview = `${val.substring(0, 3)}...${val.substring(val.length - 3)}`;
    console.log(`${name}: Present ✅ (Stats: Starts/Ends: ${preview}, Length: ${val.length})`);
  }
}
console.log('\n--- Environment Check ---');
logKey('AUPHONIC_KEY', AUPHONIC_KEY);
logKey('REMOVE_BG_API_KEY', REMOVE_BG_API_KEY);
logKey('GROQ_API_KEY', GROQ_API_KEY);
logKey('ASSEMBLYAI_API_KEY', ASSEMBLYAI_API_KEY);
console.log('-------------------------\n');

// PROXY: REMOVE.BG
app.post('/api/remove-bg', upload.single('image_file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    const fileBuffer = fs.readFileSync(req.file.path);
    const blob = new Blob([fileBuffer], { type: req.file.mimetype || 'image/png' });

    const form = new FormData();
    form.append('image_file', blob, req.file.originalname);
    form.append('size', 'auto');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 
        'X-Api-Key': REMOVE_BG_API_KEY
      },
      body: form
    });

    if (!response.ok) {
      const errorTxt = await response.text().catch(() => 'No error text');
      console.error(`❌ RemoveBG API error: status=${response.status} body=${errorTxt}`);
      
      let errMsg = 'API Error';
      try {
        const errObj = JSON.parse(errorTxt);
        errMsg = errObj?.errors?.[0]?.title || errorTxt || errMsg;
      } catch(e) {
        errMsg = errorTxt || errMsg;
      }
      throw new Error(errMsg);
    }

    const resultBlob = await response.blob();
    const arrayBuffer = await resultBlob.arrayBuffer();
    
    fs.unlink(req.file.path, () => {}); // Cleanup
    
    res.set('Content-Type', 'image/png');
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('RemoveBG Proxy Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PROXY: GROQ AI
app.post('/api/groq', async (req, res) => {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${GROQ_API_KEY}` 
      },
      body: JSON.stringify(req.body)
    });
    
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Groq Proxy Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// AI AUTO-CAPTION GENERATOR: TRANSCRIPTION
app.post('/api/transcribe', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video provided' });
  
  const jobId = uuidv4();
  const inputPath = req.file.path;
  const audioPath = path.join('uploads', `${jobId}.mp3`);
  
  jobs[jobId] = { status: 'processing', progress: 10, step: 'Extracting audio...' };
  res.json({ jobId }); // Respond early

  try {
    // 1. Extract Audio
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat('mp3')
        .audioChannels(1)
        .audioFrequency(16000)
        .on('progress', (p) => { jobs[jobId].progress = 10 + Math.floor((p.percent || 0) * 0.1); })
        .on('end', resolve)
        .on('error', reject)
        .save(audioPath);
    });

    jobs[jobId].step = 'Transcribing with AssemblyAI...';
    jobs[jobId].progress = 30;

    // 2. Transcribe with AssemblyAI
    const transcript = await aaiClient.transcripts.transcribe({
      audio: audioPath,
      punctuate: true,
      format_text: true
    });

    if (transcript.status === 'error') {
      throw new Error(`AssemblyAI failed: ${transcript.error}`);
    }

    // Map AssemblyAI response to our internal format
    const normalizedData = {
      text: transcript.text,
      words: transcript.words.map(w => ({
        word: w.text,
        start: w.start / 1000, // Ms to seconds
        end: w.end / 1000
      })),
      segments: []
    };

    // Group sentences as segments for traditional captions
    const sentences = await aaiClient.transcripts.sentences(transcript.id);
    normalizedData.segments = sentences.sentences.map(s => ({
      start: s.start / 1000,
      end: s.end / 1000,
      text: s.text
    }));

    // 3. Store Result
    const videoFileName = `${jobId}${path.extname(req.file.originalname) || '.mp4'}`;
    const preservedPath = path.join('output', videoFileName);
    fs.renameSync(inputPath, preservedPath); 

    jobs[jobId].status = 'completed';
    jobs[jobId].progress = 100;
    jobs[jobId].step = 'Transcription complete!';
    jobs[jobId].transcription = normalizedData;
    jobs[jobId].file = `/output/${videoFileName}`;
    
    fs.unlink(audioPath, () => {});

  } catch (err) {
    console.error('Transcription Error:', err);
    jobs[jobId].status = 'error';
    jobs[jobId].error = err.message;
    if (fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
    if (fs.existsSync(audioPath)) fs.unlink(audioPath, () => {});
  }
});

// AI AUTO-CAPTION GENERATOR: BURN-IN EXPORT
app.post('/api/burn-captions', async (req, res) => {
  const { jobId, originalFile, segments, style } = req.body;
  if (!jobId || !segments) return res.status(400).json({ error: 'Missing data' });

  const exportJobId = uuidv4();
  const inputPath = path.join(__dirname, originalFile.replace('/output/', 'output/'));
  const assPath = path.join('uploads', `${exportJobId}.ass`);
  const outputPath = path.join('output', `${exportJobId}.mp4`);

  jobs[exportJobId] = { status: 'processing', progress: 5, step: 'Generating subtitle styles...' };
  res.json({ jobId: exportJobId });

  try {
    // 1. Generate ASS file content
    const assContent = generateAssContent(segments, style);
    fs.writeFileSync(assPath, assContent);

    // 2. FFmpeg Burn-in
    // On Linux, we just use the relative path or absolute path as is.
    // FFmpeg subtitles filter on Windows needs escaped backslashes and colons.
    let filterPath = assPath;
    if (process.platform === 'win32') {
      filterPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    }
    
    ffmpeg(inputPath)
      .videoFilters(`subtitles='${filterPath}'`) // Added quotes for safety
      .outputOptions([
        '-c:v libx264',
        '-preset fast',
        '-crf 23',
        '-c:a aac', // Convert to AAC to ensure audio track exists properly
        '-map 0:v:0', // Specifically map first video
        '-map 0:a:0?', // Map first audio if it exists
        '-movflags +faststart'
      ])
      .on('progress', (p) => { jobs[exportJobId].progress = 10 + Math.floor((p.percent || 0) * 0.85); })
      .on('end', () => {
        jobs[exportJobId].status = 'completed';
        jobs[exportJobId].progress = 100;
        jobs[exportJobId].file = `/output/${exportJobId}.mp4`;
        fs.unlink(assPath, () => {});
      })
      .on('error', (err) => {
        console.error('Burn-in Error:', err);
        jobs[exportJobId].status = 'error';
        jobs[exportJobId].error = err.message;
      })
      .save(outputPath);

  } catch (err) {
    console.error('Export Error:', err);
    jobs[exportJobId].status = 'error';
    jobs[exportJobId].error = err.message;
  }
});

function generateAssContent(segments, style) {
  const { fontSize = 24, primaryColor = '&H00FFFFFF', outlineColor = '&H00000000', outlineWidth = 2, position = 'bottom' } = style;
  
  // Alignment: 2=Bottom, 6=Top, 10=Middle (approx)
  let alignment = 2;
  if (position === 'top') alignment = 6;
  if (position === 'middle') alignment = 10;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Montserrat,${fontSize * 2},${primaryColor},${primaryColor},${outlineColor},&H80000000,-1,0,0,0,100,100,0,0,1,${outlineWidth},0,${alignment},10,10,100,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = segments.map(s => {
    const start = formatAssTime(s.start);
    const end = formatAssTime(s.end);
    // Simple sanitization
    const text = s.text.replace(/\n/g, ' ').trim();
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
  }).join('\n');

  return header + events;
}

function formatAssTime(seconds) {
  const date = new Date(seconds * 1000);
  const hh = Math.floor(seconds / 3600);
  const mm = date.getUTCMinutes();
  const ss = date.getUTCSeconds();
  const ms = Math.floor(date.getUTCMilliseconds() / 10);
  return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

app.post('/api/auphonic', upload.single('media'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No media provided' });
  const jobId = uuidv4();
  jobs[jobId] = { status: 'processing', progress: 5, step: 'Uploading to Auphonic...' };
  
  // Respond immediately with Job ID so UI can poll
  res.json({ jobId });

  try {
    const fileBuffer = fs.readFileSync(req.file.path);
    const blob = new Blob([fileBuffer], { type: req.file.mimetype || 'audio/mpeg' });

    const formData = new FormData();
    formData.append('input_file', blob, req.file.originalname);
    formData.append('action', 'start');
    
    // Algorithms
    formData.append('denoise', 'true');
    formData.append('denoisemethod', 'speech_isolation');
    formData.append('denoiseamount', '12');
    formData.append('leveler', 'true');
    formData.append('levelerstrength', '80');
    formData.append('filtering', 'true');
    formData.append('loudnesstarget', '-16');
    formData.append('output_files', JSON.stringify([{ format: 'mp3', bitrate: 192 }]));

    const auphonicRes = await fetch('https://auphonic.com/api/simple/productions.json', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${AUPHONIC_KEY}` },
      body: formData
    });

    if (!auphonicRes.ok) {
      const errTxt = await auphonicRes.text();
      throw new Error(`Auphonic API failed: ${errTxt}`);
    }

    const data = await auphonicRes.json();
    console.log('=== AUPHONIC RESPONSE ===');
    console.log(JSON.stringify(data, null, 2));
    const uuid = data.data && data.data.uuid;
    
    if (!uuid) throw new Error('No UUID returned from Auphonic');

    // Log the algorithms status
    if (data.data) {
      console.log('Algorithms applied:', {
        denoise: data.data.algorithms?.denoise,
        leveler: data.data.algorithms?.leveler,
        filtering: data.data.algorithms?.filtering
      });
    }

    jobs[jobId].auphonicUuid = uuid;
    jobs[jobId].step = 'Processing on Auphonic servers...';
    
    fs.unlink(req.file.path, () => {}); // cleanup local file
    
    // Start polling Auphonic
    pollAuphonicJob(jobId, uuid);

  } catch (err) {
    console.error('Auphonic Error:', err);
    jobs[jobId].status = 'error';
    jobs[jobId].error = err.message;
  }
});

app.get('/api/auphonic/status/:id', (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(job);
});

function pollAuphonicJob(jobId, uuid) {
  const intv = setInterval(async () => {
    try {
      const res = await fetch(`https://auphonic.com/api/production/${uuid}.json`, {
        headers: { 'Authorization': `Bearer ${AUPHONIC_KEY}` }
      });
      const data = await res.json();
      const status = data.data.status;
      console.log(`Poll uuid=${uuid} status=${status} status_string=${data.data.status_string}`);
      
      if (status === 3) {
        // Done
        clearInterval(intv);
        console.log('=== AUPHONIC COMPLETED ===');
        console.log('Algorithms:', JSON.stringify(data.data.algorithms, null, 2));
        console.log('Output files:', JSON.stringify(data.data.output_files, null, 2));
        const outUrl = data.data.output_files && data.data.output_files.length ? data.data.output_files[0].download_url + '?bearer_token=' + AUPHONIC_KEY : null;
        jobs[jobId] = { status: 'completed', progress: 100, step: 'Done!', resultUrl: outUrl };
      } else if (status === 2) {
        // Error
        clearInterval(intv);
        jobs[jobId] = { status: 'error', progress: 100, error: 'Auphonic reported failure.' };
      } else {
        // Still processing (status 0, 1, etc.)
        // Just keep waiting. Auphonic doesn't always give precise percentages, so we just stick at 50% visually
        jobs[jobId].progress = 50;
      }
    } catch(err) {
      console.error('Poll error', err);
    }
  }, 5000); // Check every 5s
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`(Environment: ${process.env.NODE_ENV || 'development'})\n`);
});
