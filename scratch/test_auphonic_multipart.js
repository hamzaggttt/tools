const FormData = require('form-data');
const fs = require('fs');

async function test() {
  const token = 'tF2J2HnmQOLv4Y7zPIJDA8Oq7ZwRNalw';
  const form = new FormData();
  
  // Dummy file content
  form.append('input_file', 'hello world', { filename: 'test.txt', contentType: 'text/plain' });
  form.append('action', 'start');
  
  try {
    const res = await fetch('https://auphonic.com/api/simple/productions.json', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...form.getHeaders()
      },
      body: form
    });
    
    console.log('Status:', res.status);
    console.log('Body:', await res.json());
  } catch (err) {
    console.error(err);
  }
}

test();
