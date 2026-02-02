// Test Supabase connection
const SUPABASE_URL = 'https://lrgwkvmiihatpfiesima.supabase.co';
const SUPABASE_KEY = 'sb_publishable_NCa4zE_gcw-6ns_Cu53yXQ_Y873IfDC';

async function test() {
  console.log('Testing Supabase connection...\n');

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/subscribers`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ email: 'test-' + Date.now() + '@example.com' }),
    });

    console.log('Status:', response.status, response.statusText);

    if (!response.ok) {
      const text = await response.text();
      console.log('Error:', text);
    } else {
      console.log('Success! Supabase is working.');
    }
  } catch (err) {
    console.log('Fetch Error:', err.message);
  }
}

test();
