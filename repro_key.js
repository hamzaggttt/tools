require('dotenv').config();
const fs = require('fs');
const FormData = require('form-data');

const REMOVE_BG_API_KEY = process.env.REMOVE_BG_API_KEY;

async function testRealPost() {
    console.log('Testing Remove.bg with REAL POST...');
    console.log('Key:', REMOVE_BG_API_KEY);
    
    // Create a tiny 1x1 black pixel png
    const pixelBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const buffer = Buffer.from(pixelBase64, 'base64');
    fs.writeFileSync('pixel.png', buffer);

    const form = new FormData();
    form.append('image_file', fs.createReadStream('pixel.png'));
    form.append('size', 'auto');

    try {
        const response = await fetch('https://api.remove.bg/v1.0/removebg', {
            method: 'POST',
            headers: { 
                'X-Api-Key': REMOVE_BG_API_KEY,
                ...form.getHeaders()
            },
            body: form
        });
        
        const text = await response.text();
        console.log('Status:', response.status);
        console.log('Response Header:', response.headers.get('content-type'));
        
        if (response.ok) {
            console.log('✅ KEY IS VALID!');
        } else {
            console.log('❌ KEY IS INVALID/ERROR');
            console.log('Body:', text);
        }
    } catch (e) {
        console.log('❌ CONNECTION ERROR:', e.message);
    }
}

testRealPost();
