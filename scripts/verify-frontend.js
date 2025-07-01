#!/usr/bin/env node

const { spawn } = require('child_process');
const http = require('http');

const PORT = 3000;
const MAX_RETRIES = 30;
const RETRY_DELAY = 1000;

function checkServer(retries = 0) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${PORT}`, (res) => {
      if (res.statusCode === 200) {
        console.log('✅ Frontend is running successfully');
        resolve(true);
      } else {
        reject(new Error(`Server responded with status ${res.statusCode}`));
      }
    });

    req.on('error', (err) => {
      if (retries < MAX_RETRIES) {
        console.log(`Waiting for server to start... (attempt ${retries + 1}/${MAX_RETRIES})`);
        setTimeout(() => {
          checkServer(retries + 1).then(resolve).catch(reject);
        }, RETRY_DELAY);
      } else {
        reject(new Error('Server failed to start within timeout'));
      }
    });

    req.end();
  });
}

async function verifyFrontend() {
  console.log('Starting development server...');
  
  const devServer = spawn('npm', ['run', 'dev'], {
    stdio: 'pipe',
    shell: true
  });

  let serverOutput = '';
  
  devServer.stdout.on('data', (data) => {
    serverOutput += data.toString();
    if (serverOutput.includes('Ready in')) {
      console.log('Dev server ready signal detected');
    }
  });

  devServer.stderr.on('data', (data) => {
    console.error(`Dev server error: ${data}`);
  });

  try {
    await checkServer();
    console.log('✅ Frontend verification passed!');
    devServer.kill();
    process.exit(0);
  } catch (error) {
    console.error('❌ Frontend verification failed:', error.message);
    devServer.kill();
    process.exit(1);
  }
}

verifyFrontend();