// Quick test: upload a small audio file to Auphonic using axios + form-data
const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const AUPHONIC_KEY = 'w4lcJ5tDBVZGo9OTizVEWCs6MLDXUdWB';

async function test() {
  // Create a tiny valid WAV file (44 bytes header + 100 bytes of silence)
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(136, 4); // file size - 8
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(44100, 24); // sample rate
  header.writeUInt32LE(88200, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(100, 40); // data size
  
  const audioData = Buffer.concat([header, Buffer.alloc(100)]);
  const testPath = path.join(__dirname, 'test_audio.wav');
  fs.writeFileSync(testPath, audioData);

  const form = new FormData();
  form.append('action', 'start');
  form.append('denoise', 'true');
  form.append('denoisemethod', 'speech_isolation');
  form.append('denoiseamount', '12');
  form.append('leveler', 'true');
  form.append('levelerstrength', '80');
  form.append('loudnesstarget', '-16');
  form.append('filtering', 'true');
  form.append('output_files', JSON.stringify([{ format: 'mp3', bitrate: 192 }]));
  form.append('input_file', fs.createReadStream(testPath), {
    filename: 'test_audio.wav',
    contentType: 'audio/wav'
  });

  try {
    const res = await axios.post('https://auphonic.com/api/simple/productions.json', form, {
      headers: {
        'Authorization': `Bearer ${AUPHONIC_KEY}`,
        ...form.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    console.log('Status:', res.status);
    console.log('Production status:', res.data.data?.status, res.data.data?.status_string);
    console.log('Input file:', res.data.data?.input_file);
    console.log('Length:', res.data.data?.length);
    console.log('UUID:', res.data.data?.uuid);
    
    // Cleanup
    fs.unlinkSync(testPath);
  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
    fs.unlinkSync(testPath);
  }
}

test();
