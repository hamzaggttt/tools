const FormDataNode = require('form-data');
app.post('/api/auphonic', upload.single('media'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No media provided' });
  
  const jobId = uuidv4();
  jobs[jobId] = { status: 'processing', progress: 5, step: 'Uploading to Auphonic...' };
  res.json({ jobId });

  try {
    const tone = req.body.tone || 'natural';
    const fileStream = fs.createReadStream(req.file.path);
    const form = new FormDataNode();
    
    // Auphonic expects multipart/form-data with 'input_file'
    form.append('input_file', fileStream, {
      filename: req.file.originalname,
      contentType: req.file.mimetype || (req.file.originalname.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4')
    });
    
    form.append('action', 'start');
    
    // Algorithm customization based on Tone
    if (tone === 'hard') {
      form.append('denoise', 'true');
      form.append('denoisemethod', 'speech_isolation');
      form.append('denoiseamount', '15'); // Max isolation
      form.append('leveler', 'true');
      form.append('levelerstrength', '95'); // Radio-style compression
      form.append('loudnesstarget', '-14'); // Louder profile
    } else {
      form.append('denoise', 'true');
      form.append('denoisemethod', 'speech_isolation');
      form.append('denoiseamount', '10');
      form.append('leveler', 'true');
      form.append('levelerstrength', '70');
      form.append('loudnesstarget', '-16');
    }
    
    form.append('filtering', 'true');

    // Specify output format dynamically or default to mp3
    const outputFormat = req.file.originalname.endsWith('.mp3') ? 'mp3' : 'mp4';
    form.append('output_files', JSON.stringify([{ format: outputFormat, bitrate: 192 }]));

    const auphonicRes = await fetch('https://auphonic.com/api/simple/productions.json', {
      method: 'POST',
      headers: { 
        'Authorization': `Token ${AUPHONIC_KEY}`, // Using Token instead of Bearer
        ...form.getHeaders()
      },
      body: form
    });

    if (!auphonicRes.ok) {
      const errTxt = await auphonicRes.text();
      console.error(`Auphonic API failed (${auphonicRes.status}):`, errTxt);
      throw new Error(`Auphonic API failed: ${errTxt}`);
    }

    const data = await auphonicRes.json();
    console.log('=== AUPHONIC RESPONSE ===');
    console.log(JSON.stringify(data, null, 2));
    const uuid = data.data && data.data.uuid;
    
    if (!uuid) throw new Error('No UUID returned from Auphonic');

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
