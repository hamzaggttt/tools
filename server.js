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
const ffmpegPath = process.env.NODE_ENV === 'production' ? 'ffmpeg' : require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);
console.log(`Using FFmpeg path: ${ffmpegPath}`);

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
