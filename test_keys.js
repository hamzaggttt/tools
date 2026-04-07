require('dotenv').config();

const AUPHONIC_KEY = process.env.AUPHONIC_KEY;
const REMOVE_BG_API_KEY = process.env.REMOVE_BG_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

async function testGroq() {
    console.log('\n--- Testing GROQ API ---');
    if (!GROQ_API_KEY) { console.log('❌ GROQ_API_KEY missing'); return; }
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 5
            })
        });
        const data = await res.json();
        if (res.ok) console.log('✅ GROQ API Working!');
        else console.log(`❌ GROQ API Error: ${res.status} ${JSON.stringify(data)}`);
    } catch (e) { console.log(`❌ GROQ Connection Error: ${e.message}`); }
}

async function testRemoveBG() {
    console.log('\n--- Testing Remove.bg API ---');
    if (!REMOVE_BG_API_KEY) { console.log('❌ REMOVE_BG_API_KEY missing'); return; }
    try {
        const res = await fetch('https://api.remove.bg/v1.0/removebg', {
            method: 'HEAD', // Use HEAD to check key without consuming credit
            headers: { 'X-Api-Key': REMOVE_BG_API_KEY }
        });
        if (res.status === 403 || res.status === 401) console.log('❌ Remove.bg API Key INVALID');
        else if (res.status === 405 || res.ok) console.log('✅ Remove.bg API Working (Key valid)!');
        else console.log(`❓ Remove.bg API returned status ${res.status}`);
    } catch (e) { console.log(`❌ Remove.bg Connection Error: ${e.message}`); }
}

async function testAuphonic() {
    console.log('\n--- Testing Auphonic API ---');
    if (!AUPHONIC_KEY) { console.log('❌ AUPHONIC_KEY missing'); return; }
    try {
        const res = await fetch('https://auphonic.com/api/info.json', {
            headers: { 'Authorization': `Bearer ${AUPHONIC_KEY}` }
        });
        const data = await res.json();
        if (res.ok) console.log(`✅ Auphonic API Working! (User: ${data.data.username})`);
        else console.log(`❌ Auphonic API Error: ${res.status} ${JSON.stringify(data)}`);
    } catch (e) { console.log(`❌ Auphonic Connection Error: ${e.message}`); }
}

(async () => {
    await testGroq();
    await testRemoveBG();
    await testAuphonic();
})();
