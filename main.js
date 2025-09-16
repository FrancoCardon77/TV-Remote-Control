const { app, BrowserWindow, ipcMain } = require('electron');
const http = require('http');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    resizable: false,
    titleBarStyle: 'default',
    icon: path.join(__dirname, 'assets/icon.png')
  });

  mainWindow.loadFile('index.html');
  
  // Abrir DevTools en desarrollo
  // mainWindow.webContents.openDevTools();
}

// Función para enviar comandos usando HTTP nativo de Node.js
function sendTVCommand(TV_IP, command) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ key: command });
    
    const options = {
      hostname: TV_IP,
      port: 1925,
      path: '/1/input/key',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'Philips-TV-Remote/1.0',
        'Accept': '*/*',
        'Connection': 'close'
      },
      timeout: 5000
    };
    
    console.log(`🚀 ENVIANDO HTTP REQUEST:`);
    console.log(`   - URL: http://${TV_IP}:1925/1/input/key`);
    console.log(`   - Método: POST`);
    console.log(`   - Headers: ${JSON.stringify(options.headers, null, 2)}`);
    console.log(`   - Body: ${postData}`);
    
    const req = http.request(options, (res) => {
      let responseData = '';
      
      console.log(`📡 RESPUESTA HTTP:`);
      console.log(`   - Status: ${res.statusCode} ${res.statusMessage}`);
      console.log(`   - Headers: ${JSON.stringify(res.headers, null, 2)}`);
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        console.log(`   - Body: ${responseData}`);
        
        if (res.statusCode === 200) {
          console.log(`✅ COMANDO ${command} EJECUTADO EXITOSAMENTE`);
          resolve({
            success: true,
            command: command,
            statusCode: res.statusCode,
            response: responseData,
            headers: res.headers
          });
        } else if (res.statusCode === 503) {
          console.error(`❌ TV RECHAZA COMANDO ${command}: Service Unavailable (503)`);
          resolve({
            success: false,
            error: `Service Unavailable (${res.statusCode})`,
            command: command,
            statusCode: res.statusCode,
            response: responseData
          });
        } else {
          console.error(`⚠️ RESPUESTA INESPERADA para ${command}: ${res.statusCode}`);
          resolve({
            success: false,
            error: `HTTP ${res.statusCode}: ${res.statusMessage}`,
            command: command,
            statusCode: res.statusCode,
            response: responseData
          });
        }
      });
    });
    
    req.on('error', (error) => {
      console.error(`❌ ERROR DE RED para ${command}: ${error.message}`);
      resolve({
        success: false,
        error: error.message,
        command: command
      });
    });
    
    req.on('timeout', () => {
      console.error(`⏱️ TIMEOUT para ${command}`);
      req.destroy();
      resolve({
        success: false,
        error: 'Request timeout',
        command: command
      });
    });
    
    // Enviar los datos
    req.write(postData);
    req.end();
  });
}

// Función para verificar conectividad con HTTP nativo
function checkTVConnection(TV_IP) {
  return new Promise((resolve) => {
    const options = {
      hostname: TV_IP,
      port: 1925,
      path: '/1/system',
      method: 'GET',
      headers: {
        'User-Agent': 'Philips-TV-Remote/1.0',
        'Accept': 'application/json',
        'Connection': 'close'
      },
      timeout: 3000
    };
    
    console.log(`🔍 VERIFICANDO CONEXION HTTP: http://${TV_IP}:1925/1/system`);
    
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const systemInfo = JSON.parse(responseData);
            console.log(`✅ TV CONECTADA: ${JSON.stringify(systemInfo, null, 2)}`);
            resolve({
              connected: true,
              ip: TV_IP,
              systemInfo: systemInfo,
              model: systemInfo.name || 'Philips TV',
              version: systemInfo.nettvversion || 'Unknown'
            });
          } catch (e) {
            console.log(`✅ TV RESPONDE pero JSON inválido: ${responseData}`);
            resolve({
              connected: true,
              ip: TV_IP,
              systemInfo: responseData
            });
          }
        } else {
          console.log(`❌ TV responde con status ${res.statusCode}`);
          resolve({
            connected: false,
            ip: TV_IP,
            error: `HTTP ${res.statusCode}: ${res.statusMessage}`
          });
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`❌ ERROR DE CONEXIÓN: ${error.message}`);
      resolve({
        connected: false,
        ip: TV_IP,
        error: error.message
      });
    });
    
    req.on('timeout', () => {
      console.log(`⏱️ TIMEOUT EN CONEXIÓN`);
      req.destroy();
      resolve({
        connected: false,
        ip: TV_IP,
        error: 'Connection timeout'
      });
    });
    
    req.end();
  });
}

// Manejar comandos de TV desde el renderer
ipcMain.handle('send-tv-command', async (event, command) => {
  const TV_IP = "192.168.1.191";
  
  // Pequeño delay para evitar spam
  await new Promise(resolve => setTimeout(resolve, 100));
  
  console.log(`\n📺 PROCESANDO COMANDO: ${command}`);
  
  // Mapear comandos alternativos para Philips
  const commandMap = {
    'Confirm': ['Confirm', 'Ok', 'Select', 'Enter'],
    'Home': ['Home', 'SmartTV'],
    'Netflix': ['Netflix', 'Launch_Netflix'],
    'YouTube': ['YouTube', 'Launch_YouTube']
  };
  
  // Si hay comandos alternativos, probar todos
  const commandsToTry = commandMap[command] || [command];
  
  for (let i = 0; i < commandsToTry.length; i++) {
    const cmd = commandsToTry[i];
    console.log(`\n🔄 INTENTANDO COMANDO ${i + 1}/${commandsToTry.length}: ${cmd}`);
    
    const result = await sendTVCommand(TV_IP, cmd);
    
    if (result.success) {
      console.log(`\n🎉 COMANDO EXITOSO: ${cmd}`);
      return result;
    } else {
      console.log(`\n❌ COMANDO FALLÓ: ${cmd} - ${result.error}`);
    }
    
    // Pequeño delay entre intentos
    if (i < commandsToTry.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  // Si ninguno funcionó, devolver el último resultado
  console.log(`\n💔 TODOS LOS COMANDOS FALLARON para: ${command}`);
  return await sendTVCommand(TV_IP, command);
});

// Verificar conectividad con TV
ipcMain.handle('check-tv-connection', async (event) => {
  const TV_IP = "192.168.1.191";
  return await checkTVConnection(TV_IP);
});

// Descubrir comandos disponibles
ipcMain.handle('discover-commands', async (event) => {
  const TV_IP = "192.168.1.191";
  
  return new Promise((resolve) => {
    const options = {
      hostname: TV_IP,
      port: 1925,
      path: '/1/input/key',
      method: 'GET',
      headers: {
        'User-Agent': 'Philips-TV-Remote/1.0',
        'Accept': 'application/json'
      },
      timeout: 3000
    };
    
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const commands = JSON.parse(responseData);
          resolve({
            success: true,
            availableCommands: commands
          });
        } catch (e) {
          resolve({
            success: false,
            error: 'No se pudo parsear la respuesta de comandos'
          });
        }
      });
    });
    
    req.on('error', (error) => {
      resolve({
        success: false,
        error: error.message
      });
    });
    
    req.end();
  });
});

app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Logs iniciales
console.log('🚀 Electron app iniciada con HTTP nativo');
console.log('📱 Control remoto Philips TV con Node.js HTTP');
console.log(`💻 Plataforma: ${process.platform}`);
console.log(`📁 Directorio: ${process.cwd()}`);
console.log(`🌐 Usando HTTP nativo en lugar de curl`);